import * as THREE from 'three'
import type { Game } from './Game'
import { disposeObject } from './Game'
import { box, C, makeBoss, makeBot, makeGun, makeTurret, makeZombie, mat, type WorkerRig } from './models'
import type { Station, Upgrade, WeaponSlot } from './types'

/* ------------------------------------------------------------------ */
/* Configuración                                                        */
/* ------------------------------------------------------------------ */

type WeaponId = 'pistola' | 'subfusil' | 'escopeta'

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

interface Zombie {
  rig: WorkerRig
  hp: number
  maxHp: number
  speed: number
  brute: boolean
  boss: boolean
  /** Escala del modelo (1 normal, 1.35 grande, 2.2 jefe). */
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
}

interface Bullet {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
}

interface Shooter {
  group: THREE.Group
  head: THREE.Group
  cooldown: number
  range: number
  rate: number
}

const bulletGeo = new THREE.SphereGeometry(0.09, 6, 4)

/**
 * Zombis, armas del jugador, vida y robots de ayuda que se compran en la tienda.
 */
export class Combat {
  readonly enabled: boolean
  hp = MAX_HP
  knocked = 0
  hurtAt = -10
  kills = 0
  wave = 0
  firing = false
  readonly aim = new THREE.Vector3(0, 0, -5)

  private g: Game
  private zombies: Zombie[] = []
  private bullets: Bullet[] = []
  private weapon: WeaponId = 'pistola'
  private owned = new Set<WeaponId>(['pistola'])
  private ammo: Record<WeaponId, number> = { pistola: Infinity, subfusil: 0, escopeta: 0 }
  private cooldown = 0
  private nextWave = FIRST_WAVE
  private lastHurt = -10
  private gun: THREE.Group
  private turrets: Shooter[] = []
  private guard: Shooter | null = null
  private repairBot: { group: THREE.Group; job: { pos: THREE.Vector3; done: () => void } | null; work: number } | null = null
  private readonly repairHome = new THREE.Vector3(-10.5, 0, 6.5)
  private groanT = 3

  constructor(g: Game, enabled: boolean) {
    this.g = g
    this.enabled = enabled
    this.gun = makeGun('pistola')
    this.gun.position.set(0, -0.42, 0.08)
    this.gun.visible = enabled
    g.rig.armR.add(this.gun)
  }

  /* ---------------------------------------------------------------- */
  /* Armas                                                             */
  /* ---------------------------------------------------------------- */

  select(id: string) {
    const w = id as WeaponId
    if (!this.enabled || !this.owned.has(w) || this.weapon === w) return
    if (this.ammo[w] <= 0) {
      this.g.toast(`Sin munición para ${WEAPONS[w].name}: cómprala en la tienda (B)`, 'warn')
      this.g.sfx('error')
      return
    }
    this.weapon = w
    this.g.rig.armR.remove(this.gun)
    disposeObject(this.gun, false)
    this.gun = makeGun(w)
    this.gun.position.set(0, -0.42, 0.08)
    this.g.rig.armR.add(this.gun)
    this.g.sfx('click')
  }

  selectByKey(key: string) {
    const id = WEAPON_IDS.find((w) => WEAPONS[w].key === key)
    if (id) this.select(id)
    return !!id
  }

  weapons(): WeaponSlot[] {
    if (!this.enabled) return []
    return WEAPON_IDS.map((id) => ({
      id,
      name: WEAPONS[id].name,
      key: WEAPONS[id].key,
      ammo: this.ammo[id] === Infinity ? null : this.ammo[id],
      owned: this.owned.has(id),
      active: this.weapon === id,
    }))
  }

  /** Dirección de disparo en el plano del piso. */
  aimDir() {
    const d = this.aim.clone().sub(this.g.playerPos).setY(0)
    return d.lengthSq() > 0.01 ? d.normalize() : new THREE.Vector3(0, 0, -1)
  }

  private shoot() {
    const def = WEAPONS[this.weapon]
    if (this.ammo[this.weapon] <= 0) {
      this.g.toast(`${def.name} sin munición — cambiando a pistola`, 'warn')
      this.select('pistola')
      return
    }
    this.ammo[this.weapon]--
    this.cooldown = def.rate
    const dir = this.aimDir()
    const origin = this.g.playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(dir, 0.7)
    for (let i = 0; i < def.pellets; i++) {
      const a = (Math.random() - 0.5) * def.spread
      const v = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(def.speed)
      this.spawnBullet(origin, v)
    }
    this.g.sfx(this.weapon === 'escopeta' ? 'shotgun' : 'shot')
  }

