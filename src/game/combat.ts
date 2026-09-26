import * as THREE from 'three'
import type { Game, Player } from './Game'
import { disposeObject } from './Game'
import { box, C, makeBoss, makeBot, makeGun, makeTurret, makeZombie, mat, type WorkerRig } from './models'
import type { Station, Upgrade, WeaponSlot } from './types'

/* ------------------------------------------------------------------ */
/* Configuración                                                        */
/* ------------------------------------------------------------------ */

export type WeaponId = 'pistola' | 'subfusil' | 'escopeta'

interface WeaponDef {
  name: string
  key: string
  rate: number
  pellets: number
  spread: number
  speed: number
  price: number
  ammoPack: number
  ammoPrice: number
}

const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistola: { name: 'Pistola', key: '1', rate: 0.26, pellets: 1, spread: 0.04, speed: 26, price: 0, ammoPack: 0, ammoPrice: 0 },
  subfusil: { name: 'Subfusil', key: '2', rate: 0.08, pellets: 1, spread: 0.14, speed: 28, price: 150, ammoPack: 120, ammoPrice: 30 },
  escopeta: { name: 'Escopeta', key: '3', rate: 0.7, pellets: 6, spread: 0.38, speed: 22, price: 180, ammoPack: 24, ammoPrice: 30 },
}
const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[]

const MAX_HP = 100
const KNOCK_TIME = 3
const KNOCK_COST = 50
const BOUNTY = 8
const TURRET_COST = 200
const MAX_TURRETS = 3
const GUARD_COST = 260
const REPAIR_BOT_COST = 150
const MEDKIT_COST = 40

/** Oleadas: primera a los 20 s y luego cada 26 s. */
const FIRST_WAVE = 20
const WAVE_EVERY = 26

type ZKind = 'normal' | 'brute' | 'boss'
const KIND_CODE: ZKind[] = ['normal', 'brute', 'boss']
const SIZE: Record<ZKind, number> = { normal: 1, brute: 1.35, boss: 2.2 }

interface Zombie {
  id: number
  kind: ZKind
  rig: WorkerRig
  hp: number
  maxHp: number
  speed: number
  size: number
  summonT: number
  mode: 'player' | 'machine' | 'thief' | 'flee'
  target: Station | null
  attackT: number
  loot: string | null
  lootMesh: THREE.Mesh | null
  flee: THREE.Vector3
  dying: number
  hitFlash: number
  barBg: THREE.Sprite
  bar: THREE.Sprite
  /** Invitado: posición recibida del anfitrión. */
  net: THREE.Vector3
  netRot: number
}

interface Bullet {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
  /** Solo visual (invitados): no hace daño. */
  visual: boolean
}

interface Shooter {
  group: THREE.Group
  head: THREE.Group
  cooldown: number
  range: number
  rate: number
  owner: string
  net: THREE.Vector3
}

interface CombatSnap {
  z: number[][]
  tu: number[][]
  gd: number[] | null
  rb: number[] | null
  ow: WeaponId[]
  am: Record<WeaponId, number>
  k: number
  w: number
  nw: number
}

const bulletGeo = new THREE.SphereGeometry(0.09, 6, 4)

/**
 * Zombis, armas, vida de los jugadores y robots de ayuda de la tienda.
 * El anfitrión (o el modo solo) simula todo; los invitados solo dibujan.
 */
export class Combat {
  readonly enabled: boolean
  kills = 0
  wave = 0

  private g: Game
  private zombies: Zombie[] = []
  private bullets: Bullet[] = []
  private zombieSeq = 0
  /** Armas y munición son del equipo. */
  private owned = new Set<WeaponId>(['pistola'])
  private ammo: Record<WeaponId, number> = { pistola: Infinity, subfusil: 0, escopeta: 0 }
  private nextWave = FIRST_WAVE
  private turrets: Shooter[] = []
  private guard: Shooter | null = null
  private repairBot: { group: THREE.Group; job: { pos: THREE.Vector3; done: () => void } | null; work: number; net: THREE.Vector3 } | null = null
  private readonly repairHome = new THREE.Vector3(-10.5, 0, 6.5)
  private groanT = 3

  constructor(g: Game, enabled: boolean) {
    this.g = g
    this.enabled = enabled
  }

  /** Más jugadores = más zombis. */
  private get teamFactor() {
    return 1 + 0.6 * (this.g.teamSize - 1)
  }

