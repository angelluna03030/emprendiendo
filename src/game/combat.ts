import * as THREE from 'three'
import type { Game, Player } from './Game'
import { disposeObject } from './Game'
import { box, C, makeBoss, makeBot, makeDrone, makeExploder, makeFlyer, makeGun, makeHelmet, makeMine, makeRunner, makeTesla, makeTurret, makeZombie, mat, type WorkerRig } from './models'
import type { SfxName } from './sfx'
import type { Station, Upgrade, WeaponSlot } from './types'

/* ------------------------------------------------------------------ */
/* Armas                                                               */
/* ------------------------------------------------------------------ */

export type WeaponId = 'pistola' | 'subfusil' | 'escopeta' | 'rifle' | 'lanzallamas' | 'bazuca' | 'minigun'

interface WeaponDef {
  name: string
  emoji: string
  desc: string
  key: string
  rate: number
  pellets: number
  spread: number
  speed: number
  dmg: number
  life: number
  /** Cuántos zombis atraviesa cada bala. */
  pierce: number
  /** Radio de explosión al impactar (0 = sin explosión). */
  blast: number
  price: number
  ammoPack: number
  ammoPrice: number
  sfx: SfxName
  color: number
  size: number
}

const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistola: { name: 'Pistola', emoji: '🔫', desc: '', key: '1', rate: 0.26, pellets: 1, spread: 0.04, speed: 26, dmg: 1, life: 0.9, pierce: 1, blast: 0, price: 0, ammoPack: 0, ammoPrice: 0, sfx: 'shot', color: 0xfde047, size: 1 },
  subfusil: { name: 'Subfusil', emoji: '🔫', desc: 'Ráfaga rapidísima', key: '2', rate: 0.08, pellets: 1, spread: 0.14, speed: 28, dmg: 1, life: 0.9, pierce: 1, blast: 0, price: 150, ammoPack: 120, ammoPrice: 30, sfx: 'shot', color: 0xfde047, size: 1 },
  escopeta: { name: 'Escopeta', emoji: '💥', desc: '6 perdigones por disparo', key: '3', rate: 0.7, pellets: 6, spread: 0.38, speed: 22, dmg: 1, life: 0.6, pierce: 1, blast: 0, price: 180, ammoPack: 24, ammoPrice: 30, sfx: 'shotgun', color: 0xfde047, size: 1 },
  rifle: { name: 'Rifle láser', emoji: '⚡', desc: 'Atraviesa hasta 4 zombis, mucho daño', key: '4', rate: 0.35, pellets: 1, spread: 0.01, speed: 42, dmg: 3, life: 1, pierce: 4, blast: 0, price: 220, ammoPack: 40, ammoPrice: 30, sfx: 'laser', color: 0x22d3ee, size: 1.4 },
  lanzallamas: { name: 'Lanzallamas', emoji: '🔥', desc: 'Corto alcance, quema a varios', key: '5', rate: 0.05, pellets: 2, spread: 0.4, speed: 11, dmg: 0.4, life: 0.38, pierce: 3, blast: 0, price: 250, ammoPack: 200, ammoPrice: 30, sfx: 'flame', color: 0xf97316, size: 2.2 },
  bazuca: { name: 'Bazuca', emoji: '🚀', desc: 'Cohete que explota en área', key: '6', rate: 1.0, pellets: 1, spread: 0.02, speed: 16, dmg: 4, life: 1.4, pierce: 1, blast: 2.6, price: 300, ammoPack: 8, ammoPrice: 40, sfx: 'rocket', color: 0x84cc16, size: 2.4 },
  minigun: { name: 'Minigun', emoji: '🌀', desc: 'La más rápida de todas', key: '7', rate: 0.04, pellets: 1, spread: 0.18, speed: 30, dmg: 1, life: 0.9, pierce: 1, blast: 0, price: 380, ammoPack: 300, ammoPrice: 40, sfx: 'shot', color: 0xfde047, size: 1 },
}
const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[]

/* ------------------------------------------------------------------ */
/* Mejoras del equipo                                                  */
/* ------------------------------------------------------------------ */

type UpgradeId = 'chaleco' | 'botas' | 'nanobots' | 'balas' | 'gatillo' | 'iman' | 'mayorista' | 'contrato' | 'seguro'

