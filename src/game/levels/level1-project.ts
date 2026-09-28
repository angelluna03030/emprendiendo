import * as THREE from 'three'
import type { Game } from '../Game'
import { CATALOG } from '../items'
import { makeDrone, makeItemMesh, makePlatform, makeSatelliteParts, makeTerminal } from '../models'
import type { TextSprite } from '../sprites'
import type { BuyKind, Hint, Metric, Objective, Resources, Upgrade } from '../types'
import { addShelf, addTable, addTrash, at, BaseLevel, fmtTime, label, place, timeBonus } from './common'

interface Stage {
  name: string
  needs: Partial<Record<BuyKind, number>>
  where: 'platform' | 'terminal'
  work: string
  duration: number
}

const STAGES: Stage[] = [
  { name: 'Estructura', needs: { aluminio: 2 }, where: 'platform', work: 'Ensamblar estructura', duration: 2.5 },
  { name: 'Electrónica', needs: { placa: 1, cpu: 1 }, where: 'platform', work: 'Soldar circuitos', duration: 2.5 },
  { name: 'Energía', needs: { panel_solar: 2, bateria: 1 }, where: 'platform', work: 'Instalar energía solar', duration: 2.5 },
  { name: 'Software', needs: {}, where: 'terminal', work: 'Programar firmware', duration: 4 },
  { name: 'Pruebas', needs: {}, where: 'platform', work: 'Pruebas de calidad', duration: 3 },
]

const PAYMENT = 900
const LATE_PAYMENT = 600
const DRONE_COST = 180

/**
 * Producción por proyecto: un único producto (satélite) que se construye
 * en un lugar fijo, por etapas y con fecha límite.
 */
export class ProjectLevel extends BaseLevel {
  id = 1 as const
  deadline = 150
  duration = null
  maxTime = 330
  minScore = Math.round(50 * this.f)
  refScore = Math.round(100 * this.f)
  /** Con más jugadores el satélite necesita más piezas. */
  private stages: Stage[] = STAGES.map((st) => ({
    ...st,
    needs: Object.fromEntries(Object.entries(st.needs).map(([k, n]) => [k, Math.round((n ?? 0) * this.f)])),
  }))
  endDelay = 3
  theme = 'space' as const

  private stage = 0
  private delivered: Partial<Record<BuyKind, number>> = {}
  private shipped = false
  private satellite = new THREE.Group()
  private sat = makeSatelliteParts()
  private tag!: TextSprite
  private screen!: THREE.MeshStandardMaterial
  private shelves: Partial<Record<BuyKind, THREE.Object3D>> = {}
  private platform!: THREE.Object3D
  private terminal!: THREE.Object3D
  private trash!: THREE.Object3D
  private drone: THREE.Group | null = null
  private droneJob: { kind: BuyKind; phase: 'shelf' | 'platform'; cargo: THREE.Object3D | null } | null = null
  private droneWait = 0