  /* ---------------------------------------------------------------- */
  /* Armas                                                             */
  /* ---------------------------------------------------------------- */

  /** Pone el modelo del arma en la mano del jugador. */
  equip(p: Player, w: WeaponId) {
    p.weapon = w
    if (p.gun && p.gunKind === w) return
    if (p.gun) {
      p.rig.armR.remove(p.gun)
      disposeObject(p.gun, false)
    }
    p.gun = makeGun(w)
    p.gunKind = w
    p.gun.position.set(0, -0.42, 0.08)
    p.gun.visible = this.enabled
    p.rig.armR.add(p.gun)
  }

  select(p: Player, w: WeaponId, notify: boolean) {
    if (!this.enabled || !this.owned.has(w) || p.weapon === w) return
    if (this.ammo[w] <= 0) {
      if (notify) {
        this.g.toast(`Sin munición para ${WEAPONS[w].name}: cómprala en la tienda (B)`, 'warn')
        this.g.sfx('error')
      }
      return
    }
    this.equip(p, w)
    if (notify) this.g.sfx('click')
  }

  selectByKey(p: Player, key: string) {
    const id = WEAPON_IDS.find((w) => WEAPONS[w].key === key)
    if (id) this.select(p, id, true)
    return !!id
  }

  weapons(p: Player): WeaponSlot[] {
    if (!this.enabled) return []
    return WEAPON_IDS.map((id) => ({
      id,
      name: WEAPONS[id].name,
      key: WEAPONS[id].key,
      ammo: this.ammo[id] === Infinity ? null : this.ammo[id],
      owned: this.owned.has(id),
      active: p.weapon === id,
    }))
  }

