import * as THREE from 'three'
import type { Game } from '../Game'
import { makeItem, PRODUCT_LABEL, PRODUCT_PLURAL } from '../items'
import { box, C, makeConveyor, makeDock, makeMachine, makeTable, makeTruck, PRODUCT_COLOR, type MachineRig } from '../models'
import type { TextSprite } from '../sprites'
import type { Hint, Metric, Objective, Product, Resources, Station, Upgrade } from '../types'
import { addShelf, addTable, addTrash, at, BaseLevel, fmtTime, label, place, timeBonus } from './common'

const LOTS: { product: Product; qty: number }[] = [
  { product: 'celular', qty: 10 },
  { product: 'tablet', qty: 20 },
  { product: 'laptop', qty: 30 },
]
const ORDER: Product[] = ['celular', 'tablet', 'laptop']
const PRICE: Record<Product, number> = { celular: 14, tablet: 18, laptop: 26 }
const UNITS_PER_KIT = 10
const UNIT_TIME = 0.35
const CHANGEOVER = 3
const TURBO_COST = 150
const SMED_COST = 120

/**
 * Producción por lotes: se fabrica una cantidad fija de un producto y,
 * antes de pasar al siguiente, hay que cambiar el formato de la máquina.
 */
export class BatchLevel extends BaseLevel {
  id = 2 as const
  deadline = 170
  duration = null
  maxTime = 360
  minScore = Math.round(50 * this.f)
  refScore = Math.round(100 * this.f)
  /** Con más jugadores los lotes son más grandes (múltiplos de 10). */
  private lots = LOTS.map((l) => ({ ...l, qty: Math.ceil((l.qty * this.f) / 10) * 10 }))

  private config: Product = 'celular'
  private changeover = 0
  private changeovers = 0
  private queue = 0
  private prodTimer = 0
  private output: { product: Product; count: number } = { product: 'celular', count: 0 }
  private produced = 0
  private overproduced = 0
  private lot = 0
  private shipped = 0
  private machine!: MachineRig
  private machineTag!: TextSprite
  private dockTag!: TextSprite
  private trayUnits = new THREE.Group()
  private truck = makeTruck(C.green)
  private truckT = 0
  private unitTime = UNIT_TIME
  private changeTime = CHANGEOVER
  private shelves: Partial<Record<Product, THREE.Object3D>> = {}
  private machineSt!: Station
  private panel!: THREE.Object3D
  private tray!: THREE.Object3D
  private dock!: THREE.Object3D

