import * as THREE from 'three'
import type { Game } from '../Game'
import { ball, box, C, makeConveyor, makeHopper, makeMachine, makeRobotArm, makeWorker, mat, type HopperRig, type MachineRig, type WorkerRig } from '../models'
import type { TextSprite } from '../sprites'
import type { Hint, Metric, Objective, RepairTarget, Resources, Upgrade } from '../types'
import { addShelf, addTable, addTrash, at, BaseLevel, label, place } from './common'

const LINE_Z = -2.6
const CYCLE = 1.2
const USE_PER_CHIP = 2.5
const REFILL = 35
const LOW = 25
const GOAL = 60
const TECH_COST = 150
const ROBOT_COST = 200
const TURBO_COST = 250

interface LineMachine {
  name: string
  rig: MachineRig
  broken: boolean
  x: number
}

/**
 * Producción continua: una línea que nunca debería detenerse.
 * Un sensor avisa cuando falta materia prima y las máquinas pueden sobrecalentarse.
 */
export class ContinuousLevel extends BaseLevel {
  id = 3 as const
  deadline = null
  duration = 120
  maxTime = 125
  minScore = 70
  refScore = 170

  private hopper = 60
  private hopperRig!: HopperRig
  private hopperTag!: TextSprite
  private machines: LineMachine[] = []
  private chips = 0
  private chipMeshes: THREE.Mesh[] = []
  private chipGeo = new THREE.BoxGeometry(0.28, 0.06, 0.28)
  private outTag!: TextSprite
  private stopped = false
  private stopTime = 0
  private prodTimer = 0
  private nextBreak = 15
  private lowAlerted = false
  private smoke: { mesh: THREE.Mesh; life: number }[] = []
  private smokeTimer = 0
  private hasTech = false
  private tech: WorkerRig | null = null
  private techHome = new THREE.Vector3(-1, 0, 3.6)
  private techWork = 0
  private hasRobot = false
  private robot: ReturnType<typeof makeRobotArm> | null = null
  private robotTimer = -1
  private turbo = false
  private cycle = CYCLE
  private shelf!: THREE.Object3D

  build(g: Game) {
    this.shelf = addShelf(g, 'obleas', -9.5, 3.2, 0x818cf8).object
    addTable(g, -6.2, 3.2)
    addTrash(g, -11.2, 6.5)

    const belt = place(makeConveyor(16.6), 0.4, LINE_Z)
    g.addStation({ name: 'Banda transportadora', object: belt, size: [16.6, 0.9], info: () => 'Transporta los chips entre máquinas' })

    // Tolva con sensor de nivel
    this.hopperRig = makeHopper()
    place(this.hopperRig.group, -9.6, LINE_Z)
    this.hopperTag = label(this.hopperRig.group, '', 3.0, { lineHeight: 0.34 })
    g.addStation({
      name: 'Tolva de materia prima',
      object: this.hopperRig.group,
      size: [1.4, 1.4],
      prompt: (g) => (g.held?.kind === 'obleas' ? `Abastecer tolva (+${REFILL}%)` : null),
      info: () => `Nivel: ${Math.round(this.hopper)}% — trae obleas de silicio`,
      interact: (g) => {
        g.consumeHeld()
        this.refill(g, this.hopperRig.group)
      },
    })

    const defs: [string, number, number][] = [
      ['Fotolitografía', C.purple, -5],
      ['Grabado', C.teal, 0],
      ['Empaquetado', 0xfdba74, 5],
    ]
    for (const [name, color, x] of defs) {
      const rig = makeMachine(color, 2.4, 1.6, 1.4)
      place(rig.group, x, LINE_Z)
      label(rig.group, name, 2.75, { lineHeight: 0.3 })
      const m: LineMachine = { name, rig, broken: false, x }
      this.machines.push(m)
      g.addStation({
        name,
        object: rig.group,
        size: [2.4, 1.6],
        hold: (g) => (m.broken && !g.held ? { key: 'repair', label: `Reparar ${name}`, duration: 2.5, onDone: () => this.repair(g, m) } : null),
        info: () => (m.broken ? 'Suelta lo que llevas para reparar' : 'Funcionando correctamente ✓'),
        onDamage: () => {
          m.broken = true
        },
      })
    }

    // Salida de producto terminado
    const out = place(new THREE.Group(), 9.9, LINE_Z)
    out.add(box(1.2, 0.7, 1.2, C.cardboard, [0, 0.35, 0]), box(1.24, 0.1, 1.24, C.woodDark, [0, 0.7, 0]))
    this.outTag = label(out, '', 1.7, { lineHeight: 0.34 })
    g.addStation({ name: 'Producto terminado', object: out, size: [1.2, 1.2], info: () => `${this.chips} chips producidos` })
  }