  private spawnBullet(origin: THREE.Vector3, vel: THREE.Vector3) {
    const mesh = new THREE.Mesh(bulletGeo, mat(0xfde047, 0xfacc15))
    mesh.position.copy(origin)
    this.g.scene.add(mesh)
    this.bullets.push({ mesh, vel, life: 0.9 })
  }

  /* ---------------------------------------------------------------- */
  /* Tienda (armas, defensa y robots)                                  */
  /* ---------------------------------------------------------------- */

  shopItems(): Upgrade[] {
    const items: Upgrade[] = []
    if (this.enabled) {
      for (const id of ['subfusil', 'escopeta'] as WeaponId[]) {
        const w = WEAPONS[id]
        items.push(
          this.owned.has(id)
            ? { id: `ammo:${id}`, label: `🔸 Munición ${w.name} +${w.ammoPack}`, desc: `Tienes ${this.ammo[id]} balas`, cost: w.ammoPrice, owned: false, category: 'arma', repeatable: true }
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
        { id: 'guard', label: '🛡️ Robot guardián', desc: 'Te sigue y te protege disparando', cost: GUARD_COST, owned: !!this.guard, category: 'defensa' },
        { id: 'medkit', label: '❤️ Botiquín', desc: 'Recupera 50 de vida', cost: MEDKIT_COST, owned: false, category: 'defensa', repeatable: true },
      )
    }
    items.push({ id: 'repairbot', label: '🔧 Robot reparador', desc: 'Repara solo las máquinas dañadas o averiadas', cost: REPAIR_BOT_COST, owned: !!this.repairBot, category: 'fabrica' })
    return items
  }

  /** Devuelve true si el id pertenece a esta tienda. */
  buy(id: string): boolean {
    const g = this.g
    if (id.startsWith('weapon:')) {
      const w = id.slice(7) as WeaponId
      if (this.owned.has(w) || !g.spend(WEAPONS[w].price)) return true
      this.owned.add(w)
      this.ammo[w] += WEAPONS[w].ammoPack
      this.select(w)
      g.toast(`${WEAPONS[w].name} comprado — tecla ${WEAPONS[w].key} para usarlo`, 'good')
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
        const t = makeTurret()
        const p = g.playerPos.clone().addScaledVector(this.aimDir(), 1.2)
        t.group.position.set(p.x, 0, p.z)
        g.scene.add(t.group)
        this.turrets.push({ group: t.group, head: t.head, cooldown: 0, range: 8, rate: 0.4 })
        g.toast('🗼 Torreta instalada', 'good')
        return true
      }
      case 'guard': {
        if (this.guard || !g.spend(GUARD_COST)) return true
        const b = makeBot(C.blue)
        b.group.position.copy(g.playerPos).add(new THREE.Vector3(-1.2, 0, 1))
        g.scene.add(b.group)
        this.guard = { group: b.group, head: b.head, cooldown: 0, range: 7, rate: 0.45 }
        g.toast('🛡️ Robot guardián activado', 'good')
        return true
      }
      case 'medkit':
        if (this.hp >= MAX_HP) g.toast('Tu vida ya está completa', 'info')
        else if (g.spend(MEDKIT_COST)) this.hp = Math.min(MAX_HP, this.hp + 50)
        return true
      case 'repairbot': {
        if (this.repairBot || !g.spend(REPAIR_BOT_COST)) return true
        const b = makeBot(C.orange)
        b.group.position.copy(this.repairHome)
        g.scene.add(b.group)
        this.repairBot = { group: b.group, job: null, work: 0 }
        g.toast('🔧 Robot reparador activado: arreglará las máquinas por ti', 'good')
        return true
      }
    }
    return false
  }

  /* ---------------------------------------------------------------- */
  /* Vida del jugador                                                  */
  /* ---------------------------------------------------------------- */

  private hurt(amount: number) {
    if (this.knocked > 0) return
    this.hp -= amount
    this.lastHurt = this.g.elapsed
    this.hurtAt = this.g.elapsed
    this.g.sfx('hurt')
    if (this.hp <= 0) {
      this.hp = 0
      this.knocked = KNOCK_TIME
      this.firing = false
      if (this.g.held) this.g.consumeHeld()
      this.g.loseMoney(KNOCK_COST)
      this.g.toast(`🧟 ¡Te derribaron! Pierdes lo que llevabas y $${KNOCK_COST}`, 'bad')
    }
  }

  /* ---------------------------------------------------------------- */
  /* Bucle                                                             */
  /* ---------------------------------------------------------------- */