  build(g: Game) {
    g.sync(
      'lotes',
      () => ({
        config: this.config,
        changeover: this.changeover,
        changeovers: this.changeovers,
        queue: this.queue,
        output: this.output,
        produced: this.produced,
        overproduced: this.overproduced,
        lot: this.lot,
        shipped: this.shipped,
        unitTime: this.unitTime,
        changeTime: this.changeTime,
      }),
      (v) => {
        const outputChanged = v.output.count !== this.output.count || v.output.product !== this.output.product
        if (v.lot > this.lot) this.truckT = 2.5
        Object.assign(this, v)
        this.output = { ...v.output }
        if (outputChanged) this.renderTray()
      },
    )
    this.shelves.celular = addShelf(g, 'kit_celular', -9, -6.4).object
    this.shelves.tablet = addShelf(g, 'kit_tablet', -6.4, -6.4).object
    this.shelves.laptop = addShelf(g, 'kit_laptop', -3.8, -6.4).object
    addTable(g, -6.5, 3)
    addTable(g, 1, 4)
    addTrash(g, -11.2, 6.5)

    // Panel de control (cambio de formato)
    const panel = place(new THREE.Group(), -3.4, -1.4)
    this.panel = panel
    panel.add(box(0.5, 1.0, 0.5, C.dark, [0, 0.5, 0]), box(0.8, 0.5, 0.12, 0x0ea5e9, [0, 1.2, 0.1]))
    label(panel, '🎛 Panel', 1.9, { lineHeight: 0.3 })
    g.addStation({
      name: 'Panel de control',
      object: panel,
      size: [0.7, 0.7],
      machine: true,
      prompt: (g) => {
        if (g.held || this.changeover > 0 || this.queue > 0 || this.output.count > 0) return null
        return `Cambiar producto a ${PRODUCT_LABEL[this.next()]}`
      },
      info: (g) => {
        if (g.held) return 'Suelta lo que llevas para usar el panel'
        if (this.changeover > 0) return 'Cambiando formato…'
        return 'Termina y retira el lote antes de cambiar de producto'
      },
      interact: (g) => {
        this.config = this.next()
        this.changeover = this.changeTime
        this.changeovers++
        g.toast(`🔧 Cambio de formato a ${PRODUCT_LABEL[this.config]} (la máquina se detiene ${this.changeTime}s)`, 'info', true)
      },
    })

    // Ensambladora
    this.machine = makeMachine(0x93c5fd, 2.6, 1.6, 1.5)
    place(this.machine.group, -0.6, -1.4)
    this.machineTag = label(this.machine.group, '', 2.9, { lineHeight: 0.34 })
    this.machineSt = g.addStation({
      name: 'Ensambladora',
      object: this.machine.group,
      size: [2.6, 1.6],
      machine: true,
      prompt: (g) => (g.held?.kind.startsWith('kit_') ? `Cargar ${g.held.label}` : null),
      info: () => `Configurada para ${PRODUCT_LABEL[this.config]} · En cola: ${this.queue}`,
      interact: (g) => {
        const product = g.held!.kind.slice(4) as Product
        if (this.changeover > 0) {
          g.toast('Espera: la máquina está cambiando de formato', 'warn')
          return
        }
        if (product !== this.config) {
          g.toast(`La máquina está configurada para ${PRODUCT_LABEL[this.config]}. Cambia el producto en el panel 🎛`, 'warn')
          g.sfx('error')
          return
        }
        g.consumeHeld()
        this.queue += UNITS_PER_KIT
        g.float(`+${UNITS_PER_KIT} en cola`, '#2563eb', at(this.machine.group, 2.6))
      },
    })

    // Banda y bandeja de salida
    const belt = place(makeConveyor(1.6), 1.6, -1.4)
    g.scene.add(belt)
    const tray = place(makeTable(0x94a3b8), 3.3, -1.4)
    this.tray = tray
    this.trayUnits.position.y = 0.92
    tray.add(this.trayUnits)
    label(tray, '📥 Salida', 2.6, { lineHeight: 0.3 })
    g.addStation({
      name: 'Bandeja de salida',
      object: tray,
      size: [1.4, 1.0],
      prompt: (g) => {
        if (g.held || this.output.count === 0 || this.queue > 0) return null
        return `Empacar lote (${this.output.count} ${PRODUCT_PLURAL[this.output.product]})`
      },
      info: (g) => {
        if (this.queue > 0) return `Produciendo… (${this.output.count} listos, ${this.queue} en cola)`
        if (g.held) return 'Tienes las manos ocupadas'
        return 'Carga un kit en la ensambladora para producir'
      },
      interact: (g) => {
        g.take(makeItem('lote', { product: this.output.product, count: this.output.count }))
        this.output.count = 0
        this.renderTray()
      },
    })

    // Muelle de despacho
    const dock = place(makeDock(), 9.8, 1.5)
    this.dock = dock
    this.dockTag = label(dock, '', 2.4, { lineHeight: 0.34 })
    place(this.truck, 14.6, 1.5)
    g.scene.add(this.truck)
    g.addStation({
      name: 'Despacho',
      object: dock,
      size: [1.5, 1.2],
      prompt: (g) => (g.held?.kind === 'lote' && this.lot < this.lots.length ? 'Despachar lote' : null),
      info: () => (this.lot < this.lots.length ? 'Trae aquí las cajas de lote' : 'Todos los lotes despachados'),
      interact: (g) => this.ship(g, dock),
    })
  }