  private refill(g: Game, obj: THREE.Object3D) {
    this.hopper += REFILL
    g.float(`+${REFILL}%`, '#2563eb', at(obj, 3.3))
    if (this.hopper > 100) {
      this.hopper = 100
      g.reward(-10, 'Derrame: la tolva ya estaba llena (desperdicio)', 'waste', { at: at(obj, 3.3) })
    }
  }

  private repair(g: Game, m: LineMachine) {
    if (!m.broken) return
    m.broken = false
    g.toast(`🔧 ${m.name} reparada`, 'good')
  }

  upgrades(): Upgrade[] {
    return [
      { id: 'robot', label: '🤖 Robot abastecedor', desc: 'Llena la tolva solo cuando el sensor avisa (paga cada recarga)', cost: ROBOT_COST, owned: this.hasRobot, category: 'fabrica' },
      { id: 'tech', label: '👷 Contratar técnico', desc: 'Personal extra que repara las máquinas', cost: TECH_COST, owned: this.hasTech, category: 'fabrica' },
      { id: 'turbo', label: '⚡ Máquinas de alta velocidad', desc: 'Producen 30% más rápido (gastan más materia prima)', cost: TURBO_COST, owned: this.turbo, category: 'fabrica' },
    ]
  }

  repairTargets(g: Game): RepairTarget[] {
    return this.machines.filter((m) => m.broken).map((m) => ({ pos: new THREE.Vector3(m.x - 0.6, 0, LINE_Z + 1.35), repair: () => this.repair(g, m) }))
  }

  hint(g: Game): Hint | null {
    const broken = this.machines.find((m) => m.broken)
    if (broken) return { target: broken.rig.group, text: `${broken.name} está averiada 🔥: acércate y mantén E para repararla` }
    if (g.held?.kind === 'obleas') return { target: this.hopperRig.group, text: 'Lleva las obleas a la tolva (izquierda) y presiona E' }
    if (this.hopper < 50 && !this.hasRobot) return { target: this.shelf, text: `La tolva está en ${Math.round(this.hopper)}%: compra obleas de silicio en la estantería` }
    return null
  }

  buy(id: string, g: Game) {
    if (id === 'tech' && !this.hasTech && g.spend(TECH_COST)) {
      this.hasTech = true
      this.tech = makeWorker(0xf97316, C.white, 0x7c2d12)
      this.tech.root.position.copy(this.techHome)
      g.scene.add(this.tech.root)
      g.toast('👷 Técnico contratado: reparará las máquinas por ti', 'good')
      g.sfx('done')
    }
    if (id === 'turbo' && !this.turbo && g.spend(TURBO_COST)) {
      this.turbo = true
      this.cycle = CYCLE * 0.7
      g.toast('⚡ Línea acelerada: más chips por minuto, pero la tolva se vacía más rápido', 'good')
      g.sfx('done')
    }
    if (id === 'robot' && !this.hasRobot && g.spend(ROBOT_COST)) {
      this.hasRobot = true
      this.robot = makeRobotArm()
      place(this.robot.group, -11.3, LINE_Z + 1.2)
      g.scene.add(this.robot.group)
      g.toast('🤖 Robot instalado: abastecerá la tolva automáticamente (paga cada recarga)', 'good')
      g.sfx('done')
    }
  }