  /** Dirección de disparo en el plano del piso. */
  aimDir(p: Player) {
    const d = p.aim.clone().sub(p.pos).setY(0)
    return d.lengthSq() > 0.01 ? d.normalize() : new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing))
  }

  private shoot(p: Player) {
    const def = WEAPONS[p.weapon]
    if (this.ammo[p.weapon] <= 0) {
      this.g.withActor(p, () => this.g.toast(`${def.name} sin munición — cambiando a pistola`, 'warn'))
      this.equip(p, 'pistola')
      return
    }
    this.ammo[p.weapon]--
    p.cooldown = def.rate
    const dir = this.aimDir(p)
    const origin = p.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(dir, 0.7)
    for (let i = 0; i < def.pellets; i++) {
      const a = (Math.random() - 0.5) * def.spread
      const v = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(def.speed)
      this.spawnBullet(origin, v, false)
    }
    this.g.sfx(p.weapon === 'escopeta' ? 'shotgun' : 'shot')
  }

  private spawnBullet(origin: THREE.Vector3, vel: THREE.Vector3, visual: boolean) {
    const mesh = new THREE.Mesh(bulletGeo, mat(0xfde047, 0xfacc15))
    mesh.position.copy(origin)
    this.g.scene.add(mesh)
    this.bullets.push({ mesh, vel, life: 0.9, visual })
    if (!visual) this.g.netBullet(origin, vel)
  }

  /** Invitado: bala que solo se ve. */
  visualBullet(origin: THREE.Vector3, vel: THREE.Vector3) {
    this.spawnBullet(origin, vel, true)
  }

  /* ---------------------------------------------------------------- */
  /* Tienda (armas, defensa y robots)                                  */
  /* ---------------------------------------------------------------- */

  shopItems(p: Player): Upgrade[] {
    const items: Upgrade[] = []
    if (this.enabled) {
      for (const id of ['subfusil', 'escopeta'] as WeaponId[]) {
        const w = WEAPONS[id]
        items.push(
          this.owned.has(id)
            ? { id: `ammo:${id}`, label: `🔸 Munición ${w.name} +${w.ammoPack}`, desc: `El equipo tiene ${this.ammo[id]} balas`, cost: w.ammoPrice, owned: false, category: 'arma', repeatable: true }
            : {
                id: `weapon:${id}`,
                label: id === 'subfusil' ? '🔫 Subfusil' : '💥 Escopeta',
                desc: id === 'subfusil' ? `Ráfaga rapidísima. Incluye ${w.ammoPack} balas` : `6 perdigones por disparo. Incluye ${w.ammoPack} cartuchos`,
                cost: w.price,
                owned: false,
                category: 'arma',
              },
        )
      }
      items.push(
        { id: 'turret', label: `🗼 Torreta robot (${this.turrets.length}/${MAX_TURRETS})`, desc: 'Se instala donde estás y dispara sola a los zombis', cost: TURRET_COST, owned: this.turrets.length >= MAX_TURRETS, category: 'defensa', repeatable: true },
        { id: 'guard', label: '🛡️ Robot guardián', desc: 'Sigue a quien lo compra y dispara', cost: GUARD_COST, owned: !!this.guard, category: 'defensa' },
        { id: 'medkit', label: '❤️ Botiquín', desc: `Recupera 50 de vida (tienes ${Math.round(p.hp)})`, cost: MEDKIT_COST, owned: false, category: 'defensa', repeatable: true },
      )
    }
    items.push({ id: 'repairbot', label: '🔧 Robot reparador', desc: 'Repara solo las máquinas dañadas o averiadas', cost: REPAIR_BOT_COST, owned: !!this.repairBot, category: 'fabrica' })
    return items
  }

  /** Compra hecha por el jugador p. Devuelve true si el id es de esta tienda. */
  buy(p: Player, id: string): boolean {
    const g = this.g
    if (id.startsWith('weapon:')) {
      const w = id.slice(7) as WeaponId
      if (this.owned.has(w) || !g.spend(WEAPONS[w].price)) return true
      this.owned.add(w)
      this.ammo[w] += WEAPONS[w].ammoPack
      this.equip(p, w)
      g.toast(`${WEAPONS[w].name} comprado para el equipo — tecla ${WEAPONS[w].key}`, 'good', true)
      return true
    }
    if (id.startsWith('ammo:')) {
      const w = id.slice(5) as WeaponId
      if (g.spend(WEAPONS[w].ammoPrice)) this.ammo[w] += WEAPONS[w].ammoPack
      return true
    }
    switch (id) {
      case 'turret': {
        if (this.turrets.length >= MAX_TURRETS || !g.spend(TURRET_COST)) return true
        const pos = p.pos.clone().addScaledVector(this.aimDir(p), 1.2)
        this.addTurret(pos.x, pos.z, p.id)
        g.toast('🗼 Torreta instalada', 'good', true)
        return true
      }
      case 'guard': {
        if (this.guard || !g.spend(GUARD_COST)) return true
        this.addGuard(p.pos.x - 1.2, p.pos.z + 1, p.id)
        g.toast(`🛡️ Robot guardián activado para ${p.name}`, 'good', true)
        return true
      }
      case 'medkit':
        if (p.hp >= MAX_HP) g.toast('Tu vida ya está completa', 'info')
        else if (g.spend(MEDKIT_COST)) p.hp = Math.min(MAX_HP, p.hp + 50)
        return true
      case 'repairbot': {
        if (this.repairBot || !g.spend(REPAIR_BOT_COST)) return true
        this.addRepairBot()
        g.toast('🔧 Robot reparador activado: arreglará las máquinas', 'good', true)
        return true
      }
    }
    return false
  }

  private addTurret(x: number, z: number, owner: string) {
    const t = makeTurret()
    t.group.position.set(x, 0, z)
    this.g.scene.add(t.group)
    this.turrets.push({ group: t.group, head: t.head, cooldown: 0, range: 8, rate: 0.4, owner, net: t.group.position.clone() })
  }

  private addGuard(x: number, z: number, owner: string) {
    const b = makeBot(C.blue)
    b.group.position.set(x, 0, z)
    this.g.scene.add(b.group)
    this.guard = { group: b.group, head: b.head, cooldown: 0, range: 7, rate: 0.45, owner, net: b.group.position.clone() }
  }

  private addRepairBot() {
    const b = makeBot(C.orange)
    b.group.position.copy(this.repairHome)
    this.g.scene.add(b.group)
    this.repairBot = { group: b.group, job: null, work: 0, net: this.repairHome.clone() }
  }

  /* ---------------------------------------------------------------- */
  /* Vida de los jugadores                                             */
  /* ---------------------------------------------------------------- */

  private hurt(p: Player, amount: number) {
    if (p.knocked > 0) return
    p.hp -= amount
    p.lastHurt = this.g.elapsed
    p.hurtAt = this.g.elapsed
    this.g.sfx('hurt')
    if (p.hp <= 0) {
      p.hp = 0
      p.knocked = KNOCK_TIME
      p.firing = false
      this.g.withActor(p, () => {
        if (this.g.held) this.g.consumeHeld()
        this.g.loseMoney(KNOCK_COST)
        this.g.toast(`🧟 ¡${this.g.multiplayer ? p.name + ' fue derribado' : 'Te derribaron'}! Se pierde lo que llevaba y $${KNOCK_COST}`, 'bad', true)
      })
    }
  }

  private alivePlayers() {
    return this.g.players.filter((p) => p.knocked <= 0)
  }

  private nearestPlayer(from: THREE.Vector3): Player | null {
    let best: Player | null = null
    let bestD = Infinity
    for (const p of this.alivePlayers()) {
      const d = p.pos.distanceTo(from)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  /* ---------------------------------------------------------------- */
  /* Bucle del anfitrión                                               */
  /* ---------------------------------------------------------------- */

  update(dt: number, running: boolean) {
    const g = this.g
    for (const p of g.players) {
      if (p.knocked > 0) {
        p.knocked -= dt
        if (p.knocked <= 0) {
          p.knocked = 0
          p.hp = MAX_HP
          g.respawn(p)
          g.withActor(p, () => g.toast('Te levantaste. ¡A seguir produciendo!', 'info'))
        }
      } else if (g.elapsed - p.lastHurt > 5 && p.hp < MAX_HP) {
        p.hp = Math.min(MAX_HP, p.hp + 4 * dt)
      }
      // Disparo: clic = un tiro, mantener = ráfaga
      p.cooldown -= dt
      if (this.enabled && running && p.firing && p.knocked <= 0 && p.cooldown <= 0) this.shoot(p)
    }

    if (this.enabled && running && g.elapsed >= this.nextWave) this.spawnWave()
    this.updateZombies(dt, running)
    this.updateBullets(dt)
    this.updateShooters(dt)
    this.updateRepairBot(dt)
  }

  nextWaveIn() {
    return Math.max(0, this.nextWave - this.g.elapsed)
  }

  get alive() {
    return this.zombies.filter((z) => z.dying < 0).length
  }

  /** Al terminar el nivel los zombis caen. */
  clear() {
    for (const z of this.zombies) if (z.dying < 0) z.dying = 0.8
    this.nextWave = Infinity
  }

  private spawnWave() {
    this.wave++
    this.nextWave = this.g.elapsed + WAVE_EVERY
    const scale = this.g.level.zombieScale * this.teamFactor
    const count = Math.round(Math.min(9, 1 + this.wave) * scale)
    const brutes = this.wave >= 3 ? Math.round(scale) : 0
    for (let i = 0; i < count; i++) this.spawnZombie(i < brutes ? 'brute' : 'normal')
    this.g.toast(`🧟 ¡Oleada ${this.wave}! Llegan ${count} zombis — apunta con el mouse y dispara`, 'bad', true)
    this.g.sfx('groan')
  }

  /** Jefes finales: zombis gigantes que invocan ayudantes. */
  spawnBosses(n: number) {
    if (!this.enabled) return
    for (let i = 0; i < n; i++) this.spawnZombie('boss')
    this.g.toast(`👑 ¡Llegaron ${n} JEFES FINALES! Derrótalos para terminar el nivel`, 'bad', true)
    this.g.sfx('alarm')
    this.g.sfx('groan')
  }

  get bossesAlive() {
    return this.zombies.filter((z) => z.kind === 'boss' && z.dying < 0).length
  }

  bosses() {
    return this.zombies.filter((z) => z.kind === 'boss' && z.dying < 0).map((z) => ({ hp: Math.max(0, Math.ceil(z.hp)), max: z.maxHp }))
  }

  firstBoss(): THREE.Object3D | null {
    return this.zombies.find((z) => z.kind === 'boss' && z.dying < 0)?.rig.root ?? null
  }

  /** Crea el modelo y la barra de vida de un zombi. */
  private createZombie(id: number, kind: ZKind, pos: THREE.Vector3, maxHp: number): Zombie {
    const g = this.g
    const rig = kind === 'boss' ? makeBoss() : makeZombie(kind === 'brute')
    rig.root.position.copy(pos)
    g.scene.add(rig.root)
    const wide = kind === 'boss' ? 2 : 1
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1e293b, depthTest: false }))
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xef4444, depthTest: false }))
    barBg.scale.set(0.9 * wide, 0.12, 1)
    bar.scale.set(0.84 * wide, 0.08, 1)
    barBg.renderOrder = bar.renderOrder = 12
    g.scene.add(barBg, bar)
    const z: Zombie = {
      id,
      kind,
      rig,
      hp: maxHp,
      maxHp,
      speed: kind === 'boss' ? 1.25 : kind === 'brute' ? 1.1 : 1.5 + Math.random() * 0.5,
      size: SIZE[kind],
      summonT: 8,
      mode: 'player',
      target: null,
      attackT: 0,
      loot: null,
      lootMesh: null,
      flee: pos.clone(),
      dying: -1,
      hitFlash: 0,
      barBg,
      bar,
      net: pos.clone(),
      netRot: 0,
    }
    this.zombies.push(z)
    return z
  }

  private spawnZombie(kind: ZKind) {
    const g = this.g
    const side = Math.floor(Math.random() * 3)
    const pos =
      side === 0
        ? new THREE.Vector3(-14.5, 0, -5 + Math.random() * 12)
        : side === 1
          ? new THREE.Vector3(14.5, 0, -5 + Math.random() * 12)
          : new THREE.Vector3(-10 + Math.random() * 20, 0, 10.5)
    const maxHp = kind === 'boss' ? Math.round(90 * (1 + 0.5 * (g.teamSize - 1))) : kind === 'brute' ? 12 : 4
    const z = this.createZombie(++this.zombieSeq, kind, pos, maxHp)

    if (kind === 'boss') return
    const machines = g.allStations.filter((s) => (s.machine || s.onDamage) && !g.isDamaged(s))
    const loot = g.allStations.filter((s) => s.steal)
    const r = Math.random()
    if (r < 0.3 && machines.length) {
      z.mode = 'machine'
      z.target = machines[Math.floor(Math.random() * machines.length)]
    } else if (r < 0.55 && loot.length) {
      z.mode = 'thief'
      z.target = loot[Math.floor(Math.random() * loot.length)]
    }
  }

  private updateBars(z: Zombie) {
    const root = z.rig.root
    const barW = 0.84 * (z.kind === 'boss' ? 2 : 1)
    z.barBg.position.set(root.position.x, 0.4 + 1.45 * z.size, root.position.z)
    z.bar.position.copy(z.barBg.position)
    const ratio = Math.max(0, z.hp / z.maxHp)
    z.bar.scale.x = barW * ratio
    z.bar.position.x -= (barW * (1 - ratio)) / 2
    z.barBg.visible = z.bar.visible = (z.kind === 'boss' || z.hp < z.maxHp) && z.dying < 0
  }

  private animateDeath(z: Zombie, i: number, dt: number) {
    z.dying -= dt
    const root = z.rig.root
    root.rotation.x = Math.max(-Math.PI / 2, root.rotation.x - dt * 5)
    root.position.y -= dt * 0.3
    if (z.dying <= 0) this.removeZombie(i)
  }

  private updateZombies(dt: number, running: boolean) {
    const g = this.g
    this.groanT -= dt
    if (this.groanT <= 0 && this.alive > 0) {
      this.groanT = 4 + Math.random() * 4
      g.sfx('groan')
    }
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i]
      const root = z.rig.root
      this.updateBars(z)
      if (z.dying >= 0) {
        this.animateDeath(z, i, dt)
        continue
      }
      if (!running) continue

      if (z.hitFlash > 0) {
        z.hitFlash -= dt
        root.scale.setScalar(z.size * (1 + Math.max(0, z.hitFlash)))
      }

      // El jefe invoca zombis ayudantes cada cierto tiempo
      if (z.kind === 'boss') {
        z.summonT -= dt
        if (z.summonT <= 0) {
          z.summonT = 10
          for (let k = 0; k < 2; k++) this.spawnZombie('normal')
          g.toast('👑 El jefe llamó a más zombis', 'warn', true)
          g.sfx('groan')
        }
      }

      // Destino según su intención
      const prey = this.nearestPlayer(root.position)
      let goal: THREE.Vector3
      if (z.mode === 'flee') goal = z.flee
      else if (z.mode === 'player' || !z.target) goal = prey?.pos ?? new THREE.Vector3(0, 0, 1)
      else goal = z.target.object.position

      const to = goal.clone().sub(root.position).setY(0)
      const dist = to.length()
      const reach = z.mode === 'player' ? (z.kind === 'boss' ? 1.6 : 0.9) : z.mode === 'flee' ? 0.3 : this.edgeDist(z.target!, root.position)
      const close = z.mode === 'player' ? !!prey && dist < reach : z.mode === 'flee' ? dist < 0.5 : reach < 0.65

      if (!close) {
        to.normalize()
        root.position.addScaledVector(to, z.speed * dt)
        root.rotation.y = Math.atan2(to.x, to.z)
        this.walk(z, i)
        z.attackT = 0
      } else {
        z.attackT += dt
        z.rig.armL.rotation.x = -1.45 + Math.sin(g.elapsed * 12) * 0.3
        this.act(z, prey)
      }
      if (z.mode !== 'flee') this.collide(root.position)
      if (z.lootMesh) z.lootMesh.position.set(root.position.x, 0.6 + 1.45 * z.size, root.position.z)

      // Escapó con lo robado
      if (z.mode === 'flee' && close) {
        g.reward(-10, `Desperdicio: un zombi se robó ${z.loot}`, 'waste')
        this.removeZombie(i)
      }
    }
    // Separación entre zombis
    for (let a = 0; a < this.zombies.length; a++) {
      for (let b = a + 1; b < this.zombies.length; b++) {
        const pa = this.zombies[a].rig.root.position
        const pb = this.zombies[b].rig.root.position
        const d = Math.hypot(pa.x - pb.x, pa.z - pb.z)
        if (d > 0 && d < 0.7) {
          const push = (0.7 - d) / 2
          const nx = (pa.x - pb.x) / d
          const nz = (pa.z - pb.z) / d
          pa.x += nx * push
          pa.z += nz * push
          pb.x -= nx * push
          pb.z -= nz * push
        }
      }
    }
  }

  private walk(z: Zombie, i: number) {
    const s = Math.sin(this.g.elapsed * 7 + i) * 0.5
    z.rig.legL.rotation.x = s
    z.rig.legR.rotation.x = -s
  }

  private act(z: Zombie, prey: Player | null) {
    const g = this.g
    if (z.mode === 'player') {
      if (prey && z.attackT >= (z.kind === 'boss' ? 1.2 : 0.9)) {
        z.attackT = 0
        this.hurt(prey, z.kind === 'boss' ? 25 : z.kind === 'brute' ? 20 : 10)
      }
    } else if (z.mode === 'machine' && z.target) {
      if (g.isDamaged(z.target)) {
        z.mode = 'player'
      } else if (z.attackT >= 3) {
        g.damageStation(z.target)
        z.mode = 'player'
        z.attackT = 0
      }
    } else if (z.mode === 'thief' && z.target && z.attackT >= 1) {
      const loot = z.target.steal?.(g) ?? null
      if (!loot) {
        z.mode = 'player'
        return
      }
      z.loot = loot
      this.addLoot(z)
      g.toast(`🧟 ¡Un zombi se lleva ${loot}! Dispárale antes de que escape`, 'warn', true)
      const p = z.rig.root.position
      z.flee = new THREE.Vector3(p.x < 0 ? -15 : 15, 0, p.z)
      z.mode = 'flee'
      z.speed *= 1.2
    }
  }

  private addLoot(z: Zombie) {
    if (z.lootMesh) return
    z.lootMesh = box(0.45, 0.35, 0.45, C.cardboard)
    this.g.scene.add(z.lootMesh)
  }

  private edgeDist(st: Station, p: THREE.Vector3) {
    const c = st.object.position
    const [w, d] = st.size
    const cx = THREE.MathUtils.clamp(p.x, c.x - w / 2, c.x + w / 2)
    const cz = THREE.MathUtils.clamp(p.z, c.z - d / 2, c.z + d / 2)
    return Math.hypot(p.x - cx, p.z - cz) - 0.35
  }

  private collide(p: THREE.Vector3) {
    for (const st of this.g.allStations) {
      const [w, d] = st.size
      const c = st.object.position
      const cx = THREE.MathUtils.clamp(p.x, c.x - w / 2, c.x + w / 2)
      const cz = THREE.MathUtils.clamp(p.z, c.z - d / 2, c.z + d / 2)
      const dx = p.x - cx
      const dz = p.z - cz
      const dist = Math.hypot(dx, dz)
      if (dist < 0.35 && dist > 1e-4) {
        p.x = cx + (dx / dist) * 0.35
        p.z = cz + (dz / dist) * 0.35
      }
    }
  }

  private damageZombie(z: Zombie, amount: number, dir: THREE.Vector3) {
    const g = this.g
    z.hp -= amount
    z.hitFlash = 0.15
    z.rig.root.position.addScaledVector(dir.clone().setY(0).normalize(), z.kind === 'boss' ? 0 : z.kind === 'brute' ? 0.05 : 0.15)
    g.sfx('hit')
    if (z.hp <= 0) {
      z.dying = 0.8
      this.kills++
      g.sfx('kill')
      const boss = z.kind === 'boss'
      g.earn(boss ? 150 : z.kind === 'brute' ? BOUNTY * 3 : BOUNTY, z.rig.root.position.clone().setY(2), !boss)
      if (boss) g.reward(25, '👑 ¡Jefe zombi derrotado!', 'correct', { at: z.rig.root.position.clone().setY(3.5) })
      if (z.loot) g.toast(`✅ Recuperaste ${z.loot}`, 'good', true)
    }
  }

  private removeZombie(i: number) {
    const z = this.zombies[i]
    const g = this.g
    g.scene.remove(z.rig.root, z.barBg, z.bar)
    disposeObject(z.rig.root, false)
    z.bar.material.dispose()
    z.barBg.material.dispose()
    if (z.lootMesh) {
      g.scene.remove(z.lootMesh)
      z.lootMesh.geometry.dispose()
    }
    this.zombies.splice(i, 1)
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.life -= dt
      b.mesh.position.addScaledVector(b.vel, dt)
      let hit = false
      for (const z of this.zombies) {
        if (z.dying >= 0) continue
        const p = z.rig.root.position
        const r = z.kind === 'boss' ? 1.1 : z.kind === 'brute' ? 0.75 : 0.5
        if (Math.hypot(p.x - b.mesh.position.x, p.z - b.mesh.position.z) < r) {
          if (!b.visual) this.damageZombie(z, 1, b.vel)
          hit = true
          break
        }
      }
      if (hit || b.life <= 0) {
        this.g.scene.remove(b.mesh)
        this.bullets.splice(i, 1)
      }
    }
  }

  private nearestZombie(from: THREE.Vector3, range: number) {
    let best: Zombie | null = null
    let bestD = range
    for (const z of this.zombies) {
      if (z.dying >= 0) continue
      const d = z.rig.root.position.distanceTo(from)
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    return best
  }

  private updateShooters(dt: number) {
    const g = this.g
    if (this.guard) {
      const owner = g.players.find((p) => p.id === this.guard!.owner) ?? g.players[0]
      const home = owner.pos.clone().add(new THREE.Vector3(-1.3, 0, 1.1))
      const p = this.guard.group.position
      p.lerp(home, Math.min(1, dt * 2.5))
      p.y = 0
    }
    for (const s of [...this.turrets, ...(this.guard ? [this.guard] : [])]) {
      s.cooldown -= dt
      const origin = s.group.position.clone().setY(1.05)
      const z = this.nearestZombie(origin, s.range)
      if (!z) continue
      const dir = z.rig.root.position.clone().setY(1.05).sub(origin).setY(0).normalize()
      s.head.rotation.y = Math.atan2(dir.x, dir.z) - s.group.rotation.y
      if (s.cooldown <= 0) {
        s.cooldown = s.rate
        this.spawnBullet(origin.clone().addScaledVector(dir, 0.6), dir.multiplyScalar(24), false)
        g.sfx('shot')
      }
    }
  }

  private updateRepairBot(dt: number) {
    const bot = this.repairBot
    if (!bot) return
    const g = this.g
    if (!bot.job) {
      const jobs = [
        ...g.allStations.filter((s) => g.isDamaged(s)).map((s) => ({ pos: s.object.position.clone().add(new THREE.Vector3(0, 0, s.size[1] / 2 + 0.6)), done: () => g.repairStation(s) })),
        ...g.level.repairTargets(g).map((t) => ({ pos: t.pos, done: t.repair })),
      ]
      bot.job = jobs[0] ?? null
      bot.work = 0
    }
    const goal = bot.job?.pos ?? this.repairHome
    const p = bot.group.position
    const to = goal.clone().sub(p).setY(0)
    const dist = to.length()
    if (dist > 0.15) {
      to.normalize()
      p.addScaledVector(to, Math.min(dist, dt * 3.5))
      bot.group.rotation.y = Math.atan2(to.x, to.z)
    } else if (bot.job) {
      bot.work += dt
      bot.group.rotation.y += dt * 8
      if (bot.work >= 3) {
        bot.job.done()
        bot.job = null
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sincronización (anfitrión → invitados)                            */
  /* ---------------------------------------------------------------- */

  snapshot(): CombatSnap {
    const r = (v: number) => Math.round(v * 100) / 100
    return {
      z: this.zombies.map((z) => [z.id, KIND_CODE.indexOf(z.kind), r(z.rig.root.position.x), r(z.rig.root.position.z), r(z.rig.root.rotation.y), Math.ceil(z.hp), z.maxHp, z.dying >= 0 ? 1 : 0, z.loot ? 1 : 0]),
      tu: this.turrets.map((t) => [r(t.group.position.x), r(t.group.position.z), r(t.head.rotation.y)]),
      gd: this.guard ? [r(this.guard.group.position.x), r(this.guard.group.position.z), r(this.guard.head.rotation.y)] : null,
      rb: this.repairBot ? [r(this.repairBot.group.position.x), r(this.repairBot.group.position.z), r(this.repairBot.group.rotation.y)] : null,
      ow: [...this.owned],
      am: { ...this.ammo, pistola: -1 },
      k: this.kills,
      w: this.wave,
      nw: this.nextWave === Infinity ? -1 : this.nextWaveIn(),
    }
  }

  restore(raw: unknown) {
    const s = raw as CombatSnap
    const g = this.g
    this.kills = s.k
    this.wave = s.w
    this.nextWave = s.nw < 0 ? Infinity : g.elapsed + s.nw
    this.owned = new Set(s.ow)
    this.ammo = { ...s.am, pistola: Infinity }

    const seen = new Set<number>()
    for (const [id, kind, x, z, ry, hp, max, dying, loot] of s.z) {
      seen.add(id)
      let zb = this.zombies.find((q) => q.id === id)
      if (!zb) zb = this.createZombie(id, KIND_CODE[kind], new THREE.Vector3(x, 0, z), max)
      if (hp < zb.hp) zb.hitFlash = 0.15
      zb.hp = hp
      zb.net.set(x, 0, z)
      zb.netRot = ry
      if (dying && zb.dying < 0) zb.dying = 0.8
      if (loot) this.addLoot(zb)
    }
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i]
      if (!seen.has(z.id) && z.dying < 0) this.removeZombie(i)
    }

    s.tu.forEach(([x, z, hr], i) => {
      if (!this.turrets[i]) this.addTurret(x, z, '')
      this.turrets[i].head.rotation.y = hr
    })
    if (s.gd) {
      if (!this.guard) this.addGuard(s.gd[0], s.gd[1], '')
      this.guard!.net.set(s.gd[0], 0, s.gd[1])
      this.guard!.head.rotation.y = s.gd[2]
    }
    if (s.rb) {
      if (!this.repairBot) this.addRepairBot()
      this.repairBot!.net.set(s.rb[0], 0, s.rb[1])
      this.repairBot!.group.rotation.y = s.rb[2]
    }
  }

  /** Invitado: suaviza y anima lo que envió el anfitrión. */
  updateView(dt: number) {
    const k = Math.min(1, dt * 10)
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i]
      const root = z.rig.root
      this.updateBars(z)
      if (z.dying >= 0) {
        this.animateDeath(z, i, dt)
        continue
      }
      const moving = root.position.distanceToSquared(z.net) > 0.0004
      root.position.lerp(z.net, k)
      let diff = z.netRot - root.rotation.y
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      root.rotation.y += diff * k
      if (moving) this.walk(z, i)
      if (z.hitFlash > 0) {
        z.hitFlash -= dt
        root.scale.setScalar(z.size * (1 + Math.max(0, z.hitFlash)))
      }
      if (z.lootMesh) z.lootMesh.position.set(root.position.x, 0.6 + 1.45 * z.size, root.position.z)
    }
    this.updateBullets(dt)
    if (this.guard) this.guard.group.position.lerp(this.guard.net, k)
    if (this.repairBot) this.repairBot.group.position.lerp(this.repairBot.net, k)
  }
}