  build(g: Game) {
    // Estado compartido con los invitados
    g.sync(
      'proyecto',
      () => ({ stage: this.stage, delivered: this.delivered, shipped: this.shipped }),
      (v) => {
        this.stage = v.stage
        this.delivered = v.delivered
        this.shipped = v.shipped
        this.sat.parts.forEach((part, i) => (part.visible = i < this.stage))
        this.sat.ghost.visible = this.stage === 0
      },
    )
    g.sync(
      'dron',
      () => (this.drone ? { p: this.drone.position.toArray(), c: this.droneJob?.cargo ? this.droneJob.kind : null } : null),
      (v) => {
        if (!v) return
        if (!this.drone) {
          this.drone = makeDrone()
          g.scene.add(this.drone)
        }
        this.drone.position.fromArray(v.p)
        const cargo = this.drone.getObjectByName('cargo')
        if (cargo && (!v.c || cargo.userData.kind !== v.c)) this.drone.remove(cargo)
        if (v.c && !this.drone.getObjectByName('cargo')) {
          const mesh = makeItemMesh(v.c)
          mesh.name = 'cargo'
          mesh.userData.kind = v.c
          mesh.position.set(0, -0.6, 0)
          this.drone.add(mesh)
        }
      },
    )
    const shelves: [BuyKind, number][] = [['aluminio', -9], ['placa', -6.4], ['cpu', -3.8], ['panel_solar', 3.8], ['bateria', 6.4]]
    for (const [kind, x] of shelves) this.shelves[kind] = addShelf(g, kind, x, -6.4).object
    addTable(g, -6.5, 2.8)
    addTable(g, 6.5, 2.8)
    this.trash = addTrash(g, -11.2, 6.5).object

    // Plataforma del proyecto
    const platform = place(makePlatform(), 0, -1.6)
    this.platform = platform
    this.satellite.position.y = 0.26
    this.satellite.add(this.sat.ghost, ...this.sat.parts)
    platform.add(this.satellite)
    this.tag = label(platform, '', 3.2, { lineHeight: 0.36 })
    g.addStation({
      name: 'Plataforma del proyecto',
      object: platform,
      size: [2.6, 2.6],
      machine: true,
      hold: (g) => {
        const s = this.stages[this.stage]
        if (this.shipped || !s || g.held || s.where !== 'platform' || !this.stageReady()) return null
        return { key: `s${this.stage}`, label: s.work, duration: s.duration, onDone: () => this.completeStage(g, platform) }
      },
      prompt: (g) => {
        if (this.shipped) return null
        if (this.stage >= this.stages.length && !g.held) return 'Entregar el satélite al cliente 🚀'
        if (g.held && this.needs(g.held.kind as BuyKind) > 0) return `Instalar ${g.held.label}`
        return null
      },
      info: (g) => {
        const s = this.stages[this.stage]
        if (!s) return null
        if (g.held) return `Esta pieza no se necesita en la etapa ${s.name}`
        if (s.where === 'terminal') return 'Ve a la terminal para programar el firmware'
        return `Faltan: ${this.missing().join(', ')}`
      },
      interact: (g) => {
        if (this.stage >= this.stages.length) {
          this.ship(g, platform)
          return
        }
        const item = g.consumeHeld()
        const kind = item.kind as BuyKind
        this.delivered[kind] = (this.delivered[kind] ?? 0) + 1
        g.float('✓', '#16a34a', at(platform, 2.4))
        if (this.stageReady()) g.toast(`Materiales listos: mantén E para "${this.stages[this.stage].work}"`, 'info')
      },
    })

    // Terminal de programación
    const terminal = makeTerminal()
    this.screen = terminal.screen
    place(terminal.group, 9.5, -2.5, -Math.PI / 2)
    this.terminal = terminal.group
    label(terminal.group, '💻 Terminal', 2.3, { lineHeight: 0.32 })
    g.addStation({
      name: 'Terminal de software',
      object: terminal.group,
      size: [0.9, 1.6],
      machine: true,
      hold: (g) => {
        const s = this.stages[this.stage]
        if (!s || s.where !== 'terminal' || g.held) return null
        return { key: 'firmware', label: s.work, duration: s.duration, onDone: () => this.completeStage(g, platform) }
      },
      info: () => 'Se usa en la etapa Software',
    })
  }

  private needs(kind: BuyKind) {
    const s = this.stages[this.stage]
    if (!s) return 0
    return (s.needs[kind] ?? 0) - (this.delivered[kind] ?? 0)
  }

  private missing() {
    const s = this.stages[this.stage]
    return Object.entries(s.needs)
      .filter(([k]) => this.needs(k as BuyKind) > 0)
      .map(([k]) => `${CATALOG[k as BuyKind].label} x${this.needs(k as BuyKind)}`)
  }

  private stageReady() {
    return this.missing().length === 0
  }

  private completeStage(g: Game, platform: THREE.Object3D) {
    const s = this.stages[this.stage]
    this.sat.parts[this.stage].visible = true
    if (this.stage === 0) this.sat.ghost.visible = false
    g.reward(10, `Etapa "${s.name}" completada`, 'correct', { at: at(platform, 2.8) })
    this.stage++
    this.delivered = {}
    const next = this.stages[this.stage]
    g.toast(next ? `Siguiente etapa: ${next.name}` : '¡Satélite listo! Entrégalo al cliente 🚀', 'info', true)
  }

  private ship(g: Game, platform: THREE.Object3D) {
    this.shipped = true
    if (!g.isLate) {
      g.reward(20, 'Proyecto entregado a tiempo', 'correct', { at: at(platform, 3) })
      g.earn(PAYMENT, at(platform, 3))
    } else {
      g.toast('Entregado con retraso: el cliente paga menos', 'warn', true)
      g.earn(LATE_PAYMENT, at(platform, 3))
    }
  }

  upgrades(): Upgrade[] {
    return [{ id: 'drone', label: '🚁 Dron de carga', desc: 'Compra y trae solo los materiales que falten a la plataforma', cost: DRONE_COST, owned: !!this.drone, category: 'fabrica' }]
  }

  buy(id: string, g: Game) {
    if (id !== 'drone' || this.drone || !g.spend(DRONE_COST)) return
    this.drone = makeDrone()
    this.drone.position.set(0, 3, 2)
    g.scene.add(this.drone)
    g.toast('🚁 Dron activado: traerá materiales a la plataforma (pagas cada pieza)', 'good', true)
    g.sfx('done')
  }