  update(dt: number, g: Game) {
    const ending = g.elapsed >= this.duration

    // Averías aleatorias
    if (!ending && g.elapsed >= this.nextBreak) {
      const working = this.machines.filter((m) => !m.broken)
      if (working.length) {
        const m = working[Math.floor(Math.random() * working.length)]
        m.broken = true
        g.toast(`🔥 ${m.name} se sobrecalentó — ¡repárala!`, 'bad')
        g.sfx('alarm')
      }
      this.nextBreak = g.elapsed + 15 + Math.random() * 8
    }

    // Estado de la línea
    const broken = this.machines.some((m) => m.broken)
    const empty = this.hopper <= 0
    const blocked = broken || empty
    if (blocked && !this.stopped && !ending) {
      this.stopped = true
      g.reward(-10, empty ? 'Línea detenida: sin materia prima' : 'Línea detenida: máquina averiada', 'stops')
    } else if (!blocked && this.stopped) {
      this.stopped = false
      g.toast('✅ Línea en marcha de nuevo', 'good')
    }

    if (this.stopped) {
      this.stopTime += dt
    } else if (!ending) {
      this.prodTimer += dt
      if (this.prodTimer >= this.cycle) {
        this.prodTimer -= this.cycle
        this.hopper = Math.max(0, this.hopper - USE_PER_CHIP)
        this.spawnChip(g)
      }
    }

    // Sensor de nivel: alerta automática
    if (this.hopper < LOW && !this.lowAlerted) {
      this.lowAlerted = true
      g.toast('📡 Sensor: materia prima baja — abastece la tolva', 'warn')
      g.sfx('alarm')
    } else if (this.hopper >= LOW + 10) {
      this.lowAlerted = false
    }

    this.updateRobot(dt, g)
    this.updateTech(dt, g)
    this.updateVisuals(ending ? 0 : dt, g)
  }

  private spawnChip(g: Game) {
    const mesh = new THREE.Mesh(this.chipGeo, mat(0x1f2937, 0x0f172a, 0.4, 0.5))
    mesh.position.set(-8, 0.57, LINE_Z)
    mesh.castShadow = true
    g.scene.add(mesh)
    this.chipMeshes.push(mesh)
  }

  private updateRobot(dt: number, g: Game) {
    if (!this.robot) return
    if (this.robotTimer < 0 && this.hopper < LOW) this.robotTimer = 2
    if (this.robotTimer >= 0) {
      this.robotTimer -= dt
      this.robot.joint.rotation.y = Math.sin(g.elapsed * 6) * 0.9
      if (this.robotTimer < 0) {
        if (g.spend(25, at(this.hopperRig.group, 3))) {
          g.stats.materials++
          this.refill(g, this.hopperRig.group)
          g.toast('🤖 Robot abasteció la tolva', 'info')
        }
      }
    } else {
      this.robot.joint.rotation.y *= 0.9
    }
  }

  private updateTech(dt: number, g: Game) {
    const tech = this.tech
    if (!tech) return
    const job = this.machines.find((m) => m.broken)
    const goal = job ? new THREE.Vector3(job.x + 0.6, 0, LINE_Z + 1.35) : this.techHome
    const pos = tech.root.position
    const to = goal.clone().sub(pos)
    const dist = to.length()
    if (dist > 0.1) {
      to.normalize()
      pos.addScaledVector(to, Math.min(dist, dt * 3.5))
      tech.root.rotation.y = Math.atan2(to.x, to.z)
      const s = Math.sin(g.elapsed * 10) * 0.6
      tech.legL.rotation.x = s
      tech.legR.rotation.x = -s
      this.techWork = 0
    } else if (job) {
      tech.root.rotation.y = Math.PI
      const w = Math.sin(g.elapsed * 20) * 0.5
      tech.armL.rotation.x = -1 + w
      tech.armR.rotation.x = -1 - w
      this.techWork += dt
      if (this.techWork >= 3) {
        this.techWork = 0
        job.broken = false
        g.toast(`👷 El técnico reparó ${job.name}`, 'good')
      }
    } else {
      tech.legL.rotation.x = tech.legR.rotation.x = 0
      tech.armL.rotation.x = tech.armR.rotation.x = 0
    }
  }