  upgrades(): Upgrade[] {
    return [
      { id: 'turbo', label: '⚡ Ensambladora turbo', desc: 'Produce el doble de rápido', cost: TURBO_COST, owned: this.unitTime < UNIT_TIME, category: 'fabrica' },
      { id: 'smed', label: '🔧 Cambio rápido (SMED)', desc: 'El cambio de producto tarda 1 s en vez de 3 s', cost: SMED_COST, owned: this.changeTime < CHANGEOVER, category: 'fabrica' },
    ]
  }

  buy(id: string, g: Game) {
    if (id === 'turbo' && this.unitTime === UNIT_TIME && g.spend(TURBO_COST)) {
      this.unitTime = UNIT_TIME / 2
      g.toast('⚡ Ensambladora turbo instalada', 'good', true)
      g.sfx('done')
    }
    if (id === 'smed' && this.changeTime === CHANGEOVER && g.spend(SMED_COST)) {
      this.changeTime = 1
      g.toast('🔧 Cambio rápido instalado: cambiar de producto ahora tarda 1 s', 'good', true)
      g.sfx('done')
    }
  }

  hint(g: Game): Hint | null {
    const target = this.lots[this.lot]
    if (!target) return null
    const need = PRODUCT_PLURAL[target.product]
    if (g.held?.kind === 'lote') return { target: this.dock, text: 'Lleva la caja del lote al despacho (derecha) y presiona E' }
    if (g.held?.kind.startsWith('kit_')) {
      if (g.held.kind.slice(4) !== this.config) return { target: this.panel, text: `La máquina no está configurada para este kit: déjalo en una mesa y cambia el producto en el panel 🎛` }
      return { target: this.machine.group, text: 'Carga el kit en la ensambladora (E)' }
    }
    if (g.held) return { target: this.dock, text: 'Suelta lo que llevas en una mesa' }
    if (this.output.count > 0 && this.queue === 0) return { target: this.tray, text: `Empaca los ${this.output.count} ${PRODUCT_PLURAL[this.output.product]} de la bandeja de salida (E)` }
    if (this.queue > 0) return null
    if (this.config !== target.product) return { target: this.panel, text: `Lote ${this.lot + 1}: cambia la máquina a ${PRODUCT_LABEL[target.product]} en el panel 🎛` }
    const pending = target.qty - this.shipped - this.queue - this.output.count
    if (pending > 0) return { target: this.shelves[target.product]!, text: `Lote ${this.lot + 1}: faltan ${pending} ${need}. Compra un kit (trae 10 unidades)` }
    return null
  }

  private next(): Product {
    return ORDER[(ORDER.indexOf(this.config) + 1) % ORDER.length]
  }

  private ship(g: Game, dock: THREE.Object3D) {
    const item = g.consumeHeld()
    const target = this.lots[this.lot]
    const { product = 'celular', count = 0 } = item.data
    if (product !== target.product) {
      g.reward(-20, `Producto equivocado: este lote es de ${PRODUCT_PLURAL[target.product]}`, 'wrong', { at: at(dock) })
      return
    }
    this.shipped += count
    if (this.shipped < target.qty) {
      g.toast(`Lote parcial: ${this.shipped}/${target.qty} ${PRODUCT_PLURAL[product]}`, 'info')
      g.sfx('drop')
      return
    }
    const extra = this.shipped - target.qty
    if (extra > 0) {
      this.overproduced += extra
      g.reward(-10 * Math.ceil(extra / UNITS_PER_KIT), `Sobreproducción: ${extra} unidades de más`, 'waste', { at: at(dock, 3) })
    }
    g.reward(target.qty, `Lote de ${target.qty} ${PRODUCT_PLURAL[product]} completo`, 'correct', { at: at(dock) })
    g.earn(PRICE[product] * target.qty, at(dock))
    this.lot++
    this.shipped = 0
    this.truckT = 2.5
    const nextLot = this.lots[this.lot]
    if (nextLot) g.toast(`Siguiente: ${nextLot.qty} ${PRODUCT_PLURAL[nextLot.product]} — cambia el producto en el panel 🎛`, 'info', true)
  }