  update(dt: number, running: boolean) {
    const g = this.g
    if (this.knocked > 0) {
      this.knocked -= dt
      g.rig.root.rotation.x = -Math.PI / 2
      g.rig.root.position.y = 0.3
      if (this.knocked <= 0) {
        g.rig.root.rotation.x = 0
        g.rig.root.position.y = 0
        g.playerPos.set(0, 0, 3.5)
        this.hp = MAX_HP
        g.toast('Te levantaste. ¡A seguir produciendo!', 'info')
      }
    } else if (g.elapsed - this.lastHurt > 5 && this.hp < MAX_HP) {
      this.hp = Math.min(MAX_HP, this.hp + 4 * dt)
    }

    // Disparo: clic = un tiro, mantener = ráfaga
    this.cooldown -= dt
    if (this.enabled && running && this.firing && this.knocked <= 0 && this.cooldown <= 0) this.shoot()
    g.rig.armR.rotation.x = this.enabled && this.firing && this.knocked <= 0 ? -1.5 : g.rig.armR.rotation.x

    if (this.enabled && running) {
      if (g.elapsed >= this.nextWave) this.spawnWave()
    }
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

  /** Al terminar el nivel los zombis huyen. */
  clear() {
    for (const z of this.zombies) if (z.dying < 0) z.dying = 0.8
    this.nextWave = Infinity
  }

  private spawnWave() {
    this.wave++
    this.nextWave = this.g.elapsed + WAVE_EVERY
    const scale = this.g.level.zombieScale
    const count = Math.min(9 * scale, (1 + this.wave) * scale)
    const brutes = this.wave >= 3 ? scale : 0
    for (let i = 0; i < count; i++) this.spawnZombie(i < brutes ? 'brute' : 'normal')
    this.g.toast(`🧟 ¡Oleada ${this.wave}! Llegan ${count} zombis — apunta con el mouse y dispara`, 'bad')
    this.g.sfx('groan')
  }

  /** Jefes finales: zombis gigantes que invocan ayudantes. */
  spawnBosses(n: number) {
    if (!this.enabled) return
    for (let i = 0; i < n; i++) this.spawnZombie('boss')
    this.g.toast(`👑 ¡Llegaron ${n} JEFES FINALES! Derrótalos para terminar el nivel`, 'bad')
    this.g.sfx('alarm')
    this.g.sfx('groan')
  }

  get bossesAlive() {
    return this.zombies.filter((z) => z.boss && z.dying < 0).length
  }

  bosses() {
    return this.zombies.filter((z) => z.boss && z.dying < 0).map((z) => ({ hp: Math.max(0, Math.ceil(z.hp)), max: z.maxHp }))
  }

  firstBoss(): THREE.Object3D | null {
    return this.zombies.find((z) => z.boss && z.dying < 0)?.rig.root ?? null
  }

  private spawnZombie(kind: 'normal' | 'brute' | 'boss') {
    const brute = kind === 'brute'
    const boss = kind === 'boss'
    const g = this.g
    const side = Math.floor(Math.random() * 3)
    const pos =
      side === 0
        ? new THREE.Vector3(-14.5, 0, -5 + Math.random() * 12)
        : side === 1
          ? new THREE.Vector3(14.5, 0, -5 + Math.random() * 12)
          : new THREE.Vector3(-10 + Math.random() * 20, 0, 10.5)
    const rig = boss ? makeBoss() : makeZombie(brute)
    rig.root.position.copy(pos)
    g.scene.add(rig.root)

    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1e293b, depthTest: false }))
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xef4444, depthTest: false }))
    const size = boss ? 2.2 : brute ? 1.35 : 1
    barBg.scale.set(0.9 * (boss ? 2 : 1), 0.12, 1)
    bar.scale.set(0.84 * (boss ? 2 : 1), 0.08, 1)
    barBg.renderOrder = bar.renderOrder = 12
    g.scene.add(barBg, bar)

    const machines = g.allStations.filter((s) => (s.machine || s.onDamage) && !g.isDamaged(s))
    const loot = g.allStations.filter((s) => s.steal)
    const r = Math.random()
    let mode: Zombie['mode'] = 'player'
    let target: Station | null = null
    if (boss) {
      // El jefe siempre va por el jugador
    } else if (r < 0.3 && machines.length) {
      mode = 'machine'
      target = machines[Math.floor(Math.random() * machines.length)]
    } else if (r < 0.55 && loot.length) {
      mode = 'thief'
      target = loot[Math.floor(Math.random() * loot.length)]
    }
    const maxHp = boss ? 90 : brute ? 12 : 4
    this.zombies.push({
      rig,
      hp: maxHp,
      maxHp,
      speed: boss ? 1.25 : brute ? 1.1 : 1.5 + Math.random() * 0.5,
      brute,
      boss,
      size,
      summonT: 8,
      mode,
      target,
      attackT: 0,
      loot: null,
      lootMesh: null,
      flee: pos.clone(),
      dying: -1,
      hitFlash: 0,
      barBg,
      bar,
    })
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
      const barW = 0.84 * (z.boss ? 2 : 1)
      z.barBg.position.set(root.position.x, 0.4 + 1.45 * z.size, root.position.z)
      z.bar.position.copy(z.barBg.position)
      const ratio = Math.max(0, z.hp / z.maxHp)
      z.bar.scale.x = barW * ratio
      z.bar.position.x -= (barW * (1 - ratio)) / 2
      z.barBg.visible = z.bar.visible = (z.boss || z.hp < z.maxHp) && z.dying < 0

      if (z.dying >= 0) {
        z.dying -= dt
        root.rotation.x = Math.max(-Math.PI / 2, root.rotation.x - dt * 5)
        root.position.y -= dt * 0.3
        if (z.dying <= 0) this.removeZombie(i)
        continue
      }
      if (!running) continue

      if (z.hitFlash > 0) {
        z.hitFlash -= dt
        root.scale.setScalar(z.size * (1 + z.hitFlash))
      }

      // El jefe invoca zombis ayudantes cada cierto tiempo
      if (z.boss) {
        z.summonT -= dt
        if (z.summonT <= 0) {
          z.summonT = 10
          for (let k = 0; k < 2; k++) this.spawnZombie('normal')
          g.toast('👑 El jefe llamó a más zombis', 'warn')
          g.sfx('groan')
        }
      }

      // Destino según su intención
      let goal: THREE.Vector3
      if (z.mode === 'flee') goal = z.flee
      else if (z.mode === 'player' || !z.target) goal = g.playerPos
      else goal = z.target.object.position

      const to = goal.clone().sub(root.position).setY(0)
      const dist = to.length()
      const reach = z.mode === 'player' ? (z.boss ? 1.6 : 0.9) : z.mode === 'flee' ? 0.3 : this.edgeDist(z.target!, root.position)
      const close = z.mode === 'player' ? dist < reach : z.mode === 'flee' ? dist < 0.5 : reach < 0.65

      if (!close) {
        to.normalize()
        root.position.addScaledVector(to, z.speed * dt)
        root.rotation.y = Math.atan2(to.x, to.z)
        const s = Math.sin(g.elapsed * 7 + i) * 0.5
        z.rig.legL.rotation.x = s
        z.rig.legR.rotation.x = -s
        z.attackT = 0
      } else {
        z.attackT += dt
        z.rig.armL.rotation.x = -1.45 + Math.sin(g.elapsed * 12) * 0.3
        this.act(z)
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

  private act(z: Zombie) {
    const g = this.g
    if (z.mode === 'player') {
      if (z.attackT >= (z.boss ? 1.2 : 0.9)) {
        z.attackT = 0
        this.hurt(z.boss ? 25 : z.brute ? 20 : 10)
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
      z.lootMesh = box(0.45, 0.35, 0.45, C.cardboard)
      g.scene.add(z.lootMesh)
      g.toast(`🧟 ¡Un zombi se lleva ${loot}! Dispárale antes de que escape`, 'warn')
      const p = z.rig.root.position
      z.flee = new THREE.Vector3(p.x < 0 ? -15 : 15, 0, p.z)
      z.mode = 'flee'
      z.speed *= 1.2
    }
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
    z.rig.root.position.addScaledVector(dir.clone().setY(0).normalize(), z.boss ? 0 : z.brute ? 0.05 : 0.15)
    g.sfx('hit')
    if (z.hp <= 0) {
      z.dying = 0.8
      this.kills++
      g.sfx('kill')
      g.earn(z.boss ? 150 : z.brute ? BOUNTY * 3 : BOUNTY, z.rig.root.position.clone().setY(2), z.boss ? false : true)
      if (z.boss) g.reward(25, '👑 ¡Jefe zombi derrotado!', 'correct', { at: z.rig.root.position.clone().setY(3.5) })
      if (z.loot) g.toast(`✅ Recuperaste ${z.loot}`, 'good')
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
        const r = z.boss ? 1.1 : z.brute ? 0.75 : 0.5
        if (Math.hypot(p.x - b.mesh.position.x, p.z - b.mesh.position.z) < r) {
          this.damageZombie(z, 1, b.vel)
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
      const home = g.playerPos.clone().add(new THREE.Vector3(-1.3, 0, 1.1))
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
        this.spawnBullet(origin.clone().addScaledVector(dir, 0.6), dir.multiplyScalar(24))
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
}
