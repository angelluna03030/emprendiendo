import * as THREE from 'three'
import type { NetMsg, PlayerInfo, Session } from '../net/session'
import { Combat, type WeaponId } from './combat'
import { buildEnvironment, type EnvUpdate } from './env'
import { makeItem } from './items'
import { createLevel } from './levels'
import { ball, clearMaterialCache, makeGun, makeHintArrow, makeWorker, type WorkerRig } from './models'
import { play, type SfxName } from './sfx'
import { ProgressSprite, TextSprite } from './sprites'
import type { HoldAction, HudState, Item, ItemData, ItemKind, Level, LevelId, LevelResult, LevelStats, Prompt, StatKey, Station, Toast } from './types'

const BOUNDS = { minX: -12.4, maxX: 12.4, minZ: -7.6, maxZ: 8.6 }
const PLAYER_R = 0.38
const SPEED = 5.8
const REACH = 0.95
const SNAP_RATE = 1 / 15
const INPUT_RATE = 1 / 20

export interface GameCallbacks {
  onHud: (hud: HudState) => void
  onEnd: (result: LevelResult) => void
  /** Invitado: Esc abre su menú (no puede pausar a los demás). */
  onEscape?: () => void
}

export interface GameOptions {
  zombies: boolean
  session?: Session
  players?: PlayerInfo[]
}

export type Role = 'solo' | 'host' | 'client'

export type View = 'top' | 'third' | 'first'
const VIEWS: View[] = ['top', 'third', 'first']
const VIEW_KEY = 'production-game:view'

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null
    return v && VIEWS.includes(v) ? v : 'top'
  } catch {
    return 'top'
  }
}

/** Un jugador de la fábrica (local o remoto). */
export interface Player {
  id: string
  name: string
  color: number
  rig: WorkerRig
  nameTag: TextSprite | null
  pos: THREE.Vector3
  facing: number
  held: Item | null
  heldKey: string
  hp: number
  knocked: number
  lastHurt: number
  hurtAt: number
  /** Cambia cuando el anfitrión teletransporta al jugador (reaparecer). */
  tp: number
  weapon: WeaponId
  gun: THREE.Group | null
  gunKind: string
  cooldown: number
  firing: boolean
  aim: THREE.Vector3
  interactDown: boolean
  working: boolean
  moving: boolean
  walkT: number
  target: Station | null
  netPos: THREE.Vector3
  netFacing: number
}

type Fx =
  | { t: 'f'; s: string; c: string; p: number[] }
  | { t: 't'; s: string; tone: Toast['tone']; to: string | null }
  | { t: 's'; n: SfxName }
  | { t: 'b'; p: number[]; v: number[]; k: string }
  | { t: 'x'; p: number[]; r: number }
  | { t: 'z'; a: number[]; b: number[] }

interface Snap {
  st: boolean
  pa: boolean
  en: boolean
  el: number
  sc: number
  mo: number
  la: boolean
  stats: LevelStats
  pl: {
    id: string
    x: number
    z: number
    f: number
    hp: number
    kn: number
    tp: number
    w: WeaponId
    fi: boolean
    wk: boolean
    mv: boolean
    h: { k: ItemKind; d: ItemData } | null
  }[]
  sy: Record<string, unknown>
  dm: number[]
  hd: [string, number][]
  cb: unknown
  fx: Fx[]
}