  private renderTray() {
    for (const c of this.trayUnits.children) (c as THREE.Mesh).geometry.dispose()
    this.trayUnits.clear()
    const color = PRODUCT_COLOR[this.output.product]
    const n = Math.min(this.output.count, 40)
    for (let i = 0; i < n; i++) {
      const layer = Math.floor(i / 20)
      const j = i % 20
      this.trayUnits.add(box(0.2, 0.12, 0.16, color, [-0.55 + (j % 5) * 0.27, 0.06 + layer * 0.14, -0.33 + Math.floor(j / 5) * 0.22]))
    }
  }

  update(dt: number, g: Game) {
    if (g.isHost) this.simulate(dt, g)
    const running = this.queue > 0 && this.changeover <= 0 && !g.isDamaged(this.machineSt)
    const m = this.machine
    m.piston.position.y = 1.85 + (running ? Math.abs(Math.sin(g.elapsed * 14)) * -0.25 : 0)
    m.light.color.setHex(this.changeover > 0 ? C.yellow : running ? C.green : 0x94a3b8)
    m.light.emissive.copy(m.light.color)
    this.machineTag.set(
      this.changeover > 0
        ? `🔧 Cambiando formato… ${Math.ceil(this.changeover)}s`
        : `⚙ ${PRODUCT_LABEL[this.config]} · cola: ${this.queue}`,
    )
    const target = this.lots[this.lot]
    this.dockTag.set(target ? `Lote ${this.lot + 1}: ${this.shipped}/${target.qty} ${PRODUCT_PLURAL[target.product]}` : '✅ Despachado')

    if (this.truckT > 0) {
      this.truckT -= dt
      this.truck.position.x = 14.6 + (2.5 - this.truckT) * 12
      if (this.truckT <= 0) this.truck.position.x = 14.6
    }
  }

  /** Lógica de la máquina (solo el anfitrión). */
  private simulate(dt: number, g: Game) {
    if (this.changeover > 0) {
      this.changeover -= dt
      if (this.changeover <= 0) {
        g.toast(`✅ Máquina lista para ${PRODUCT_PLURAL[this.config]}`, 'good', true)
        g.sfx('done')
      }
    }
    const running = this.queue > 0 && this.changeover <= 0 && !g.isDamaged(this.machineSt)
    if (!running) {
      this.prodTimer = 0
      return
    }
    this.prodTimer += dt
    while (this.prodTimer >= this.unitTime && this.queue > 0) {
      this.prodTimer -= this.unitTime
      this.queue--
      this.produced++
      if (this.output.count > 0 && this.output.product !== this.config) this.output.count = 0
      this.output.product = this.config
      this.output.count++
      this.renderTray()
    }
  }

  onEnd(g: Game) {
    if (this.lot < this.lots.length) return
    if (!g.isLate) g.reward(20, 'Todos los lotes entregados a tiempo', 'correct')
    timeBonus(g, 5, 20)
  }

  isComplete() {
    return this.lot >= this.lots.length
  }

  objectives(): Objective[] {
    return this.lots.map((l, i) => ({
      text: `Lote ${i + 1}: ${l.qty} ${PRODUCT_PLURAL[l.product]}${i === this.lot ? ` (${this.shipped}/${l.qty})` : ''}`,
      done: i < this.lot,
    }))
  }

  metrics(g: Game): Metric[] {
    const left = (this.deadline ?? 0) - g.elapsed
    return [
      { label: 'Máquina', value: this.changeover > 0 ? 'Cambio de formato' : PRODUCT_LABEL[this.config] },
      { label: 'Unidades producidas', value: String(this.produced) },
      { label: 'Cambios de formato', value: String(this.changeovers) },
      { label: 'Sobreproducción', value: `${this.overproduced} u.`, tone: this.overproduced ? 'bad' : undefined },
      { label: 'Tiempo restante', value: left > 0 ? fmtTime(left) : 'Atrasado', tone: left < 30 ? 'bad' : undefined },
    ]
  }

  resources(): Resources {
    return { personal: 1, maquinas: 1, materia: `${this.queue} u. en cola` }
  }
}