const UPGRADES: Record<UpgradeId, { label: string; desc: string; cost: number; cat: 'mejora' | 'fabrica'; combat: boolean }> = {
  chaleco: { label: '🦺 Chaleco blindado', desc: 'Todo el equipo recibe 40% menos daño', cost: 150, cat: 'mejora', combat: true },
  botas: { label: '👟 Botas turbo', desc: 'Todos se mueven 30% más rápido', cost: 120, cat: 'mejora', combat: false },
  nanobots: { label: '💉 Nanobots médicos', desc: 'La vida se recupera antes y más rápido', cost: 140, cat: 'mejora', combat: true },
  balas: { label: '🎯 Balas mejoradas', desc: '+50% de daño con todas las armas', cost: 200, cat: 'mejora', combat: true },
  gatillo: { label: '⚙️ Gatillo rápido', desc: 'Todas las armas disparan 25% más rápido', cost: 180, cat: 'mejora', combat: true },
  iman: { label: '🧲 Imán de dinero', desc: 'Cada zombi derrotado da el doble de dinero', cost: 100, cat: 'mejora', combat: true },
  mayorista: { label: '📦 Proveedor mayorista', desc: 'La materia prima cuesta 20% menos', cost: 160, cat: 'fabrica', combat: false },
  contrato: { label: '📝 Contrato premium', desc: 'Ganas 20% más dinero en todas las ventas', cost: 200, cat: 'fabrica', combat: false },
  seguro: { label: '🛡️ Seguro antirrobo', desc: 'Los robos de zombis no cuestan dinero ni cuentan como desperdicio', cost: 120, cat: 'fabrica', combat: true },
}

const MAX_HP = 100
const KNOCK_TIME = 3
const KNOCK_COST = 50
const BOUNTY = 8
const TURRET_COST = 200
const MAX_TURRETS = 3
const GUARD_COST = 260
const REPAIR_BOT_COST = 150
const MEDKIT_COST = 40
const MINE_COST = 90
const MAX_MINES = 12
const TESLA_COST = 260
const MAX_TESLAS = 2
const DRONE_COST = 280

/** Oleadas: primera a los 20 s y luego cada 26 s. */
const FIRST_WAVE = 20
const WAVE_EVERY = 26

type ZKind = 'normal' | 'brute' | 'boss' | 'flyer' | 'runner' | 'exploder'
const KIND_CODE: ZKind[] = ['normal', 'brute', 'boss', 'flyer', 'runner', 'exploder']
const ZSTATS: Record<ZKind, { hp: number; speed: number; size: number; dmg: number; reach: number; hitR: number; bounty: number }> = {
  normal: { hp: 4, speed: 1.5, size: 1, dmg: 10, reach: 0.9, hitR: 0.5, bounty: 1 },
  brute: { hp: 12, speed: 1.1, size: 1.35, dmg: 20, reach: 0.9, hitR: 0.75, bounty: 3 },
  boss: { hp: 90, speed: 1.25, size: 2.2, dmg: 25, reach: 1.6, hitR: 1.1, bounty: 0 },
  flyer: { hp: 3, speed: 2.6, size: 0.8, dmg: 8, reach: 1.1, hitR: 0.6, bounty: 2 },
  runner: { hp: 2, speed: 3.4, size: 1, dmg: 8, reach: 0.9, hitR: 0.5, bounty: 1 },
  exploder: { hp: 5, speed: 1.3, size: 1, dmg: 30, reach: 1.1, hitR: 0.55, bounty: 2 },
}

interface Zombie {
  id: number
  kind: ZKind
  rig: WorkerRig
  wings: THREE.Group[]
  glow: THREE.MeshStandardMaterial | null
  hp: number
  maxHp: number
  speed: number
  size: number
  summonT: number
  mode: 'player' | 'machine' | 'thief' | 'flee'
  target: Station | null
  attackT: number
  /** Explosivo: cuenta regresiva antes de estallar (-1 = apagada). */
  fuse: number
  loot: string | null
  lootMesh: THREE.Mesh | null
  flee: THREE.Vector3
  dying: number
  hitFlash: number
  barBg: THREE.Sprite
  bar: THREE.Sprite
  net: THREE.Vector3
  netRot: number
}

interface Bullet {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
  visual: boolean
  dmg: number
  pierce: number
  blast: number
  hits: Set<number>
}

interface Shooter {
  group: THREE.Group
  head: THREE.Object3D
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
  cd: number[] | null
  mi: number[][]
  te: number[][]
  ow: WeaponId[]
  am: Record<WeaponId, number>
  up: UpgradeId[]
  k: number
  w: number
  nw: number
}

const bulletGeo = new THREE.SphereGeometry(0.09, 6, 4)