/**
 * Motor del juego: escena Three.js, jugadores, estaciones, puntaje y dinero.
 * - solo: todo corre en este navegador.
 * - host: simula la partida y envía el estado a los invitados.
 * - client: dibuja el estado del anfitrión y le envía sus controles.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly level: Level
  readonly role: Role
  readonly stats: LevelStats = { correct: 0, waste: 0, wrong: 0, late: 0, stops: 0, materials: 0, earned: 0, spent: 0 }
  readonly players: Player[] = []
  readonly me: Player
  readonly combat: Combat
  readonly teamSize: number
  score = 0
  money: number
  elapsed = 0

  /** Jugador sobre el que actúan las funciones de los niveles (take, held…). */
  private actor: Player
  private readonly startMoney: number
  private readonly session: Session | null
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly container: HTMLElement
  private readonly cb: GameCallbacks
  private readonly stations: Station[] = []
  private readonly keys = new Set<string>()
  private readonly holdProgress = new Map<string, number>()
  private readonly toasts: (Toast & { until: number })[] = []
  private readonly floats: { label: TextSprite; life: number }[] = []
  private readonly ring: THREE.Mesh
  private readonly bar = new ProgressSprite()
  private readonly camFocus = new THREE.Vector3(0, 0, 0)
  private readonly resize: ResizeObserver
  private readonly damaged = new Map<Station, { label: TextSprite; smoke: number }>()
  private readonly smoke: { mesh: THREE.Mesh; life: number }[] = []
  private readonly arrow = makeHintArrow()
  private readonly raycaster = new THREE.Raycaster()
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1)
  private readonly reticle: THREE.Mesh
  private readonly syncs = new Map<string, { get: () => unknown; set: (v: never) => void; last: string }>()
  private fx: Fx[] = []
  private readonly envUpdate: EnvUpdate
  private readonly booms: { mesh: THREE.Mesh; life: number; r: number }[] = []
  private readonly bolts: { line: THREE.Line; life: number }[] = []
  private aimT = -10
  /** Cámara: vista actual, giro horizontal (yaw) y vertical (pitch). */
  private view: View = loadView()
  private yaw = Math.PI
  private pitch = 0.3
  private locked = false
  private viewModel = new THREE.Group()
  private viewGunKind = ''
  private shopOpen = false
  private started = false
  private paused = false
  private ended = false
  private endTimer = 0
  private endSent = false
  private lateApplied = false
  private toastSeq = 0
  private hudTimer = 0
  private netTimer = 0
  private lastT = 0
  private clockT = 0

  constructor(container: HTMLElement, levelId: LevelId, money: number, cb: GameCallbacks, opts: GameOptions) {
    this.container = container
    this.cb = cb
    this.money = money
    this.startMoney = money
    this.session = opts.session ?? null
    this.role = this.session ? (this.session.isHost ? 'host' : 'client') : 'solo'

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 300)
    // Arma en primera persona: va pegada a la cámara
    this.camera.add(this.viewModel)
    this.viewModel.position.set(0.32, -0.32, -0.7)
    this.viewModel.rotation.y = Math.PI

    // Jugadores
    const infos = opts.players?.length ? opts.players : [{ id: 'solo', name: 'Tú', color: 0x3b82f6 }]
    const myId = this.session?.meId ?? infos[0].id
    infos.forEach((info, i) => this.players.push(this.makePlayer(info, i, infos.length > 1)))
    this.me = this.players.find((p) => p.id === myId) ?? this.players[0]
    this.actor = this.me
    this.teamSize = this.players.length
    this.level = createLevel(levelId, this.teamSize)
    this.envUpdate = buildEnvironment(this.scene, this.level.theme)

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 40),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.03
    this.ring.visible = false
    this.scene.add(this.ring)
    this.bar.sprite.visible = false
    this.scene.add(this.bar.sprite)
    this.arrow.visible = false
    this.scene.add(this.arrow)
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 24),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.9, depthWrite: false }),
    )
    this.reticle.rotation.x = -Math.PI / 2
    this.reticle.visible = false
    this.scene.add(this.reticle)

    this.combat = new Combat(this, opts.zombies)
    for (const p of this.players) this.combat.equip(p, 'pistola')

    this.level.build(this)

    this.session?.setGameHandler((from, msg) => this.onNet(from, msg))

    this.resize = new ResizeObserver(() => this.onResize())
    this.resize.observe(container)
    this.onResize()

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    const canvas = this.renderer.domElement
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onLockChange)
    this.scene.add(this.camera)
    this.applyView()
    this.renderer.setAnimationLoop((t) => this.frame(t))
    document.addEventListener('visibilitychange', this.onVisibility)
    this.onVisibility()
  }

  private makePlayer(info: PlayerInfo, index: number, multi: boolean): Player {
    const rig = makeWorker(info.color)
    const pos = new THREE.Vector3(-1.4 + index * 1.4, 0, 3.5)
    rig.root.position.copy(pos)
    this.scene.add(rig.root)
    let nameTag: TextSprite | null = null
    if (multi) {
      nameTag = new TextSprite(info.name, { bg: 'rgba(15,23,42,0.75)', fg: '#ffffff', lineHeight: 0.28 })
      this.scene.add(nameTag.sprite)
    }
    return {
      id: info.id,
      name: info.name,
      color: info.color,
      rig,
      nameTag,
      pos,
      facing: Math.PI,
      held: null,
      heldKey: '',
      hp: 100,
      knocked: 0,
      lastHurt: -10,
      hurtAt: -10,
      tp: 0,
      weapon: 'pistola',
      gun: null,
      gunKind: '',
      cooldown: 0,
      firing: false,
      aim: new THREE.Vector3(0, 0, -5),
      interactDown: false,
      working: false,
      moving: false,
      walkT: 0,
      target: null,
      netPos: pos.clone(),
      netFacing: Math.PI,
    }
  }

  get isHost() {
    return this.role !== 'client'
  }

  get multiplayer() {
    return this.role !== 'solo'
  }

  /* ---------------------------------------------------------------- */
  /* API para los niveles (actúa sobre el jugador "actor")             */
  /* ---------------------------------------------------------------- */

  get held(): Item | null {
    return this.actor.held
  }

  get playerPos(): THREE.Vector3 {
    return this.actor.pos
  }

  /** Ejecuta fn como si la hiciera el jugador p (acciones remotas). */
  withActor<T>(p: Player, fn: () => T): T {
    const prev = this.actor
    this.actor = p
    try {
      return fn()
    } finally {
      this.actor = prev
    }
  }

  addStation(station: Station) {
    this.stations.push(station)
    if (!station.object.parent) this.scene.add(station.object)
    return station
  }

  /** Estado que el anfitrión comparte con los invitados. */
  sync<T>(key: string, get: () => T, set: (v: T) => void) {
    this.syncs.set(key, { get, set: set as (v: never) => void, last: '' })
  }

  take(item: Item) {
    const p = this.actor
    p.held = item
    item.mesh.position.set(0, 0, 0)
    item.mesh.rotation.set(0, 0, 0)
    item.mesh.scale.setScalar(1)
    p.rig.hands.add(item.mesh)
    this.sfx('pick')
  }

  release(): Item {
    const p = this.actor
    const item = p.held!
    p.rig.hands.remove(item.mesh)
    p.held = null
    this.sfx('drop')
    return item
  }

  /** Quita el item de las manos y libera su memoria. */
  consumeHeld(): Item {
    const item = this.release()
    disposeObject(item.mesh, false)
    return item
  }

  reward(points: number, text: string, stat?: StatKey, opts: { at?: THREE.Vector3; silent?: boolean } = {}) {
    this.score += points
    if (stat) this.stats[stat]++
    const at = opts.at ?? this.playerPos.clone().setY(2.2)
    this.float(`${points >= 0 ? '+' : ''}${points}`, points >= 0 ? '#16a34a' : '#dc2626', at)
    if (!opts.silent) {
      this.toast(`${points >= 0 ? '+' : ''}${points} · ${text}`, points >= 0 ? 'good' : 'bad', true)
      this.sfx(points >= 0 ? 'good' : 'bad')
    }
  }

  /** Precio de materia prima (el proveedor mayorista da 20% de descuento). */
  materialCost(cost: number) {
    return Math.round(cost * this.combat.materialFactor)
  }

  earn(amount: number, at?: THREE.Vector3, silent = false) {
    amount = Math.round(amount * this.combat.incomeFactor)
    this.money += amount
    this.stats.earned += amount
    this.float(`+$${amount}`, '#ca8a04', (at ?? this.playerPos.clone().setY(2.2)).clone().add(new THREE.Vector3(0.6, 0.4, 0)))
    if (!silent) this.sfx('cash')
  }

  spend(amount: number, at?: THREE.Vector3): boolean {
    if (this.money < amount) {
      this.toast(`💸 Dinero insuficiente (necesitas $${amount})`, 'bad')
      this.sfx('error')
      return false
    }
    this.money -= amount
    this.stats.spent += amount
    this.float(`-$${amount}`, '#b45309', (at ?? this.playerPos.clone().setY(2.4)).clone())
    return true
  }

  /** Pérdida forzada (robos, derribos): el dinero no baja de 0. */
  loseMoney(amount: number, at?: THREE.Vector3) {
    const lost = Math.min(this.money, amount)
    if (lost <= 0) return
    this.money -= lost
    this.stats.spent += lost
    this.float(`-$${lost}`, '#b45309', (at ?? this.playerPos.clone().setY(2.4)).clone())
  }

  /**
   * Aviso en pantalla. Los avisos personales (acciones de un jugador remoto)
   * solo los ve ese jugador; los de equipo (`team`) los ven todos.
   */
  toast(text: string, tone: Toast['tone'] = 'info', team = false) {
    const personal = !team && this.actor !== this.me
    const to = personal ? this.actor.id : null
    if (this.role === 'host') this.fx.push({ t: 't', s: text, tone, to })
    if (to === null || to === this.me.id) this.showToast(text, tone)
  }

  private showToast(text: string, tone: Toast['tone']) {
    const same = this.toasts.findIndex((t) => t.text === text)
    if (same >= 0) this.toasts.splice(same, 1)
    this.toasts.push({ id: ++this.toastSeq, text, tone, until: this.clockT + 3.2 })
    while (this.toasts.length > 4) this.toasts.shift()
  }

  float(text: string, color: string, at: THREE.Vector3) {
    if (this.role === 'host') this.fx.push({ t: 'f', s: text, c: color, p: at.toArray() })
    this.showFloat(text, color, at)
  }

  private showFloat(text: string, color: string, at: THREE.Vector3) {
    const label = new TextSprite(text, { bg: null, fg: color, stroke: '#ffffff', lineHeight: 0.55 })
    label.sprite.position.copy(at)
    this.scene.add(label.sprite)
    this.floats.push({ label, life: 1.3 })
  }

  sfx(name: SfxName) {
    if (this.role === 'host') this.fx.push({ t: 's', n: name })
    play(name)
  }

  /** Disparo visual para los invitados (el daño solo lo calcula el anfitrión). */
  netBullet(origin: THREE.Vector3, vel: THREE.Vector3, kind: string) {
    if (this.role === 'host') this.fx.push({ t: 'b', p: origin.toArray(), v: [vel.x, vel.z], k: kind })
  }

  /** Explosión visual (bazuca, minas, zombis explosivos). */
  boom(at: THREE.Vector3, radius: number) {
    if (this.role === 'host') this.fx.push({ t: 'x', p: at.toArray(), r: radius })
    this.showBoom(at, radius)
  }

  private showBoom(at: THREE.Vector3, radius: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    mesh.position.copy(at).setY(0.8)
    this.scene.add(mesh)
    this.booms.push({ mesh, life: 0.45, r: radius })
    play('boom')
  }

  /** Rayo de la torre Tesla. */
  zap(a: THREE.Vector3, b: THREE.Vector3) {
    if (this.role === 'host') this.fx.push({ t: 'z', a: a.toArray(), b: b.toArray() })
    this.showZap(a, b)
  }

  private showZap(a: THREE.Vector3, b: THREE.Vector3) {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 6; i++) {
      const p = a.clone().lerp(b, i / 6)
      if (i > 0 && i < 6) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5))
      pts.push(p)
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x93c5fd }))
    this.scene.add(line)
    this.bolts.push({ line, life: 0.15 })
  }

  private updateEffects(dt: number) {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i]
      b.life -= dt
      const k = 1 - b.life / 0.45
      b.mesh.scale.setScalar(0.3 + k * b.r)
      ;(b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k))
      ;(b.mesh.material as THREE.MeshBasicMaterial).color.setHex(k < 0.4 ? 0xfde047 : 0xf97316)
      if (b.life <= 0) {
        this.scene.remove(b.mesh)
        disposeObject(b.mesh)
        this.booms.splice(i, 1)
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.life -= dt
      if (b.life <= 0) {
        this.scene.remove(b.line)
        disposeObject(b.line)
        this.bolts.splice(i, 1)
      }
    }
  }

  get isLate() {
    return this.lateApplied
  }

  get allStations(): readonly Station[] {
    return this.stations
  }

  isDamaged(st: Station) {
    return this.damaged.has(st)
  }

  /** Un zombi daña una máquina: queda detenida hasta que se repare. */
  damageStation(st: Station) {
    if (st.onDamage) {
      st.onDamage(this)
      this.toast(`🧟 ¡Un zombi dañó ${st.name}!`, 'bad', true)
      this.sfx('alarm')
      return
    }
    if (this.damaged.has(st)) return
    this.markDamaged(st)
    this.toast(`🧟 ¡Un zombi dañó ${st.name}! Mantén E junto a ella para repararla`, 'bad', true)
    this.sfx('alarm')
  }

  private markDamaged(st: Station) {
    const label = new TextSprite('🧟 ¡Dañada! Mantén E', { bg: 'rgba(220,38,38,0.92)', fg: '#ffffff', lineHeight: 0.34 })
    label.sprite.position.copy(st.object.position).setY(3.1)
    this.scene.add(label.sprite)
    this.damaged.set(st, { label, smoke: 0 })
  }

  repairStation(st: Station) {
    if (!this.damaged.has(st)) return
    this.unmarkDamaged(st)
    this.toast(`🔧 ${st.name} reparada`, 'good', true)
  }

  private unmarkDamaged(st: Station) {
    const d = this.damaged.get(st)
    if (!d) return
    this.scene.remove(d.label.sprite)
    disposeObject(d.label.sprite)
    this.damaged.delete(st)
  }

  /** Acción de mantener E, considerando si la estación está dañada. */
  private holdOf(st: Station): HoldAction | null {
    if (this.damaged.has(st)) {
      if (this.held) return null
      return { key: 'zrepair', label: `Reparar ${st.name}`, duration: 2, onDone: () => this.repairStation(st) }
    }
    return st.hold?.(this) ?? null
  }

  /* ---------------------------------------------------------------- */
  /* Control desde React                                               */
  /* ---------------------------------------------------------------- */

  start() {
    if (this.role === 'client') return
    this.started = true
    this.lastT = 0
  }

  setPaused(value: boolean) {
    if (!this.started || this.ended || this.role === 'client') return
    if (value) this.unlockMouse()
    this.paused = value
    this.keys.clear()
    this.emitHud()
  }

  buy(id: string) {
    if (!this.started || this.ended) return
    if (this.role === 'client') {
      this.session?.send({ t: 'buy', id })
      return
    }
    this.doBuy(this.me, id)
    this.emitHud()
  }

  private doBuy(p: Player, id: string) {
    this.withActor(p, () => {
      if (!this.combat.buy(p, id)) this.level.buy(id, this)
    })
  }

  /* ---------------------------------------------------------------- */
  /* Vistas de cámara                                                  */
  /* ---------------------------------------------------------------- */

  /** Cambia entre vista desde arriba, tercera y primera persona. */
  cycleView() {
    this.setView(VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length])
  }

  setView(v: View) {
    if (v !== 'top' && this.view === 'top') {
      // Al entrar en vista de persona, la cámara mira hacia donde mira el personaje
      this.yaw = this.me.facing
      this.pitch = v === 'first' ? 0 : 0.3
    }
    this.view = v
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // sin almacenamiento: la vista solo dura esta partida
    }
    if (v === 'top') this.unlockMouse()
    this.applyView()
    const names: Record<View, string> = { top: '🎥 Vista desde arriba', third: '🎥 Tercera persona', first: '🎥 Primera persona' }
    this.showToast(v === 'top' ? names[v] : `${names[v]} — haz clic para mover la cámara con el mouse`, 'info')
    this.emitHud()
  }

  private applyView() {
    this.camera.fov = this.view === 'top' ? 40 : this.view === 'first' ? 75 : 65
    this.camera.updateProjectionMatrix()
    // En primera persona no se dibuja el propio cuerpo
    this.me.rig.root.visible = this.view !== 'first'
    if (this.me.nameTag) this.me.nameTag.sprite.visible = this.view === 'top'
    this.viewModel.visible = this.view === 'first'
  }

  private unlockMouse() {
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
  }

  /** Arma que se ve en primera persona. */
  private updateViewModel(dt: number) {
    if (this.view !== 'first') return
    const kind = this.combat.enabled ? this.me.weapon : ''
    if (kind !== this.viewGunKind) {
      this.viewGunKind = kind
      for (const c of [...this.viewModel.children]) {
        this.viewModel.remove(c)
        disposeObject(c, false)
      }
      if (kind) {
        const gun = makeGun(kind)
        gun.scale.setScalar(1.4)
        this.viewModel.add(gun)
      }
    }
    // Retroceso al disparar y balanceo al caminar
    const recoil = this.me.firing ? Math.sin(this.clockT * 40) * 0.02 : 0
    const bob = this.me.moving ? Math.sin(this.clockT * 10) * 0.015 : 0
    this.viewModel.position.set(0.32, -0.32 + bob, -0.7 + recoil)
    const spin = this.viewModel.getObjectByName('spin')
    if (spin && this.me.firing) spin.rotation.z += dt * 30
  }

  selectWeapon(id: string) {
    this.combat.select(this.me, id as WeaponId, true)
    this.emitHud()
  }

  setShop(open: boolean) {
    if (!this.started || this.ended || this.paused) return
    if (open) this.unlockMouse()
    this.shopOpen = open
    this.keys.clear()
    this.me.firing = false
    this.emitHud()
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.session?.setGameHandler(null)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pointerup', this.onPointerUp)
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.stopBackgroundTicker()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    this.resize.disconnect()
    disposeObject(this.scene)
    clearMaterialCache()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  /* ---------------------------------------------------------------- */
  /* Bucle principal                                                   */
  /* ---------------------------------------------------------------- */

  private frame(t: number) {
    const dt = this.lastT ? THREE.MathUtils.clamp((t - this.lastT) / 1000, 0, 0.05) : 0
    this.lastT = t
    this.clockT += dt

    // En cooperativo la tienda no pausa el mundo.
    const frozen = this.paused || (this.shopOpen && !this.multiplayer)
    if (this.role === 'client') this.tickClient(dt)
    else if (this.started && !frozen) this.tick(dt)

    this.animatePlayers(dt)
    this.updateViewModel(dt)
    this.envUpdate(dt, this.clockT)
    this.updateEffects(dt)
    this.updateCamera(dt)
    this.updateFloats(dt)
    // En segundo plano no se dibuja (nadie lo ve), pero la partida sigue
    if (!document.hidden) this.renderer.render(this.scene, this.camera)

    this.netTimer -= dt
    if (this.netTimer <= 0) {
      this.netTimer = this.role === 'host' ? SNAP_RATE : INPUT_RATE
      if (this.role === 'host') this.sendSnapshot()
      if (this.role === 'client') this.sendInput()
    }

    this.hudTimer -= dt
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1
      this.emitHud()
    }
  }

  private tick(dt: number) {
    if (!this.ended) this.elapsed += dt
    this.moveLocal(dt)
    for (const p of this.players) {
      this.updateTarget(p)
      this.handleHold(p, dt)
    }
    this.level.update(dt, this)
    this.combat.update(dt, !this.ended)
    this.updateDamage(dt)
    this.updateHint()

    if (this.ended) {
      this.endTimer -= dt
      if (this.endTimer <= 0 && !this.endSent) {
        this.endSent = true
        this.cb.onEnd(this.result())
      }
      return
    }

    const L = this.level
    if (L.deadline !== null && !this.lateApplied && this.elapsed > L.deadline) {
      this.lateApplied = true
      this.reward(-30, '¡Retraso! Se pasó la fecha límite', 'late')
    }
    const completed = L.isComplete(this) || (L.duration !== null && this.elapsed >= L.duration)
    if (completed || this.elapsed >= L.maxTime) this.finish()
  }

  /** Invitado: solo mueve a su jugador; lo demás llega del anfitrión. */
  private tickClient(dt: number) {
    if (!this.started || this.paused || this.ended) {
      this.combat.updateView(dt)
      return
    }
    this.moveLocal(dt)
    this.updateTarget(this.me)
    this.handleHold(this.me, dt)
    this.level.update(dt, this)
    this.combat.updateView(dt)
    this.updateDamage(dt)
    this.updateHint()
  }

  private finish() {
    this.ended = true
    this.combat.clear()
    this.arrow.visible = false
    this.level.onEnd(this)
    this.endTimer = this.level.endDelay
    this.ring.visible = false
    this.bar.sprite.visible = false
    this.sfx(this.isCompleted() && this.score >= this.level.minScore ? 'win' : 'bad')
  }

  private isCompleted() {
    const L = this.level
    return L.isComplete(this) || (L.duration !== null && this.elapsed >= L.duration)
  }

  private result(): LevelResult {
    const L = this.level
    const completed = this.isCompleted()
    return {
      levelId: L.id,
      score: this.score,
      time: this.elapsed,
      completed,
      passed: completed && this.score >= L.minScore,
      minScore: L.minScore,
      refScore: L.refScore,
      stats: { ...this.stats },
      moneyDelta: this.money - this.startMoney,
      summary: L.metrics(this),
    }
  }

  /* ---------------------------------------------------------------- */
  /* Jugadores                                                         */
  /* ---------------------------------------------------------------- */

  private moveLocal(dt: number) {
    const p = this.me
    const dir = new THREE.Vector3()
    const person = this.view !== 'top'
    if (!p.working && p.knocked <= 0 && !this.shopOpen) {
      let fwd = 0
      let side = 0
      if (this.keys.has('w') || this.keys.has('arrowup')) fwd += 1
      if (this.keys.has('s') || this.keys.has('arrowdown')) fwd -= 1
      if (this.keys.has('a') || this.keys.has('arrowleft')) side -= 1
      if (this.keys.has('d') || this.keys.has('arrowright')) side += 1
      if (person) {
        // W avanza hacia donde mira la cámara
        const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
        const r = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw))
        dir.addScaledVector(f, fwd).addScaledVector(r, side)
      } else {
        dir.set(side, 0, -fwd)
      }
    }
    p.moving = dir.lengthSq() > 0
    if (person) {
      // El personaje mira y apunta hacia donde mira la cámara
      p.facing = this.yaw
      const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
      p.aim.copy(p.pos).addScaledVector(f, 12).setY(1)
      if (p.moving) p.pos.addScaledVector(dir.normalize(), SPEED * this.combat.speedFactor * dt)
      this.collide(p.pos)
      return
    }
    const aiming = this.combat.enabled && p.firing && p.knocked <= 0
    if (p.moving) {
      dir.normalize()
      p.pos.addScaledVector(dir, SPEED * this.combat.speedFactor * dt)
    }
    if (aiming || p.moving) {
      const d = aiming ? this.combat.aimDir(p) : dir
      const want = Math.atan2(d.x, d.z)
      let diff = want - p.facing
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      p.facing += diff * Math.min(1, dt * (aiming ? 25 : 14))
    }
    this.collide(p.pos)
  }

  /** Dibuja a todos los jugadores (posición, animación, arma y nombre). */
  private animatePlayers(dt: number) {
    for (const p of this.players) {
      const remote = p !== this.me && this.role !== 'solo'
      if (remote) {
        // Suaviza el movimiento recibido por red
        p.pos.lerp(p.netPos, Math.min(1, dt * 12))
        let diff = p.netFacing - p.facing
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        p.facing += diff * Math.min(1, dt * 12)
      }
      const rig = p.rig
      rig.root.position.copy(p.pos)
      rig.root.rotation.y = p.facing
      if (p.knocked > 0) {
        rig.root.rotation.x = -Math.PI / 2
        rig.root.position.y = 0.3
      } else {
        rig.root.rotation.x = 0
      }
      if (p.moving) p.walkT += dt * 11
      else p.walkT *= 0.8
      const swing = Math.sin(p.walkT) * (p.moving ? 0.7 : 0)
      rig.legL.rotation.x = swing
      rig.legR.rotation.x = -swing
      rig.body.position.y = p.moving ? Math.abs(Math.sin(p.walkT)) * 0.08 : 0
      if (p.held) {
        rig.armL.rotation.x = rig.armR.rotation.x = -1.2
      } else if (p.working) {
        const w = Math.sin(this.clockT * 22) * 0.5
        rig.armL.rotation.x = -1.0 + w
        rig.armR.rotation.x = -1.0 - w
      } else {
        rig.armL.rotation.x = -swing
        rig.armR.rotation.x = swing
      }
      if (this.combat.enabled && p.firing && p.knocked <= 0) rig.armR.rotation.x = -1.5
      if (p.nameTag) p.nameTag.sprite.position.set(p.pos.x, 2.25, p.pos.z)
    }
  }

  private collide(p: THREE.Vector3) {
    for (const st of this.stations) {
      const [w, d] = st.size
      if (!w || !d) continue
      const c = st.object.position
      const cx = THREE.MathUtils.clamp(p.x, c.x - w / 2, c.x + w / 2)
      const cz = THREE.MathUtils.clamp(p.z, c.z - d / 2, c.z + d / 2)
      const dx = p.x - cx
      const dz = p.z - cz
      const dist = Math.hypot(dx, dz)
      if (dist < PLAYER_R) {
        if (dist > 1e-4) {
          p.x = cx + (dx / dist) * PLAYER_R
          p.z = cz + (dz / dist) * PLAYER_R
        } else {
          p.z = c.z + d / 2 + PLAYER_R
        }
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, BOUNDS.minX, BOUNDS.maxX)
    p.z = THREE.MathUtils.clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ)
  }

  private updateTarget(pl: Player) {
    if (this.ended) {
      pl.target = null
      if (pl === this.me) this.ring.visible = false
      return
    }
    const p = pl.pos
    const fwd = new THREE.Vector3(Math.sin(pl.facing), 0, Math.cos(pl.facing))
    let best: Station | null = null
    let bestScore = Infinity
    for (const st of this.stations) {
      const c = st.object.position
      const [w, d] = st.size
      const cx = THREE.MathUtils.clamp(p.x, c.x - w / 2, c.x + w / 2)
      const cz = THREE.MathUtils.clamp(p.z, c.z - d / 2, c.z + d / 2)
      const edge = Math.hypot(p.x - cx, p.z - cz) - PLAYER_R
      if (edge > REACH) continue
      const to = new THREE.Vector3(c.x - p.x, 0, c.z - p.z).normalize()
      const score = edge - fwd.dot(to) * 0.6
      if (score < bestScore) {
        bestScore = score
        best = st
      }
    }
    pl.target = best
    if (pl !== this.me) return
    if (best) {
      const [w, d] = best.size
      this.ring.visible = true
      this.ring.position.set(best.object.position.x, 0.03, best.object.position.z)
      const s = Math.max(w, d, 0.9) * 0.62 + Math.sin(this.clockT * 6) * 0.04
      this.ring.scale.set(s, s, s)
    } else {
      this.ring.visible = false
    }
  }

  private handleHold(p: Player, dt: number) {
    p.working = false
    if (p === this.me) this.bar.sprite.visible = false
    const st = p.target
    if (!st || p.knocked > 0) return
    const action = this.withActor(p, () => this.holdOf(st))
    if (!action) return
    const key = `${this.stations.indexOf(st)}:${action.key}`
    let progress = this.holdProgress.get(key) ?? 0
    if (p.interactDown) {
      p.working = true
      // El invitado solo muestra la animación; el anfitrión avanza el trabajo.
      if (this.isHost) {
        progress += dt
        if (progress >= action.duration) {
          this.holdProgress.delete(key)
          p.working = false
          this.withActor(p, () => {
            this.sfx('done')
            action.onDone()
          })
          return
        }
        this.holdProgress.set(key, progress)
      }
    }
    if (p === this.me && progress > 0) {
      this.bar.sprite.visible = true
      this.bar.set(progress / action.duration)
      this.bar.sprite.position.set(st.object.position.x, 2.7, st.object.position.z)
    }
  }

  private pressInteract(p: Player) {
    if (!this.started || this.paused || this.ended || p.knocked > 0) return
    if (this.role === 'client') {
      // Se envía la posición exacta para que el anfitrión vea la misma estación
      this.session?.send({ t: 'e', p: [p.pos.x, p.pos.z], f: p.facing })
      return
    }
    const st = p.target
    if (!st) return
    this.withActor(p, () => {
      if (this.holdOf(st)) return
      if (this.damaged.has(st)) {
        this.toast('Suelta lo que llevas para reparar la máquina', 'info')
        return
      }
      if (st.interact && st.prompt?.(this)) st.interact(this)
      else {
        const info = st.info?.(this)
        if (info) {
          this.toast(info, 'info')
          this.sfx('error')
        }
      }
    })
  }

  private promptText(): Prompt | null {
    if (this.me.knocked > 0) return { text: '😵 Derribado… te levantas en un momento', kind: 'info' }
    const st = this.me.target
    if (!st || this.ended) return null
    const hold = this.holdOf(st)
    if (hold) return { text: hold.label, kind: 'hold' }
    if (this.damaged.has(st)) return { text: `${st.name} — dañada: suelta lo que llevas para repararla`, kind: 'info' }
    const p = st.prompt?.(this)
    if (p) return { text: p, kind: 'tap' }
    const info = st.info?.(this)
    return { text: info ? `${st.name} — ${info}` : st.name, kind: 'info' }
  }

  /** Quita a un jugador que se desconectó. */
  private removePlayer(id: string) {
    const i = this.players.findIndex((p) => p.id === id)
    if (i < 0 || this.players[i] === this.me) return
    const p = this.players[i]
    this.scene.remove(p.rig.root)
    if (p.nameTag) this.scene.remove(p.nameTag.sprite)
    this.players.splice(i, 1)
    this.showToast(`👋 ${p.name} salió de la partida`, 'warn')
  }

  /* ---------------------------------------------------------------- */
  /* Red                                                               */
  /* ---------------------------------------------------------------- */

  private onNet(from: string, msg: NetMsg) {
    if (this.role === 'client') {
      if (msg.t === 'snap') this.applySnapshot(msg as unknown as Snap)
      return
    }
    if (msg.t === 'leave') {
      this.removePlayer(from)
      return
    }
    const p = this.players.find((pl) => pl.id === from)
    if (!p) return
    switch (msg.t) {
      case 'in':
        p.netPos.set(msg.p[0], 0, msg.p[1])
        p.netFacing = msg.f
        p.aim.set(msg.a[0], 1, msg.a[1])
        p.firing = !!msg.fi
        p.interactDown = !!msg.h
        p.moving = !!msg.mv
        if (msg.w !== p.weapon) this.combat.select(p, msg.w, false)
        break
      case 'e':
        p.netPos.set(msg.p[0], 0, msg.p[1])
        p.pos.copy(p.netPos)
        p.facing = p.netFacing = msg.f
        this.updateTarget(p)
        this.pressInteract(p)
        break
      case 'buy':
        if (this.started && !this.ended) this.doBuy(p, String(msg.id))
        break
    }
  }

  private sendInput() {
    const p = this.me
    this.session?.send({
      t: 'in',
      p: [p.pos.x, p.pos.z],
      f: p.facing,
      a: [p.aim.x, p.aim.z],
      fi: p.firing,
      h: p.interactDown,
      mv: p.moving,
      w: p.weapon,
    })
  }

  private sendSnapshot() {
    if (!this.session) return
    const sy: Record<string, unknown> = {}
    for (const [k, s] of this.syncs) sy[k] = s.get()
    const snap: Snap = {
      st: this.started,
      pa: this.paused,
      en: this.ended,
      el: this.elapsed,
      sc: this.score,
      mo: this.money,
      la: this.lateApplied,
      stats: this.stats,
      pl: this.players.map((p) => ({
        id: p.id,
        x: p.pos.x,
        z: p.pos.z,
        f: p.facing,
        hp: Math.round(p.hp),
        kn: p.knocked,
        tp: p.tp,
        w: p.weapon,
        fi: p.firing,
        wk: p.working,
        mv: p.moving,
        h: p.held ? { k: p.held.kind, d: p.held.data } : null,
      })),
      sy,
      dm: [...this.damaged.keys()].map((st) => this.stations.indexOf(st)),
      hd: [...this.holdProgress.entries()],
      cb: this.combat.snapshot(),
      fx: this.fx,
    }
    this.fx = []
    this.session.broadcast({ t: 'snap', ...snap })
  }

  private applySnapshot(s: Snap) {
    this.started = s.st
    this.paused = s.pa
    this.ended = s.en
    this.elapsed = s.el
    this.score = s.sc
    this.money = s.mo
    this.lateApplied = s.la
    Object.assign(this.stats, s.stats)

    for (const ps of s.pl) {
      const p = this.players.find((pl) => pl.id === ps.id)
      if (!p) continue
      if (p === this.me) {
        if (ps.tp !== p.tp) {
          p.tp = ps.tp
          p.pos.set(ps.x, 0, ps.z)
        }
        if (ps.hp < p.hp) p.hurtAt = this.elapsed
      } else {
        p.netPos.set(ps.x, 0, ps.z)
        p.netFacing = ps.f
        p.firing = ps.fi
        p.working = ps.wk
        p.moving = ps.mv
      }
      p.hp = ps.hp
      p.knocked = ps.kn
      if (ps.w !== p.weapon || !p.gun) this.combat.equip(p, ps.w)
      this.mirrorHeld(p, ps.h)
    }
    // Quitar jugadores que ya no están
    for (const p of [...this.players]) if (!s.pl.some((ps) => ps.id === p.id) && p !== this.me) this.removePlayer(p.id)

    for (const [k, v] of Object.entries(s.sy)) {
      const entry = this.syncs.get(k)
      if (!entry) continue
      const json = JSON.stringify(v)
      if (json === entry.last) continue
      entry.last = json
      entry.set(v as never)
    }

    const dm = new Set(s.dm.map((i) => this.stations[i]))
    for (const st of [...this.damaged.keys()]) if (!dm.has(st)) this.unmarkDamaged(st)
    for (const st of dm) if (st && !this.damaged.has(st)) this.markDamaged(st)

    this.holdProgress.clear()
    for (const [k, v] of s.hd) this.holdProgress.set(k, v)

    this.combat.restore(s.cb)

    for (const f of s.fx) {
      if (f.t === 'f') this.showFloat(f.s, f.c, new THREE.Vector3().fromArray(f.p))
      else if (f.t === 't') {
        if (f.to === null || f.to === this.me.id) this.showToast(f.s, f.tone)
      } else if (f.t === 's') play(f.n)
      else if (f.t === 'b') this.combat.visualBullet(new THREE.Vector3().fromArray(f.p), new THREE.Vector3(f.v[0], 0, f.v[1]), f.k)
      else if (f.t === 'x') this.showBoom(new THREE.Vector3().fromArray(f.p), f.r)
      else if (f.t === 'z') this.showZap(new THREE.Vector3().fromArray(f.a), new THREE.Vector3().fromArray(f.b))
    }
  }

  /** Invitado: copia lo que lleva cada jugador según el anfitrión. */
  private mirrorHeld(p: Player, h: { k: ItemKind; d: ItemData } | null) {
    const key = h ? JSON.stringify(h) : ''
    if (key === p.heldKey) return
    p.heldKey = key
    if (p.held) {
      p.rig.hands.remove(p.held.mesh)
      disposeObject(p.held.mesh, false)
      p.held = null
    }
    if (h) {
      const item = makeItem(h.k, h.d)
      p.held = item
      p.rig.hands.add(item.mesh)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Cámara, textos flotantes y HUD                                    */
  /* ---------------------------------------------------------------- */

  private updateCamera(dt: number) {
    const me = this.me
    if (this.view !== 'top') {
      const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
      const down = me.knocked > 0
      if (this.view === 'first') {
        const eye = me.pos.clone().add(new THREE.Vector3(0, down ? 0.4 : 1.45, 0)).addScaledVector(f, 0.12)
        this.camera.position.copy(eye)
        const look = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
        this.camera.lookAt(eye.clone().add(look))
      } else {
        // Tercera persona: detrás y arriba del personaje
        // Tercera persona: detrás y sobre el hombro derecho, para que el personaje no tape la mira
        const dist = 5.2
        const elev = THREE.MathUtils.clamp(this.pitch, 0.05, 1.1)
        const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw))
        const goal = me.pos
          .clone()
          .addScaledVector(f, -dist * Math.cos(elev))
          .addScaledVector(right, 0.9)
          .add(new THREE.Vector3(0, 1.4 + dist * Math.sin(elev), 0))
        this.camera.position.lerp(goal, Math.min(1, dt * 12 || 1))
        this.camera.lookAt(me.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(f, 3).addScaledVector(right, 0.9))
      }
      this.camFocus.copy(me.pos)
      return
    }
    const aspect = this.camera.aspect
    // En pantallas angostas la cámara se aleja y sigue más al jugador en X.
    const narrow = aspect < 1.2
    const dist = narrow ? 1.25 : aspect < 1.6 ? 1.12 : 1
    const pos = this.me.pos
    const goal = new THREE.Vector3(pos.x * (narrow ? 0.75 : 0.35), 0, (narrow ? -1.6 : -0.3) + pos.z * 0.3)
    this.camFocus.lerp(goal, Math.min(1, dt * 3 || 1))
    this.camera.position.set(this.camFocus.x, 16.5 * dist, this.camFocus.z + 12.5 * dist)
    this.camera.lookAt(this.camFocus)
  }

  private updateFloats(dt: number) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]
      f.life -= dt
      f.label.sprite.position.y += dt * 1.3
      f.label.opacity = Math.min(1, f.life * 2)
      if (f.life <= 0) {
        this.scene.remove(f.label.sprite)
        disposeObject(f.label.sprite)
        this.floats.splice(i, 1)
      }
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      if (this.toasts[i].until < this.clockT) this.toasts.splice(i, 1)
    }
  }

  private emitHud() {
    const L = this.level
    const me = this.me
    this.cb.onHud({
      levelId: L.id,
      score: this.score,
      money: this.money,
      elapsed: this.elapsed,
      deadline: L.deadline,
      duration: L.duration,
      late: this.lateApplied,
      resources: L.resources(this),
      objectives: L.objectives(this),
      metrics: L.metrics(this),
      alerts: [...L.alerts(this), ...[...this.damaged.keys()].map((s) => `🧟 ${s.name} dañada — mantén E para reparar`)],
      orders: L.orders(this),
      upgrades: [...this.combat.shopItems(me), ...L.upgrades(this)],
      prompt: this.started ? this.promptText() : null,
      held: me.held?.label ?? null,
      hint: this.started && !this.ended ? (L.hint(this)?.text ?? null) : null,
      hp: Math.round(me.hp),
      knocked: Math.max(0, me.knocked),
      hurtAt: me.hurtAt,
      weapons: this.combat.weapons(me),
      zombies: {
        enabled: this.combat.enabled,
        alive: this.combat.alive,
        wave: this.combat.wave,
        nextWave: this.combat.nextWaveIn(),
        kills: this.combat.kills,
        bosses: this.combat.bosses(),
      },
      shopOpen: this.shopOpen,
      view: this.view,
      locked: this.locked,
      started: this.started,
      role: this.role,
      team: this.players.map((p) => ({ name: p.name, color: p.color, hp: Math.round(p.hp), me: p === me, knocked: p.knocked > 0 })),
      minScore: L.minScore,
      paused: this.paused,
      ended: this.ended,
      toasts: this.toasts.map(({ id, text, tone }) => ({ id, text, tone })),
    })
  }

  private onResize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* ---------------------------------------------------------------- */
  /* Teclado y mouse                                                   */
  /* ---------------------------------------------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    if (k === 'escape') {
      if (this.shopOpen) this.setShop(false)
      else if (this.role === 'client') this.cb.onEscape?.()
      else this.setPaused(!this.paused)
      return
    }
    if (this.paused) return
    if (k === 'b' || k === 'tab') {
      e.preventDefault()
      if (!e.repeat) this.setShop(!this.shopOpen)
      return
    }
    if (this.shopOpen) return
    if (k === 'v' || k === 'c') {
      if (!e.repeat) this.cycleView()
      return
    }
    if (this.combat.selectByKey(this.me, k)) {
      this.emitHud()
      return
    }
    if (k === 'e' || k === ' ') {
      if (!e.repeat) this.pressInteract(this.me)
      this.me.interactDown = true
      return
    }
    this.keys.add(k)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (k === 'e' || k === ' ') this.me.interactDown = false
    else this.keys.delete(k)
  }

  private onBlur = () => {
    this.keys.clear()
    this.me.firing = false
    this.me.interactDown = false
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.view !== 'top') {
      if (!this.locked) return
      this.yaw -= e.movementX * 0.0025
      const min = this.view === 'first' ? -1.2 : 0.05
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0025 * (this.view === 'first' ? 1 : -1), min, this.view === 'first' ? 1.2 : 1.1)
      return
    }
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.aimPlane, hit)) {
      this.me.aim.copy(hit)
      this.aimT = this.clockT
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    if (this.view !== 'top' && !this.locked) {
      // El primer clic captura el mouse para girar la cámara
      if (this.started && !this.paused && !this.shopOpen) void this.renderer.domElement.requestPointerLock()
      return
    }
    if (this.view === 'top') this.onPointerMove(e)
    if (!this.started || this.paused || this.shopOpen || this.ended) return
    this.me.firing = true
  }

  private onPointerUp = () => {
    this.me.firing = false
  }

  private onContextMenu = (e: Event) => e.preventDefault()

  /* ---------------------------------------------------------------- */
  /* Segundo plano                                                     */
  /* ---------------------------------------------------------------- */

  private bgWorker: Worker | null = null

  /**
   * Si la pestaña del anfitrión se oculta, el navegador pausa la animación
   * y la partida se congelaría para los invitados. Un Web Worker (que el
   * navegador no pausa) sigue marcando el ritmo del juego.
   */
  private onVisibility = () => {
    if (document.hidden && this.role === 'host') this.startBackgroundTicker()
    else this.stopBackgroundTicker()
  }

  private startBackgroundTicker() {
    if (this.bgWorker) return
    const code = 'setInterval(() => postMessage(0), 33)'
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    this.bgWorker = new Worker(url)
    URL.revokeObjectURL(url)
    this.bgWorker.onmessage = () => this.frame(performance.now())
  }

  private stopBackgroundTicker() {
    this.bgWorker?.terminate()
    this.bgWorker = null
  }

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
    if (!this.locked) this.me.firing = false
    this.emitHud()
  }

  /* ---------------------------------------------------------------- */
  /* Máquinas dañadas y flecha de ayuda                                */
  /* ---------------------------------------------------------------- */

  private updateDamage(dt: number) {
    for (const [st, d] of this.damaged) {
      d.smoke -= dt
      d.label.sprite.position.y = 3.1 + Math.sin(this.clockT * 5) * 0.08
      if (d.smoke <= 0) {
        d.smoke = 0.25
        const puff = ball(0.2 + Math.random() * 0.1, 0x4b5563, [st.object.position.x + (Math.random() - 0.5), 1.8, st.object.position.z])
        puff.castShadow = false
        this.scene.add(puff)
        this.smoke.push({ mesh: puff, life: 1.1 })
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i]
      s.life -= dt
      s.mesh.position.y += dt * 1.1
      s.mesh.scale.setScalar(1 + (1.1 - s.life))
      if (s.life <= 0) {
        this.scene.remove(s.mesh)
        s.mesh.geometry.dispose()
        this.smoke.splice(i, 1)
      }
    }
    this.reticle.visible = this.view === 'top' && this.combat.enabled && this.clockT - this.aimT < 3
    this.reticle.position.set(this.me.aim.x, 0.05, this.me.aim.z)
  }

  private updateHint() {
    const hint = this.ended ? null : this.level.hint(this)
    this.arrow.visible = !!hint && hint.target !== this.me.target?.object
    if (hint) {
      const p = hint.target.position
      this.arrow.position.set(p.x, 3.3 + Math.sin(this.clockT * 5) * 0.2, p.z)
      this.arrow.rotation.y += 0.04
    }
  }

  /** Teletransporta a un jugador (reaparecer tras ser derribado). */
  respawn(p: Player) {
    p.pos.set(0, 0, 3.5)
    p.netPos.copy(p.pos)
    p.tp++
  }
}

/** Libera geometrías (y materiales, salvo los compartidos de la caché si `materials` es false). */
export function disposeObject(root: THREE.Object3D, materials = true) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    if (!materials) return
    const m = mesh.material
    for (const material of Array.isArray(m) ? m : m ? [m] : []) {
      ;(material as THREE.MeshBasicMaterial).map?.dispose()
      material.dispose()
    }
  })
}