  hint(g: Game): Hint | null {
    if (this.shipped) return null
    const s = this.stages[this.stage]
    if (!s) return { target: this.platform, text: '¡Satélite terminado! Presiona E en la plataforma para entregarlo 🚀' }
    if (g.held) {
      if (this.needs(g.held.kind as BuyKind) > 0) return { target: this.platform, text: `Lleva ${g.held.label} a la plataforma y presiona E` }
      return { target: this.trash, text: `${g.held.label} no sirve en la etapa ${s.name}: déjala en una mesa o deséchala` }
    }
    if (s.where === 'terminal') return { target: this.terminal, text: 'Etapa Software: ve a la terminal 💻 y mantén E para programar' }
    const missing = (Object.keys(s.needs) as BuyKind[]).find((k) => this.needs(k) > 0)
    if (missing) return { target: this.shelves[missing]!, text: `Etapa ${s.name}: compra ${CATALOG[missing].label} en su estantería (faltan ${this.needs(missing)})` }
    return { target: this.platform, text: `Mantén E en la plataforma para "${s.work}"` }
  }

  private updateDrone(dt: number, g: Game) {
    const drone = this.drone
    if (!drone) return
    drone.rotation.y += dt * 3
    if (!this.droneJob) {
      this.droneWait -= dt
      const s = this.stages[this.stage]
      const kind = s && !this.shipped ? (Object.keys(s.needs) as BuyKind[]).find((k) => this.needs(k) > 0) : undefined
      if (kind && this.droneWait <= 0) this.droneJob = { kind, phase: 'shelf', cargo: null }
    }
    const job = this.droneJob
    const goal = job ? (job.phase === 'shelf' ? this.shelves[job.kind]!.position : this.platform.position) : new THREE.Vector3(0, 0, 2)
    const target = new THREE.Vector3(goal.x, 3, goal.z + (job?.phase === 'shelf' ? 0.8 : 0))
    const to = target.clone().sub(drone.position)
    const dist = to.length()
    drone.position.addScaledVector(to.normalize(), Math.min(dist, dt * 5))
    drone.position.y = 3 + Math.sin(g.elapsed * 4) * 0.1
    if (!job || dist > 0.2) return
    if (job.phase === 'shelf') {
      if (!g.spend(g.materialCost(CATALOG[job.kind].cost), drone.position.clone())) {
        this.droneJob = null
        this.droneWait = 4
        return
      }
      g.stats.materials++
      job.cargo = makeItemMesh(job.kind)
      job.cargo.name = 'cargo'
      job.cargo.position.set(0, -0.6, 0)
      drone.add(job.cargo)
      job.phase = 'platform'
    } else {
      if (job.cargo) drone.remove(job.cargo)
      if (this.needs(job.kind) > 0) {
        this.delivered[job.kind] = (this.delivered[job.kind] ?? 0) + 1
        g.float('🚁 ✓', '#16a34a', at(this.platform, 2.4))
        if (this.stageReady()) g.toast(`Materiales listos: mantén E para "${this.stages[this.stage].work}"`, 'info')
      }
      this.droneJob = null
      this.droneWait = 0.5
    }
  }

  update(dt: number, g: Game) {
    if (g.isHost) this.updateDrone(dt, g)
    else if (this.drone) this.drone.rotation.y += dt * 3
    const s = this.stages[this.stage]
    this.tag.set(
      this.shipped ? '🚀 ¡Lanzamiento!' : s ? `Etapa ${this.stage + 1}/5: ${s.name}` : '✅ Listo para entregar',
    )
    this.sat.ghost.rotation.y += dt * 0.6
    this.sat.beacon.emissiveIntensity = 0.4 + Math.abs(Math.sin(g.elapsed * 5))
    this.screen.emissiveIntensity = s?.where === 'terminal' ? 0.6 + Math.abs(Math.sin(g.elapsed * 6)) : 0.5
    if (this.shipped) {
      this.satellite.position.y += dt * (1 + this.satellite.position.y * 2)
      this.satellite.rotation.y += dt * 2
    }
  }

  onEnd(g: Game) {
    if (this.shipped) timeBonus(g, 3, 30)
  }

  isComplete() {
    return this.shipped
  }

  objectives(): Objective[] {
    const list: Objective[] = this.stages.map((s, i) => ({
      text: i === this.stage && Object.keys(s.needs).length ? `${s.name} — falta: ${this.missing().join(', ') || 'ensamblar'}` : s.name,
      done: i < this.stage,
    }))
    list.push({ text: 'Entregar al cliente', done: this.shipped })
    return list
  }

  metrics(g: Game): Metric[] {
    const left = (this.deadline ?? 0) - g.elapsed
    return [
      { label: 'Etapa', value: `${Math.min(this.stage + 1, 5)} / 5` },
      { label: 'Avance', value: `${Math.round((this.stage / this.stages.length) * 100)}%`, tone: this.stage === 5 ? 'good' : undefined },
      { label: 'Tiempo restante', value: left > 0 ? fmtTime(left) : 'Atrasado', tone: left < 30 ? 'bad' : undefined },
      { label: 'Materiales usados', value: String(g.stats.materials) },
      { label: 'Desperdicios', value: String(g.stats.waste), tone: g.stats.waste ? 'bad' : undefined },
    ]
  }

  resources(g: Game): Resources {
    return { personal: 1, maquinas: 2, materia: `${g.stats.materials} usadas` }
  }
}
