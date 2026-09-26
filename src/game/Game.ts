import * as THREE from 'three'
import { buildFactory } from './env'
import { Combat } from './combat'
import { ball, clearMaterialCache, makeHintArrow, makeWorker, type WorkerRig } from './models'
import { ProgressSprite, TextSprite } from './sprites'
import { play, type SfxName } from './sfx'
import { createLevel } from './levels'
import type { HoldAction, HudState, Item, Level, LevelId, LevelResult, LevelStats, Prompt, StatKey, Station, Toast } from './types'

const BOUNDS = { minX: -12.4, maxX: 12.4, minZ: -7.6, maxZ: 8.6 }
const PLAYER_R = 0.38
const SPEED = 5.8
const REACH = 0.95

export interface GameCallbacks {
  onHud: (hud: HudState) => void
  onEnd: (result: LevelResult) => void
}

export interface GameOptions {
  zombies: boolean
}

/**
 * Motor del juego: escena Three.js, jugador, estaciones, puntaje y dinero.
 * La lógica específica de cada tipo de producción vive en `levels/`.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly level: Level
  readonly stats: LevelStats = { correct: 0, waste: 0, wrong: 0, late: 0, stops: 0, materials: 0, earned: 0, spent: 0 }
  score = 0
  money: number
  elapsed = 0
  held: Item | null = null
  readonly playerPos = new THREE.Vector3(0, 0, 3.5)
  readonly rig: WorkerRig
  readonly combat: Combat

  private readonly startMoney: number
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly container: HTMLElement
  private readonly cb: GameCallbacks
  private readonly stations: Station[] = []
  private readonly damaged = new Map<Station, { label: TextSprite; smoke: number }>()
  private readonly smoke: { mesh: THREE.Mesh; life: number }[] = []
  private readonly arrow = makeHintArrow()
  private readonly raycaster = new THREE.Raycaster()
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1)
  private readonly reticle: THREE.Mesh
  private aimT = -10
  private shopOpen = false
  private readonly keys = new Set<string>()
  private readonly holdProgress = new Map<string, number>()
  private readonly toasts: (Toast & { until: number })[] = []
  private readonly floats: { label: TextSprite; life: number }[] = []
  private readonly ring: THREE.Mesh
  private readonly bar = new ProgressSprite()
  private readonly camFocus = new THREE.Vector3(0, 0, 0)
  private readonly resize: ResizeObserver
  private target: Station | null = null
  private facing = Math.PI
  private walkT = 0
  private working = false
  private started = false
  private paused = false
  private ended = false
  private endTimer = 0
  private endSent = false
  private lateApplied = false
  private toastSeq = 0
  private hudTimer = 0
  private lastT = 0
  private clockT = 0

  constructor(container: HTMLElement, levelId: LevelId, money: number, cb: GameCallbacks, opts: GameOptions) {
    this.container = container
    this.cb = cb
    this.money = money
    this.startMoney = money

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
    this.scene.background = new THREE.Color(0xbfe3ff)
    this.scene.fog = new THREE.Fog(0xbfe3ff, 45, 90)

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb6c3d1, 1.6)
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2)
    sun.position.set(-8, 18, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const s = sun.shadow.camera
    s.left = -16
    s.right = 16
    s.top = 14
    s.bottom = -14
    s.far = 60
    sun.shadow.bias = -0.0005
    this.scene.add(hemi, sun)

    buildFactory(this.scene)

    this.rig = makeWorker()
    this.scene.add(this.rig.root)

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

    this.level = createLevel(levelId)
    this.level.build(this)

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
    this.renderer.setAnimationLoop((t) => this.frame(t))
  }

  /* ---------------------------------------------------------------- */
  /* API para los niveles                                              */
  /* ---------------------------------------------------------------- */

  addStation(station: Station) {
    this.stations.push(station)
    if (!station.object.parent) this.scene.add(station.object)
    return station
  }

  take(item: Item) {
    this.held = item
    item.mesh.position.set(0, 0, 0)
    item.mesh.rotation.set(0, 0, 0)
    item.mesh.scale.setScalar(1)
    this.rig.hands.add(item.mesh)
    this.sfx('pick')
  }

  release(): Item {
    const item = this.held!
    this.rig.hands.remove(item.mesh)
    this.held = null
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
      this.toast(`${points >= 0 ? '+' : ''}${points} · ${text}`, points >= 0 ? 'good' : 'bad')
      this.sfx(points >= 0 ? 'good' : 'bad')
    }
  }

  earn(amount: number, at?: THREE.Vector3, silent = false) {
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

  toast(text: string, tone: Toast['tone'] = 'info') {
    const same = this.toasts.findIndex((t) => t.text === text)
    if (same >= 0) this.toasts.splice(same, 1)
    this.toasts.push({ id: ++this.toastSeq, text, tone, until: this.clockT + 3.2 })
    while (this.toasts.length > 4) this.toasts.shift()
  }

  float(text: string, color: string, at: THREE.Vector3) {
    const label = new TextSprite(text, { bg: null, fg: color, stroke: '#ffffff', lineHeight: 0.55 })
    label.sprite.position.copy(at)
    this.scene.add(label.sprite)
    this.floats.push({ label, life: 1.3 })
  }

  sfx(name: SfxName) {
    play(name)
  }

  /** Pérdida forzada (robos, derribos): el dinero no baja de 0. */
  loseMoney(amount: number, at?: THREE.Vector3) {
    const lost = Math.min(this.money, amount)
    if (lost <= 0) return
    this.money -= lost
    this.stats.spent += lost
    this.float(`-$${lost}`, '#b45309', (at ?? this.playerPos.clone().setY(2.4)).clone())
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
      this.toast(`🧟 ¡Un zombi dañó ${st.name}!`, 'bad')
      this.sfx('alarm')
      return
    }
    if (this.damaged.has(st)) return
    const label = new TextSprite('🧟 ¡Dañada! Mantén E', { bg: 'rgba(220,38,38,0.92)', fg: '#ffffff', lineHeight: 0.34 })
    label.sprite.position.copy(st.object.position).setY(3.1)
    this.scene.add(label.sprite)
    this.damaged.set(st, { label, smoke: 0 })
    this.toast(`🧟 ¡Un zombi dañó ${st.name}! Mantén E junto a ella para repararla`, 'bad')
    this.sfx('alarm')
  }

  repairStation(st: Station) {
    const d = this.damaged.get(st)
    if (!d) return
    this.scene.remove(d.label.sprite)
    disposeObject(d.label.sprite)
    this.damaged.delete(st)
    this.toast(`🔧 ${st.name} reparada`, 'good')
  }

  /** Acción de mantener E, considerando si la estación está dañada. */
  private holdOf(st: Station): HoldAction | null {
    if (this.damaged.has(st)) {
      if (this.held) return null
      return { key: 'zrepair', label: `Reparar ${st.name}`, duration: 2, onDone: () => this.repairStation(st) }
    }
    return st.hold?.(this) ?? null
  }

  get isLate() {
    return this.lateApplied
  }

  /* ---------------------------------------------------------------- */
  /* Control desde React                                               */
  /* ---------------------------------------------------------------- */

  start() {
    this.started = true
    this.lastT = 0
  }

  setPaused(value: boolean) {
    if (!this.started || this.ended) return
    this.paused = value
    this.keys.clear()
    this.emitHud()
  }

  buy(id: string) {
    if (!this.started || this.ended) return
    if (!this.combat.buy(id)) this.level.buy(id, this)
    this.emitHud()
  }

  selectWeapon(id: string) {
    this.combat.select(id)
    this.emitHud()
  }

  setShop(open: boolean) {
    if (!this.started || this.ended || this.paused) return
    this.shopOpen = open
    this.keys.clear()
    this.combat.firing = false
    this.emitHud()
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pointerup', this.onPointerUp)
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.resize.disconnect()
    if (this.held) disposeObject(this.held.mesh, false)
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

    if (this.started && !this.paused && !this.shopOpen) this.tick(dt)

    this.updateCamera(dt)
    this.updateFloats(dt)
    this.renderer.render(this.scene, this.camera)

    this.hudTimer -= dt
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1
      this.emitHud()
    }
  }

  private tick(dt: number) {
    if (!this.ended) this.elapsed += dt
    this.updateTarget()
    this.handleHold(dt)
    this.movePlayer(dt)
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
  /* Jugador                                                           */
  /* ---------------------------------------------------------------- */

  private movePlayer(dt: number) {
    const dir = new THREE.Vector3()
    const knocked = this.combat.knocked > 0
    if (!this.working && !knocked) {
      if (this.keys.has('w') || this.keys.has('arrowup')) dir.z -= 1
      if (this.keys.has('s') || this.keys.has('arrowdown')) dir.z += 1
      if (this.keys.has('a') || this.keys.has('arrowleft')) dir.x -= 1
      if (this.keys.has('d') || this.keys.has('arrowright')) dir.x += 1
    }
    const moving = dir.lengthSq() > 0
    // Mientras disparas, el personaje mira hacia donde apunta el mouse.
    const aiming = this.combat.enabled && this.combat.firing && !knocked
    if (moving) {
      dir.normalize()
      this.playerPos.addScaledVector(dir, SPEED * dt)
    }
    if (aiming || moving) {
      const d = aiming ? this.combat.aimDir() : dir
      const want = Math.atan2(d.x, d.z)
      let diff = want - this.facing
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      this.facing += diff * Math.min(1, dt * (aiming ? 25 : 14))
    }
    this.collide()

    const rig = this.rig
    rig.root.position.copy(this.playerPos)
    rig.root.rotation.y = this.facing
    if (moving) this.walkT += dt * 11
    else this.walkT *= 0.8
    const swing = Math.sin(this.walkT) * (moving ? 0.7 : 0)
    rig.legL.rotation.x = swing
    rig.legR.rotation.x = -swing
    rig.body.position.y = moving ? Math.abs(Math.sin(this.walkT)) * 0.08 : 0
    if (this.held) {
      rig.armL.rotation.x = rig.armR.rotation.x = -1.2
    } else if (this.working) {
      const w = Math.sin(this.clockT * 22) * 0.5
      rig.armL.rotation.x = -1.0 + w
      rig.armR.rotation.x = -1.0 - w
    } else {
      rig.armL.rotation.x = -swing
      rig.armR.rotation.x = swing
    }
  }

  private collide() {
    const p = this.playerPos
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

  private updateTarget() {
    if (this.ended) {
      this.target = null
      return
    }
    const p = this.playerPos
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing))
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
    this.target = best
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

  private handleHold(dt: number) {
    this.working = false
    this.bar.sprite.visible = false
    const st = this.target
    if (!st || this.combat.knocked > 0) return
    const action = this.holdOf(st)
    if (!action) return
    const key = `${this.stations.indexOf(st)}:${action.key}`
    let progress = this.holdProgress.get(key) ?? 0
    if (this.keys.has('interact')) {
      this.working = true
      progress += dt
      if (progress >= action.duration) {
        this.holdProgress.delete(key)
        this.working = false
        this.sfx('done')
        action.onDone()
        return
      }
      this.holdProgress.set(key, progress)
    }
    if (progress > 0) {
      this.bar.sprite.visible = true
      this.bar.set(progress / action.duration)
      this.bar.sprite.position.set(st.object.position.x, 2.7, st.object.position.z)
    }
  }

  private pressInteract() {
    if (!this.started || this.paused || this.ended || this.combat.knocked > 0) return
    const st = this.target
    if (!st) return
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
  }

  private promptText(): Prompt | null {
    if (this.combat.knocked > 0) return { text: '😵 Derribado… te levantas en un momento', kind: 'info' }
    const st = this.target
    if (!st || this.ended) return null
    const hold = this.holdOf(st)
    if (hold) return { text: hold.label, kind: 'hold' }
    if (this.damaged.has(st)) return { text: `${st.name} — dañada: suelta lo que llevas para repararla`, kind: 'info' }
    const p = st.prompt?.(this)
    if (p) return { text: p, kind: 'tap' }
    const info = st.info?.(this)
    return { text: info ? `${st.name} — ${info}` : st.name, kind: 'info' }
  }

  /* ---------------------------------------------------------------- */
  /* Cámara, textos flotantes y HUD                                    */
  /* ---------------------------------------------------------------- */

  private updateCamera(dt: number) {
    const aspect = this.camera.aspect
    // En pantallas angostas la cámara se aleja y sigue más al jugador en X.
    const narrow = aspect < 1.2
    const dist = narrow ? 1.25 : aspect < 1.6 ? 1.12 : 1
    const goal = new THREE.Vector3(this.playerPos.x * (narrow ? 0.75 : 0.35), 0, (narrow ? -1.6 : -0.3) + this.playerPos.z * 0.3)
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
      upgrades: [...this.combat.shopItems(), ...L.upgrades(this)],
      prompt: this.started ? this.promptText() : null,
      held: this.held?.label ?? null,
      hint: this.started && !this.ended ? (L.hint(this)?.text ?? null) : null,
      hp: Math.round(this.combat.hp),
      knocked: Math.max(0, this.combat.knocked),
      hurtAt: this.combat.hurtAt,
      weapons: this.combat.weapons(),
      zombies: {
        enabled: this.combat.enabled,
        alive: this.combat.alive,
        wave: this.combat.wave,
        nextWave: this.combat.nextWaveIn(),
        kills: this.combat.kills,
        bosses: this.combat.bosses(),
      },
      shopOpen: this.shopOpen,
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
  /* Teclado                                                           */
  /* ---------------------------------------------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    if (k === 'escape') {
      if (this.shopOpen) this.setShop(false)
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
    if (this.combat.selectByKey(k)) {
      this.emitHud()
      return
    }
    if (k === 'e' || k === ' ') {
      if (!e.repeat) this.pressInteract()
      this.keys.add('interact')
      return
    }
    this.keys.add(k)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    this.keys.delete(k === 'e' || k === ' ' ? 'interact' : k)
  }

  private onBlur = () => {
    this.keys.clear()
    this.combat.firing = false
  }

  /* ---------------------------------------------------------------- */
  /* Mouse: apuntar y disparar                                         */
  /* ---------------------------------------------------------------- */

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.aimPlane, hit)) {
      this.combat.aim.copy(hit)
      this.aimT = this.clockT
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    this.onPointerMove(e)
    if (!this.started || this.paused || this.shopOpen || this.ended) return
    this.combat.firing = true
  }

  private onPointerUp = () => {
    this.combat.firing = false
  }

  private onContextMenu = (e: Event) => e.preventDefault()

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
    this.reticle.visible = this.combat.enabled && this.clockT - this.aimT < 3
    this.reticle.position.set(this.combat.aim.x, 0.05, this.combat.aim.z)
  }

  private updateHint() {
    const hint = this.ended ? null : this.level.hint(this)
    this.arrow.visible = !!hint && hint.target !== this.target?.object
    if (hint) {
      const p = hint.target.position
      this.arrow.position.set(p.x, 3.3 + Math.sin(this.clockT * 5) * 0.2, p.z)
      this.arrow.rotation.y += 0.04
    }
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