  private updateVisuals(dt: number, g: Game) {
    // Chips sobre la banda
    for (let i = this.chipMeshes.length - 1; i >= 0; i--) {
      const c = this.chipMeshes[i]
      if (!this.stopped) c.position.x += dt * 2.4
      if (c.position.x > 8.6) {
        g.scene.remove(c)
        this.chipMeshes.splice(i, 1)
        this.chips++
        g.reward(2, 'Chip producido', 'correct', { at: new THREE.Vector3(9.9, 1.8, LINE_Z), silent: true })
        g.earn(15, new THREE.Vector3(9.9, 1.8, LINE_Z), true)
      }
    }

    // Máquinas
    for (const m of this.machines) {
      const running = !this.stopped
      m.rig.piston.position.y = 1.75 - (running ? Math.abs(Math.sin(g.elapsed * 8 + m.x)) * 0.25 : 0)
      const color = m.broken ? (Math.sin(g.elapsed * 12) > 0 ? C.red : 0x7f1d1d) : running ? C.green : C.yellow
      m.rig.light.color.setHex(color)
      m.rig.light.emissive.setHex(color)
    }

    // Humo de máquinas averiadas
    this.smokeTimer -= dt
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.18
      for (const m of this.machines) {
        if (!m.broken) continue
        const puff = ball(0.18 + Math.random() * 0.1, 0x6b7280, [m.x - 0.75, 2.1, LINE_Z - 0.3], 6)
        puff.castShadow = false
        g.scene.add(puff)
        this.smoke.push({ mesh: puff, life: 1.2 })
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i]
      s.life -= dt
      s.mesh.position.y += dt * 1.2
      s.mesh.scale.setScalar(1 + (1.2 - s.life))
      if (s.life <= 0) {
        g.scene.remove(s.mesh)
        s.mesh.geometry.dispose()
        this.smoke.splice(i, 1)
      }
    }

    // Tolva y sensor
    const level = this.hopper / 100
    this.hopperRig.fill.scale.y = Math.max(0.01, level)
    const hc = this.hopper < LOW ? (Math.sin(g.elapsed * 10) > 0 ? C.red : 0x7f1d1d) : this.hopper < 50 ? C.yellow : C.green
    this.hopperRig.fillMat.color.setHex(hc)
    this.hopperRig.fillMat.emissive.setHex(hc)
    this.hopperTag.set(`📡 Tolva ${Math.round(this.hopper)}%`, this.hopper < LOW ? '#dc2626' : undefined)
    this.outTag.set(`💾 ${this.chips} chips`)
  }

  onEnd(g: Game) {
    if (this.chips >= GOAL) g.reward(20, `Meta de ${GOAL} chips alcanzada`, 'correct')
    if (this.availability(g) >= 85) g.reward(10, 'Alta disponibilidad de la línea (≥85%)', 'correct')
  }

  isComplete() {
    return false
  }

  private availability(g: Game) {
    return g.elapsed > 0 ? Math.round((1 - this.stopTime / g.elapsed) * 100) : 100
  }

  alerts(): string[] {
    const list: string[] = []
    if (this.hopper <= 0) list.push('⛔ Sin materia prima: la línea está detenida')
    else if (this.hopper < LOW) list.push(`📡 SENSOR: materia prima baja (${Math.round(this.hopper)}%)`)
    for (const m of this.machines) if (m.broken) list.push(`🔥 ${m.name} averiada — mantén E para reparar`)
    return list
  }

  objectives(g: Game): Objective[] {
    return [
      { text: `Producir ${GOAL} chips (${this.chips}/${GOAL})`, done: this.chips >= GOAL },
      { text: 'Mantener la tolva con materia prima', done: this.hopper > 0 },
      { text: 'Disponibilidad ≥ 85%', done: this.availability(g) >= 85 },
      { text: 'Aguantar 2:00 de producción', done: g.elapsed >= this.duration },
    ]
  }

  metrics(g: Game): Metric[] {
    const rate = g.elapsed > 5 ? Math.round((this.chips / g.elapsed) * 60) : 0
    const av = this.availability(g)
    return [
      { label: 'Chips producidos', value: String(this.chips), tone: this.chips >= GOAL ? 'good' : undefined },
      { label: 'Ritmo', value: `${rate} chips/min` },
      { label: 'Disponibilidad', value: `${av}%`, tone: av >= 85 ? 'good' : av < 70 ? 'bad' : 'warn' },
      { label: 'Paradas de línea', value: String(g.stats.stops), tone: g.stats.stops ? 'bad' : undefined },
      { label: 'Tolva (sensor)', value: `${Math.round(this.hopper)}%`, tone: this.hopper < LOW ? 'bad' : undefined },
    ]
  }

  resources(): Resources {
    return { personal: 1 + (this.hasTech ? 1 : 0), maquinas: 3 + (this.hasRobot ? 1 : 0), materia: `${Math.round(this.hopper)}%` }
  }
}