/**
 * Zombis, armas, vida de los jugadores, mejoras y robots de defensa.
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
  /** Armas, munición y mejoras son del equipo. */
  private owned = new Set<WeaponId>(['pistola'])
  private ammo = Object.fromEntries(WEAPON_IDS.map((w) => [w, w === 'pistola' ? Infinity : 0])) as Record<WeaponId, number>
  private ups = new Set<UpgradeId>()
  private nextWave = FIRST_WAVE
  private turrets: Shooter[] = []
  private guard: Shooter | null = null
  private drone: Shooter | null = null
  private teslas: { group: THREE.Group; orb: THREE.MeshStandardMaterial; cooldown: number }[] = []
  private mines: THREE.Group[] = []
  private repairBot: { group: THREE.Group; job: { pos: THREE.Vector3; done: () => void } | null; work: number; net: THREE.Vector3 } | null = null
  private readonly repairHome = new THREE.Vector3(-10.5, 0, 6.5)
  private groanT = 3
  private clock = 0

  constructor(g: Game, enabled: boolean) {
    this.g = g
    this.enabled = enabled
  }

  /* ---------------------------------------------------------------- */
  /* Factores de las mejoras                                           */
  /* ---------------------------------------------------------------- */

  get speedFactor() {
    return this.ups.has('botas') ? 1.3 : 1
  }
  get materialFactor() {
    return this.ups.has('mayorista') ? 0.8 : 1
  }
  get incomeFactor() {
    return this.ups.has('contrato') ? 1.2 : 1
  }
  get insured() {
    return this.ups.has('seguro')
  }
  private get dmgFactor() {
    return this.ups.has('balas') ? 1.5 : 1
  }
  private get rateFactor() {
    return this.ups.has('gatillo') ? 0.75 : 1
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
    if (!this.enabled || !WEAPONS[w] || !this.owned.has(w) || p.weapon === w) return
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
      name: `${WEAPONS[id].emoji} ${WEAPONS[id].name}`,
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
    p.cooldown = def.rate * this.rateFactor
    const dir = this.aimDir(p)
    const origin = p.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(dir, 0.7)
    for (let i = 0; i < def.pellets; i++) {
      const a = (Math.random() - 0.5) * def.spread
      const v = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(def.speed * (0.9 + Math.random() * 0.2))
      this.spawnBullet(origin, v, p.weapon, false)
    }
    this.g.sfx(def.sfx)
  }

  private spawnBullet(origin: THREE.Vector3, vel: THREE.Vector3, kind: WeaponId, visual: boolean) {
    const def = WEAPONS[kind] ?? WEAPONS.pistola
    const mesh = new THREE.Mesh(bulletGeo, mat(def.color, def.color))
    mesh.position.copy(origin)
    mesh.scale.set(def.size, def.size, def.size * (kind === 'rifle' ? 3 : 1))
    mesh.lookAt(origin.clone().add(vel))
    this.g.scene.add(mesh)
    this.bullets.push({ mesh, vel, life: def.life, visual, dmg: def.dmg * this.dmgFactor, pierce: def.pierce, blast: def.blast, hits: new Set() })
    if (!visual) this.g.netBullet(origin, vel, kind)
  }

  /** Invitado: bala que solo se ve. */
  visualBullet(origin: THREE.Vector3, vel: THREE.Vector3, kind: string) {
    this.spawnBullet(origin, vel, kind as WeaponId, true)
  }

  /* ---------------------------------------------------------------- */
  /* Tienda                                                            */
  /* ---------------------------------------------------------------- */

  shopItems(p: Player): Upgrade[] {
    const items: Upgrade[] = []
    if (this.enabled) {
      for (const id of WEAPON_IDS) {
        if (id === 'pistola') continue
        const w = WEAPONS[id]
        items.push(
          this.owned.has(id)
            ? { id: `ammo:${id}`, label: `${w.emoji} Munición ${w.name} +${w.ammoPack}`, desc: `El equipo tiene ${this.ammo[id]} · tecla ${w.key}`, cost: w.ammoPrice, owned: false, category: 'arma', repeatable: true }
            : { id: `weapon:${id}`, label: `${w.emoji} ${w.name}`, desc: `${w.desc}. Incluye ${w.ammoPack} de munición · tecla ${w.key}`, cost: w.price, owned: false, category: 'arma' },
        )
      }
    }
    for (const [id, u] of Object.entries(UPGRADES) as [UpgradeId, (typeof UPGRADES)[UpgradeId]][]) {
      if (u.combat && !this.enabled) continue
      items.push({ id: `up:${id}`, label: u.label, desc: u.desc, cost: u.cost, owned: this.ups.has(id), category: u.cat })
    }
    if (this.enabled) {
      items.push(
        { id: 'turret', label: `🗼 Torreta robot (${this.turrets.length}/${MAX_TURRETS})`, desc: 'Se instala donde estás y dispara sola', cost: TURRET_COST, owned: this.turrets.length >= MAX_TURRETS, category: 'defensa', repeatable: true },
        { id: 'tesla', label: `⚡ Torre Tesla (${this.teslas.length}/${MAX_TESLAS})`, desc: 'Lanza rayos a 3 zombis a la vez', cost: TESLA_COST, owned: this.teslas.length >= MAX_TESLAS, category: 'defensa', repeatable: true },
        { id: 'mines', label: `💣 Minas terrestres x3 (${this.mines.length}/${MAX_MINES})`, desc: 'Explotan cuando un zombi las pisa', cost: MINE_COST, owned: this.mines.length > MAX_MINES - 3, category: 'defensa', repeatable: true },
        { id: 'guard', label: '🛡️ Robot guardián', desc: 'Sigue a quien lo compra y dispara', cost: GUARD_COST, owned: !!this.guard, category: 'defensa' },
        { id: 'cdrone', label: '🚁 Dron de combate', desc: 'Vuela alrededor de ti disparando rápido', cost: DRONE_COST, owned: !!this.drone, category: 'defensa' },
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
      if (!WEAPONS[w] || this.owned.has(w) || !g.spend(WEAPONS[w].price)) return true
      this.owned.add(w)
      this.ammo[w] += WEAPONS[w].ammoPack
      this.equip(p, w)
      g.toast(`${WEAPONS[w].emoji} ${WEAPONS[w].name} comprado para el equipo — tecla ${WEAPONS[w].key}`, 'good', true)
      return true
    }
    if (id.startsWith('ammo:')) {
      const w = id.slice(5) as WeaponId
      if (WEAPONS[w] && g.spend(WEAPONS[w].ammoPrice)) this.ammo[w] += WEAPONS[w].ammoPack
      return true
    }
    if (id.startsWith('up:')) {
      const u = id.slice(3) as UpgradeId
      if (!UPGRADES[u] || this.ups.has(u) || !g.spend(UPGRADES[u].cost)) return true
      this.ups.add(u)
      g.toast(`${UPGRADES[u].label} activado: ${UPGRADES[u].desc}`, 'good', true)
      g.sfx('done')
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
      case 'tesla': {
        if (this.teslas.length >= MAX_TESLAS || !g.spend(TESLA_COST)) return true
        const pos = p.pos.clone().addScaledVector(this.aimDir(p), 1.2)
        this.addTesla(pos.x, pos.z)
        g.toast('⚡ Torre Tesla instalada', 'good', true)
        return true
      }
      case 'mines': {
        if (this.mines.length > MAX_MINES - 3 || !g.spend(MINE_COST)) return true
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + p.facing
          this.addMine(p.pos.x + Math.sin(a) * 1.3, p.pos.z + Math.cos(a) * 1.3)
        }
        g.toast('💣 3 minas colocadas a tu alrededor', 'good', true)
        return true
      }
      case 'guard': {
        if (this.guard || !g.spend(GUARD_COST)) return true
        this.addGuard(p.pos.x - 1.2, p.pos.z + 1, p.id)
        g.toast(`🛡️ Robot guardián activado para ${p.name}`, 'good', true)
        return true
      }
      case 'cdrone': {
        if (this.drone || !g.spend(DRONE_COST)) return true
        this.addCombatDrone(p.pos.x, p.pos.z, p.id)
        g.toast(`🚁 Dron de combate activado para ${p.name}`, 'good', true)
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

  private addCombatDrone(x: number, z: number, owner: string) {
    const d = makeDrone()
    d.position.set(x, 2.6, z)
    this.g.scene.add(d)
    this.drone = { group: d, head: d, cooldown: 0, range: 8, rate: 0.3, owner, net: d.position.clone() }
  }

  private addTesla(x: number, z: number) {
    const t = makeTesla()
    t.group.position.set(x, 0, z)
    this.g.scene.add(t.group)
    this.teslas.push({ group: t.group, orb: t.orb, cooldown: 0 })
  }

  private addMine(x: number, z: number) {
    const m = makeMine()
    m.position.set(THREE.MathUtils.clamp(x, -12, 12), 0, THREE.MathUtils.clamp(z, -7.5, 8.5))
    this.g.scene.add(m)
    this.mines.push(m)
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
    p.hp -= amount * (this.ups.has('chaleco') ? 0.6 : 1)
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

  private nearestPlayer(from: THREE.Vector3): Player | null {
    let best: Player | null = null
    let bestD = Infinity
    for (const p of this.g.players) {
      if (p.knocked > 0) continue
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
    this.clock += dt
    const regenDelay = this.ups.has('nanobots') ? 2 : 5
    const regenRate = this.ups.has('nanobots') ? 10 : 4
    for (const p of g.players) {
      if (p.knocked > 0) {
        p.knocked -= dt
        if (p.knocked <= 0) {
          p.knocked = 0
          p.hp = MAX_HP
          g.respawn(p)
          g.withActor(p, () => g.toast('Te levantaste. ¡A seguir produciendo!', 'info'))
        }
      } else if (g.elapsed - p.lastHurt > regenDelay && p.hp < MAX_HP) {
        p.hp = Math.min(MAX_HP, p.hp + regenRate * dt)
      }
      // Disparo: clic = un tiro, mantener = ráfaga
      p.cooldown -= dt
      if (this.enabled && running && p.firing && p.knocked <= 0 && p.cooldown <= 0) this.shoot(p)
    }

    if (this.enabled && running && g.elapsed >= this.nextWave) this.spawnWave()
    this.updateZombies(dt, running)
    this.updateBullets(dt)
    this.updateShooters(dt)
    this.updateTeslas(dt)
    this.updateMines()
    this.updateRepairBot(dt)
    this.spinGuns(dt)
  }

  /** La minigun gira mientras dispara. */
  private spinGuns(dt: number) {
    for (const p of this.g.players) {
      if (p.weapon !== 'minigun' || !p.firing) continue
      const spin = p.gun?.getObjectByName('spin')
      if (spin) spin.rotation.z += dt * 30
    }
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
    let flyers = 0
    for (let i = 0; i < count; i++) {
      if (i < brutes) {
        this.spawnZombie('brute')
        continue
      }
      // Mezcla de tipos: más variedad en oleadas avanzadas
      const r = Math.random()
      let kind: ZKind = 'normal'
      if (r < 0.2) kind = 'runner'
      else if (this.wave >= 2 && r < 0.45) kind = 'flyer'
      else if (this.wave >= 2 && r < 0.6) kind = 'exploder'
      if (kind === 'flyer') flyers++
      this.spawnZombie(kind)
    }
    this.g.toast(`🧟 ¡Oleada ${this.wave}! Llegan ${count} zombis${flyers ? ` (🦇 ${flyers} voladores)` : ''} — apunta con el mouse y dispara`, 'bad', true)
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
    let rig: WorkerRig
    let wings: THREE.Group[] = []
    let glow: THREE.MeshStandardMaterial | null = null
    if (kind === 'boss') rig = makeBoss()
    else if (kind === 'flyer') {
      const f = makeFlyer()
      rig = f
      wings = f.wings
    } else if (kind === 'runner') rig = makeRunner()
    else if (kind === 'exploder') {
      const e = makeExploder()
      rig = e
      glow = e.glow
    } else rig = makeZombie(kind === 'brute')
    // En el espacio los zombis usan casco
    if (g.level.theme === 'space') rig.body.add(makeHelmet())
    rig.root.position.copy(pos)
    g.scene.add(rig.root)
    const wide = kind === 'boss' ? 2 : 1
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1e293b, depthTest: false }))
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: kind === 'flyer' ? 0xa855f7 : 0xef4444, depthTest: false }))
    barBg.scale.set(0.9 * wide, 0.12, 1)
    bar.scale.set(0.84 * wide, 0.08, 1)
    barBg.renderOrder = bar.renderOrder = 12
    g.scene.add(barBg, bar)
    const st = ZSTATS[kind]
    const z: Zombie = {
      id,
      kind,
      rig,
      wings,
      glow,
      hp: maxHp,
      maxHp,
      speed: st.speed * (0.9 + Math.random() * 0.25),
      size: st.size,
      summonT: 8,
      mode: 'player',
      target: null,
      attackT: 0,
      fuse: -1,
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
    const base = ZSTATS[kind].hp
    const maxHp = kind === 'boss' ? Math.round(base * (1 + 0.5 * (g.teamSize - 1))) : base
    const z = this.createZombie(++this.zombieSeq, kind, pos, maxHp)

    // Los jefes, voladores y corredores van directo por los jugadores
    if (kind === 'boss' || kind === 'flyer' || kind === 'runner') return
    const machines = g.allStations.filter((s) => (s.machine || s.onDamage) && !g.isDamaged(s))
    const loot = g.allStations.filter((s) => s.steal)
    const r = Math.random()
    if (r < (kind === 'exploder' ? 0.5 : 0.3) && machines.length) {
      z.mode = 'machine'
      z.target = machines[Math.floor(Math.random() * machines.length)]
    } else if (kind === 'normal' && r < 0.55 && loot.length) {
      z.mode = 'thief'
      z.target = loot[Math.floor(Math.random() * loot.length)]
    }
  }

  private updateBars(z: Zombie) {
    const root = z.rig.root
    const barW = 0.84 * (z.kind === 'boss' ? 2 : 1)
    z.barBg.position.set(root.position.x, root.position.y + 0.4 + 1.45 * z.size, root.position.z)
    z.bar.position.copy(z.barBg.position)
    const ratio = Math.max(0, z.hp / z.maxHp)
    z.bar.scale.x = barW * ratio
    z.bar.position.x -= (barW * (1 - ratio)) / 2
    z.barBg.visible = z.bar.visible = (z.kind === 'boss' || z.hp < z.maxHp) && z.dying < 0
  }

  /** Animaciones propias de cada tipo (alas, vuelo, mecha). */
  private animateKind(z: Zombie, dt: number) {
    if (z.kind === 'flyer') {
      const flap = Math.sin(this.clock * 14 + z.id) * 0.6
      z.wings[0].rotation.z = flap
      z.wings[1].rotation.z = -flap
      if (z.dying < 0) z.rig.root.position.y = 1.5 + Math.sin(this.clock * 3 + z.id) * 0.3
    }
    if (z.glow) {
      const blink = z.fuse >= 0 ? Math.sin(this.clock * 40) > 0 : Math.sin(this.clock * 4 + z.id) > 0.6
      z.glow.emissiveIntensity = blink ? 2 : 0.6
      z.glow.color.setHex(z.fuse >= 0 ? 0xfef08a : 0xf97316)
    }
    void dt
  }

  private animateDeath(z: Zombie, i: number, dt: number) {
    z.dying -= dt
    const root = z.rig.root
    root.rotation.x = Math.max(-Math.PI / 2, root.rotation.x - dt * 5)
    root.position.y = Math.max(-0.4, root.position.y - dt * (z.kind === 'flyer' ? 4 : 0.3))
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
      if (!this.zombies.includes(z)) continue
      const root = z.rig.root
      this.updateBars(z)
      this.animateKind(z, dt)
      if (z.dying >= 0) {
        this.animateDeath(z, i, dt)
        continue
      }
      if (!running) continue

      if (z.hitFlash > 0) {
        z.hitFlash -= dt
        root.scale.setScalar(z.size * (1 + Math.max(0, z.hitFlash)))
      }

      // Explosivo con la mecha encendida
      if (z.fuse >= 0) {
        z.fuse -= dt
        if (z.fuse < 0) this.explode(z, true)
        continue
      }

      // El jefe invoca zombis ayudantes cada cierto tiempo
      if (z.kind === 'boss') {
        z.summonT -= dt
        if (z.summonT <= 0) {
          z.summonT = 10
          this.spawnZombie('normal')
          this.spawnZombie('flyer')
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
      const st = ZSTATS[z.kind]
      const reach = z.mode === 'player' ? st.reach : z.mode === 'flee' ? 0.3 : this.edgeDist(z.target!, root.position)
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
      // Los voladores pasan por encima de las máquinas
      if (z.mode !== 'flee' && z.kind !== 'flyer') this.collide(root.position)
      if (z.lootMesh) z.lootMesh.position.set(root.position.x, 0.6 + 1.45 * z.size, root.position.z)

      // Escapó con lo robado
      if (z.mode === 'flee' && close) {
        if (this.insured) g.toast(`🛡️ El seguro cubrió el robo de ${z.loot}`, 'info', true)
        else g.reward(-10, `Desperdicio: un zombi se robó ${z.loot}`, 'waste')
        this.removeZombie(this.zombies.indexOf(z))
      }
    }
    // Separación entre zombis
    for (let a = 0; a < this.zombies.length; a++) {
      for (let b = a + 1; b < this.zombies.length; b++) {
        if (this.zombies[a].kind === 'flyer' || this.zombies[b].kind === 'flyer') continue
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
    const s = Math.sin(this.clock * (z.kind === 'runner' ? 16 : 7) + i) * (z.kind === 'runner' ? 0.9 : 0.5)
    z.rig.legL.rotation.x = s
    z.rig.legR.rotation.x = -s
  }

  private act(z: Zombie, prey: Player | null) {
    const g = this.g
    if (z.kind === 'exploder') {
      // Enciende la mecha y estalla en 0,8 s
      z.fuse = 0.8
      g.sfx('alarm')
      return
    }
    if (z.mode === 'player') {
      if (prey && z.attackT >= (z.kind === 'boss' ? 1.2 : 0.9)) {
        z.attackT = 0
        this.hurt(prey, ZSTATS[z.kind].dmg)
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

  /** Explosión de un zombi explosivo (por mecha o al morir). */
  private explode(z: Zombie, byFuse: boolean) {
    const g = this.g
    const at = z.rig.root.position.clone()
    const R = 2.8
    g.boom(at, R)
    for (const p of g.players) if (p.pos.distanceTo(at) < R) this.hurt(p, byFuse ? ZSTATS.exploder.dmg : 15)
    if (byFuse && z.target && z.mode === 'machine' && this.edgeDist(z.target, at) < 1.5) g.damageStation(z.target)
    z.hp = 0
    z.dying = 0.3
    for (const o of this.zombies) if (o !== z && o.dying < 0 && o.rig.root.position.distanceTo(at) < R) this.damageZombie(o, 6, o.rig.root.position.clone().sub(at))
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
    if (z.dying >= 0) return
    const g = this.g
    z.hp -= amount
    z.hitFlash = 0.15
    const knock = z.kind === 'boss' ? 0 : z.kind === 'brute' ? 0.05 : 0.15
    z.rig.root.position.addScaledVector(dir.clone().setY(0).normalize(), knock)
    g.sfx('hit')
    if (z.hp > 0) return
    z.dying = 0.8
    this.kills++
    g.sfx('kill')
    const boss = z.kind === 'boss'
    const bounty = boss ? 150 : BOUNTY * ZSTATS[z.kind].bounty * (this.ups.has('iman') ? 2 : 1)
    g.earn(bounty, z.rig.root.position.clone().setY(2), !boss)
    if (boss) g.reward(25, '👑 ¡Jefe zombi derrotado!', 'correct', { at: z.rig.root.position.clone().setY(3.5) })
    if (z.loot) g.toast(`✅ Recuperaste ${z.loot}`, 'good', true)
    // Un explosivo derribado revienta y daña a los zombis cercanos
    if (z.kind === 'exploder') this.explode(z, false)
  }

  private removeZombie(i: number) {
    if (i < 0) return
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
      let done = false
      for (const z of this.zombies) {
        if (z.dying >= 0 || b.hits.has(z.id)) continue
        const p = z.rig.root.position
        if (Math.hypot(p.x - b.mesh.position.x, p.z - b.mesh.position.z) >= ZSTATS[z.kind].hitR) continue
        b.hits.add(z.id)
        if (!b.visual) {
          if (b.blast > 0) this.rocketBlast(b.mesh.position.clone(), b.blast, b.dmg)
          else this.damageZombie(z, b.dmg, b.vel)
        }
        if (b.blast > 0 || b.hits.size >= b.pierce) {
          done = true
          break
        }
      }
      // El cohete explota al final de su recorrido
      if (!done && b.life <= 0 && b.blast > 0 && !b.visual) this.rocketBlast(b.mesh.position.clone(), b.blast, b.dmg)
      if (done || b.life <= 0) {
        this.g.scene.remove(b.mesh)
        this.bullets.splice(i, 1)
      }
    }
  }

  private rocketBlast(at: THREE.Vector3, radius: number, dmg: number) {
    this.g.boom(at, radius)
    for (const z of [...this.zombies]) {
      if (z.dying >= 0) continue
      const d = z.rig.root.position.distanceTo(at.clone().setY(z.rig.root.position.y))
      if (d < radius) this.damageZombie(z, dmg * (1 - d / (radius * 1.5)), z.rig.root.position.clone().sub(at))
    }
  }

  private nearestZombie(from: THREE.Vector3, range: number, skip?: Set<Zombie>) {
    let best: Zombie | null = null
    let bestD = range
    for (const z of this.zombies) {
      if (z.dying >= 0 || skip?.has(z)) continue
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
    if (this.drone) {
      const owner = g.players.find((p) => p.id === this.drone!.owner) ?? g.players[0]
      const a = this.clock * 1.5
      const home = owner.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.8, 2.6, Math.sin(a) * 1.8))
      this.drone.group.position.lerp(home, Math.min(1, dt * 4))
      this.drone.group.rotation.y += dt * 4
    }
    for (const s of [...this.turrets, ...(this.guard ? [this.guard] : []), ...(this.drone ? [this.drone] : [])]) {
      s.cooldown -= dt
      const origin = s.group.position.clone().setY(s === this.drone ? 2.4 : 1.05)
      const z = this.nearestZombie(origin.clone().setY(0), s.range)
      if (!z) continue
      const dir = z.rig.root.position.clone().sub(origin).setY(0).normalize()
      if (s !== this.drone) s.head.rotation.y = Math.atan2(dir.x, dir.z) - s.group.rotation.y
      if (s.cooldown <= 0) {
        s.cooldown = s.rate * this.rateFactor
        this.spawnBullet(origin.clone().setY(1.0).addScaledVector(dir, 0.6), dir.multiplyScalar(24), 'pistola', false)
        g.sfx('shot')
      }
    }
  }

  private updateTeslas(dt: number) {
    for (const t of this.teslas) {
      t.cooldown -= dt
      t.orb.emissiveIntensity = 0.6 + Math.abs(Math.sin(this.clock * 6)) * 0.8
      if (t.cooldown > 0) continue
      const top = t.group.position.clone().setY(1.8)
      const hit = new Set<Zombie>()
      for (let k = 0; k < 3; k++) {
        const z = this.nearestZombie(t.group.position, 6.5, hit)
        if (!z) break
        hit.add(z)
        this.g.zap(top, z.rig.root.position.clone().setY(z.rig.root.position.y + 1))
        this.damageZombie(z, 3 * this.dmgFactor, z.rig.root.position.clone().sub(top))
      }
      if (hit.size) {
        t.cooldown = 1.2
        this.g.sfx('zap')
      }
    }
  }

  private updateMines() {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i]
      const z = this.zombies.find((q) => q.dying < 0 && q.kind !== 'flyer' && q.rig.root.position.distanceTo(m.position) < 0.8)
      if (!z) continue
      this.rocketBlast(m.position.clone(), 2.4, 6)
      this.g.scene.remove(m)
      this.mines.splice(i, 1)
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
    const xz = (o: THREE.Object3D) => [r(o.position.x), r(o.position.z)]
    return {
      z: this.zombies.map((z) => [
        z.id,
        KIND_CODE.indexOf(z.kind),
        r(z.rig.root.position.x),
        r(z.rig.root.position.z),
        r(z.rig.root.rotation.y),
        Math.ceil(z.hp),
        z.maxHp,
        z.dying >= 0 ? 1 : 0,
        z.loot ? 1 : 0,
        z.fuse >= 0 ? 1 : 0,
      ]),
      tu: this.turrets.map((t) => [...xz(t.group), r(t.head.rotation.y)]),
      gd: this.guard ? [...xz(this.guard.group), r(this.guard.head.rotation.y)] : null,
      rb: this.repairBot ? [...xz(this.repairBot.group), r(this.repairBot.group.rotation.y)] : null,
      cd: this.drone ? [r(this.drone.group.position.x), r(this.drone.group.position.y), r(this.drone.group.position.z)] : null,
      mi: this.mines.map(xz),
      te: this.teslas.map((t) => xz(t.group)),
      ow: [...this.owned],
      am: { ...this.ammo, pistola: -1 },
      up: [...this.ups],
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
    this.ups = new Set(s.up)

    const seen = new Set<number>()
    for (const [id, kind, x, z, ry, hp, max, dying, loot, fuse] of s.z) {
      seen.add(id)
      let zb = this.zombies.find((q) => q.id === id)
      if (!zb) zb = this.createZombie(id, KIND_CODE[kind], new THREE.Vector3(x, 0, z), max)
      if (hp < zb.hp) zb.hitFlash = 0.15
      zb.hp = hp
      zb.net.set(x, zb.rig.root.position.y, z)
      zb.netRot = ry
      zb.fuse = fuse ? 1 : -1
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
    s.te.forEach(([x, z], i) => {
      if (!this.teslas[i]) this.addTesla(x, z)
    })
    // Minas: se recrean cuando cambia la cantidad
    if (s.mi.length !== this.mines.length) {
      for (const m of this.mines) this.g.scene.remove(m)
      this.mines = []
      for (const [x, z] of s.mi) this.addMine(x, z)
    }
    if (s.gd) {
      if (!this.guard) this.addGuard(s.gd[0], s.gd[1], '')
      this.guard!.net.set(s.gd[0], 0, s.gd[1])
      this.guard!.head.rotation.y = s.gd[2]
    }
    if (s.cd) {
      if (!this.drone) this.addCombatDrone(s.cd[0], s.cd[2], '')
      this.drone!.net.set(s.cd[0], s.cd[1], s.cd[2])
    }
    if (s.rb) {
      if (!this.repairBot) this.addRepairBot()
      this.repairBot!.net.set(s.rb[0], 0, s.rb[1])
      this.repairBot!.group.rotation.y = s.rb[2]
    }
  }

  /** Invitado: suaviza y anima lo que envió el anfitrión. */
  updateView(dt: number) {
    this.clock += dt
    const k = Math.min(1, dt * 10)
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i]
      const root = z.rig.root
      this.updateBars(z)
      this.animateKind(z, dt)
      if (z.dying >= 0) {
        this.animateDeath(z, i, dt)
        continue
      }
      const target = z.net.clone().setY(root.position.y)
      const moving = root.position.distanceToSquared(target) > 0.0004
      root.position.lerp(target, k)
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
    for (const t of this.teslas) t.orb.emissiveIntensity = 0.6 + Math.abs(Math.sin(this.clock * 6)) * 0.8
    if (this.guard) this.guard.group.position.lerp(this.guard.net, k)
    if (this.drone) {
      this.drone.group.position.lerp(this.drone.net, k)
      this.drone.group.rotation.y += dt * 4
    }
    if (this.repairBot) this.repairBot.group.position.lerp(this.repairBot.net, k)
    this.spinGuns(dt)
  }
}
