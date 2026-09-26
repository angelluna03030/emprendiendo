import * as THREE from 'three'
import type { Game } from '../Game'
import { makeItem, specLabel } from '../items'
import { makeCounter, makeItemMesh, makeScanner, makeTable, makeWorker } from '../models'
import type { TextSprite } from '../sprites'
import type { BuyKind, Hint, Item, Metric, Objective, OrderCard, Resources, Upgrade } from '../types'
import { addShelf, addTable, addTrash, at, BaseLevel, label, place } from './common'

type Ram = 16 | 32
type Ssd = 512 | 1024

interface Line {
  ram: Ram
  ssd: Ssd
  need: number
  have: number
}

interface Order {
  id: number
  client: string
  arrive: number
  limit: number
  lines: Line[]
  state: 'waiting' | 'active' | 'late' | 'done'
  startedAt: number
}

interface Bench {
  chasis: boolean
  ram: Ram | null
  ssd: Ssd | null
  assembled: boolean
  parts: THREE.Group
  object: THREE.Object3D
}

const PART_COST = { chasis: 40, 16: 30, 32: 55, 512: 30, 1024: 50 }
const AUTO_COST = 150

function pcPrice(ram: Ram, ssd: Ssd) {
  return Math.round((PART_COST.chasis + PART_COST[ram] + PART_COST[ssd]) * 1.9)
}

/**
 * Producción bajo pedido: cada cliente pide configuraciones específicas.
 * Se fabrica exactamente lo pedido; lo demás es desperdicio o error.
 */
export class OrderLevel extends BaseLevel {
  id = 4 as const
  deadline = null
  duration = null
  maxTime = 600
  zombieScale = 3
  minScore = 60
  refScore = 120

  private list: Order[] = [
    { id: 1, client: 'Colegio San José', arrive: 0, limit: 110, state: 'waiting', startedAt: 0, lines: [{ ram: 16, ssd: 512, need: 2, have: 0 }, { ram: 32, ssd: 1024, need: 1, have: 0 }] },
    { id: 2, client: 'Estudio Gamer Pixel', arrive: 45, limit: 90, state: 'waiting', startedAt: 0, lines: [{ ram: 32, ssd: 1024, need: 1, have: 0 }, { ram: 16, ssd: 1024, need: 1, have: 0 }] },
    { id: 3, client: 'Oficina Contable', arrive: 95, limit: 70, state: 'waiting', startedAt: 0, lines: [{ ram: 32, ssd: 512, need: 1, have: 0 }] },
  ]
  private idleSince = 0
  private scans = 0
  private delivered = 0
  private onTime = 0
  private laser!: THREE.Mesh
  private scanFlash = 0
  private clientTag!: TextSprite
  private client = makeWorker(0xa855f7, null, 0x374151)
  private shelves: Partial<Record<BuyKind, THREE.Object3D>> = {}
  private benches: Bench[] = []
  private scanner!: THREE.Object3D
  private counter!: THREE.Object3D
  private assembleTime = 2
  private bossesSpawned = false

  build(g: Game) {
    const shelves: [BuyKind, number][] = [['chasis', -9], ['ram16', -6.4], ['ram32', -3.8], ['ssd512', 3.8], ['ssd1tb', 6.4]]
    for (const [kind, x] of shelves) this.shelves[kind] = addShelf(g, kind, x, -6.4).object
    addTable(g, -7, 3)
    addTable(g, -4.5, 3)
    addTrash(g, -11.2, 6.5)

    this.addBench(g, 'Banco de ensamble 1', -3, -1.8)
    this.addBench(g, 'Banco de ensamble 2', 1, -1.8)

    // Escáner QR de verificación
    const scanner = makeScanner()
    this.laser = scanner.laser
    place(scanner.group, 6.2, 0.6)
    this.scanner = scanner.group
    label(scanner.group, '📱 Verificación QR', 2.55, { lineHeight: 0.3 })
    g.addStation({
      name: 'Escáner QR',
      object: scanner.group,
      size: [1.9, 1.0],
      machine: true,
      prompt: (g) => (g.held?.kind === 'pc' && !g.held.data.verified ? 'Escanear código QR' : null),
      info: (g) => (g.held?.kind === 'pc' ? 'Este PC ya fue verificado ✓' : 'Trae un PC ensamblado para verificarlo'),
      interact: (g) => this.scan(g, scanner.group),
    })

    // Mostrador de entrega con cliente
    const counter = place(makeCounter(), 10, 3.4, -Math.PI / 2)
    this.counter = counter
    this.client.root.position.set(11.6, 0, 3.4)
    this.client.root.rotation.y = -Math.PI / 2
    g.scene.add(this.client.root)
    this.clientTag = label(counter, '', 3.0, { lineHeight: 0.32 })
    g.addStation({
      name: 'Mostrador de entrega',
      object: counter,
      size: [0.9, 2.4],
      prompt: (g) => (g.held?.kind === 'pc' ? 'Entregar PC al cliente' : null),
      info: () => 'Entrega aquí los PCs verificados',
      interact: (g) => this.deliver(g, counter),
    })
  }

  private addBench(g: Game, name: string, x: number, z: number) {
    const object = place(makeTable(0xcbd5e1), x, z)
    const b: Bench = { chasis: false, ram: null, ssd: null, assembled: false, parts: new THREE.Group(), object }
    this.benches.push(b)
    b.parts.position.y = 0.9
    object.add(b.parts)
    label(object, `🔧 ${name.slice(-1)}`, 1.9, { lineHeight: 0.3 })
    const missing = () => [!b.chasis && 'chasis', !b.ram && 'RAM', !b.ssd && 'SSD'].filter(Boolean).join(', ')
    const accepts = (it: Item): string | null => {
      if (b.assembled) return 'Retira el PC terminado primero'
      if (it.kind === 'chasis') return b.chasis ? 'Ya tiene chasis' : null
      if (it.kind === 'ram16' || it.kind === 'ram32' || it.kind === 'ssd512' || it.kind === 'ssd1tb') {
        if (!b.chasis) return 'Primero coloca un chasis'
        if (it.kind.startsWith('ram') && b.ram) return 'Ya tiene RAM instalada'
        if (it.kind.startsWith('ssd') && b.ssd) return 'Ya tiene SSD instalado'
        return null
      }
      return 'Esto no va en el banco de ensamble'
    }
    g.addStation({
      name,
      object,
      size: [1.4, 1.0],
      machine: true,
      hold: (g) => {
        if (g.held || b.assembled || !b.chasis || !b.ram || !b.ssd) return null
        return { key: 'assemble', label: 'Ensamblar PC', duration: this.assembleTime, onDone: () => this.assemble(g, b, object) }
      },
      prompt: (g) => {
        if (g.held) return accepts(g.held) ? null : `Instalar ${g.held.label}`
        if (b.assembled) return `Tomar PC ${specLabel(b.ram!, b.ssd!)}`
        return null
      },
      info: (g) => {
        if (g.held) return accepts(g.held)
        return b.chasis ? `Faltan: ${missing()}` : 'Coloca un chasis para empezar'
      },
      interact: (g) => {
        if (g.held) {
          const it = g.consumeHeld()
          if (it.kind === 'chasis') b.chasis = true
          else if (it.kind === 'ram16') b.ram = 16
          else if (it.kind === 'ram32') b.ram = 32
          else if (it.kind === 'ssd512') b.ssd = 512
          else if (it.kind === 'ssd1tb') b.ssd = 1024
          this.renderBench(b)
          if (b.chasis && b.ram && b.ssd) g.toast('Piezas listas: mantén E para ensamblar', 'info')
          return
        }
        g.take(makeItem('pc', { ram: b.ram!, ssd: b.ssd!, verified: false }))
        b.chasis = b.assembled = false
        b.ram = b.ssd = null
        this.renderBench(b)
      },
    })
  }

  upgrades(): Upgrade[] {
    return [{ id: 'auto', label: '🦾 Brazo de ensamble automático', desc: 'Ensamblar un PC tarda 0,5 s en vez de 2 s', cost: AUTO_COST, owned: this.assembleTime < 2, category: 'fabrica' }]
  }

  buy(id: string, g: Game) {
    if (id !== 'auto' || this.assembleTime < 2 || !g.spend(AUTO_COST)) return
    this.assembleTime = 0.5
    g.toast('🦾 Brazo de ensamble instalado', 'good')
    g.sfx('done')
  }

  hint(g: Game): Hint | null {
    const boss = g.combat.firstBoss()
    if (boss) return { target: boss, text: '👑 ¡Jefes finales! Apunta y mantén clic para disparar. Compra armas o torretas en la tienda (B)' }
    const held = g.held
    if (held?.kind === 'pc') {
      if (!held.data.verified) return { target: this.scanner, text: 'Lleva el PC al escáner QR 📱 y presiona E para verificarlo' }
      return { target: this.counter, text: 'Entrega el PC verificado en el mostrador del cliente (E)' }
    }
    const ready = this.benches.find((b) => b.assembled)
    if (ready && !held) return { target: ready.object, text: 'Toma el PC terminado del banco (E)' }
    const full = this.benches.find((b) => !b.assembled && b.chasis && b.ram && b.ssd)
    if (full && !held) return { target: full.object, text: 'Mantén E en el banco para ensamblar el PC' }

    // Primera configuración que aún falta en los pedidos activos
    const line = this.active().flatMap((o) => o.lines.map((l) => ({ o, l }))).find(({ l }) => l.have < l.need)
    if (!line) return null
    const { ram, ssd } = line.l
    const bench = this.benches.find((b) => b.chasis && !b.assembled) ?? this.benches[0]
    if (held) return { target: bench.object, text: `Coloca ${held.label} en un banco de ensamble (E)` }
    const spec = `Pedido #${line.o.id} necesita PC ${specLabel(ram, ssd)}`
    if (!bench.chasis) return { target: this.shelves.chasis!, text: `${spec}: primero compra un chasis` }
    if (!bench.ram) return { target: this.shelves[ram === 16 ? 'ram16' : 'ram32']!, text: `${spec}: compra RAM ${ram} GB` }
    if (!bench.ssd) return { target: this.shelves[ssd === 512 ? 'ssd512' : 'ssd1tb']!, text: `${spec}: compra SSD ${ssd === 1024 ? '1 TB' : '512 GB'}` }
    return null
  }

  private renderBench(b: Bench) {
    b.parts.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    b.parts.clear()
    if (b.assembled) {
      b.parts.add(makeItemMesh('pc', { ram: b.ram!, ssd: b.ssd! }))
      return
    }
    if (b.chasis) b.parts.add(makeItemMesh('chasis'))
    if (b.ram) {
      const r = makeItemMesh(b.ram === 16 ? 'ram16' : 'ram32')
      r.position.set(-0.45, 0, 0)
      b.parts.add(r)
    }
    if (b.ssd) {
      const s = makeItemMesh(b.ssd === 512 ? 'ssd512' : 'ssd1tb')
      s.position.set(0.45, 0, 0)
      b.parts.add(s)
    }
  }

  private assemble(g: Game, b: Bench, obj: THREE.Object3D) {
    b.assembled = true
    this.renderBench(b)
    g.float('🖥 PC listo', '#2563eb', at(obj, 2.2))
  }

  private active() {
    return this.list.filter((o) => o.state === 'active' || o.state === 'late')
  }

  private scan(g: Game, obj: THREE.Object3D) {
    const pc = g.held!
    pc.data.verified = true
    this.scans++
    this.scanFlash = 0.6
    g.consumeHeld()
    g.take(makeItem('pc', pc.data))
    const { ram = 16, ssd = 512 } = pc.data
    const match = this.active().find((o) => o.lines.some((l) => l.ram === ram && l.ssd === ssd && l.have < l.need))
    if (match) {
      g.toast(`📱 QR ✓ ${specLabel(ram, ssd)} — coincide con el pedido #${match.id}`, 'good')
      g.float('QR ✓', '#16a34a', at(obj, 2.6))
    } else {
      g.toast(`📱 QR: ${specLabel(ram, ssd)} — ⚠ ningún pedido activo necesita esto`, 'warn')
      g.float('QR ⚠', '#d97706', at(obj, 2.6))
    }
    g.sfx('click')
  }

  private deliver(g: Game, counter: THREE.Object3D) {
    const pc = g.held!
    if (!pc.data.verified) {
      g.toast('Primero verifica el PC con el escáner QR 📱', 'warn')
      g.sfx('error')
      return
    }
    g.consumeHeld()
    const { ram = 16, ssd = 512 } = pc.data
    const spot = at(counter, 2.6)
    for (const o of this.active()) {
      const line = o.lines.find((l) => l.ram === ram && l.ssd === ssd && l.have < l.need)
      if (!line) continue
      line.have++
      this.delivered++
      g.reward(10, `PC correcto para el pedido #${o.id}`, 'correct', { at: spot })
      g.earn(pcPrice(ram, ssd), spot)
      if (o.lines.every((l) => l.have >= l.need)) {
        if (o.state === 'active') {
          this.onTime++
          g.reward(20, `Pedido #${o.id} entregado a tiempo`, 'correct', { at: spot.clone().setY(3.2) })
        } else {
          g.toast(`Pedido #${o.id} completado (con retraso)`, 'warn')
        }
        o.state = 'done'
        this.idleSince = g.elapsed
      }
      return
    }
    const known = this.list.some((o) => o.state !== 'waiting' && o.lines.some((l) => l.ram === ram && l.ssd === ssd))
    if (known) g.reward(-10, 'Sobreproducción: nadie necesita otro PC así', 'waste', { at: spot })
    else g.reward(-20, 'Pedido incorrecto: configuración no solicitada', 'wrong', { at: spot })
  }

  update(dt: number, g: Game) {
    // Con los 3 pedidos entregados llegan los jefes finales
    if (this.ordersDone() && !this.bossesSpawned && g.combat.enabled) {
      this.bossesSpawned = true
      g.combat.spawnBosses(2)
    }
    for (const o of this.list) {
      if (o.state === 'waiting') {
        const early = this.active().length === 0 && g.elapsed - this.idleSince > 2
        if (g.elapsed >= o.arrive || early) {
          o.state = 'active'
          o.startedAt = g.elapsed
          g.toast(`🧑 Nuevo pedido #${o.id}: ${o.client}`, 'info')
          g.sfx('good')
        }
        break
      }
    }
    for (const o of this.list) {
      if (o.state === 'active' && g.elapsed - o.startedAt > o.limit) {
        o.state = 'late'
        g.reward(-30, `Retraso en el pedido #${o.id}`, 'late')
      }
    }

    const current = this.active()[0]
    this.clientTag.set(current ? `🧑 Pedido #${current.id}` : this.ordersDone() ? '😄 ¡Gracias!' : '⏳ Esperando cliente…')
    this.client.root.visible = !!current || this.ordersDone()
    this.client.body.position.y = Math.abs(Math.sin(g.elapsed * 3)) * 0.05

    this.scanFlash = Math.max(0, this.scanFlash - dt)
    this.laser.position.y = 1.0 + Math.sin(g.elapsed * 4) * 0.5
    ;(this.laser.material as THREE.MeshStandardMaterial).emissiveIntensity = this.scanFlash > 0 ? 3 : 0.8
    this.laser.scale.y = this.scanFlash > 0 ? 4 : 1
  }

  private ordersDone() {
    return this.list.every((o) => o.state === 'done')
  }

  isComplete(g: Game) {
    if (!this.ordersDone()) return false
    return !g.combat.enabled || (this.bossesSpawned && g.combat.bossesAlive === 0)
  }

  orders(g: Game): OrderCard[] {
    return this.list
      .filter((o) => o.state !== 'waiting')
      .map((o) => ({
        id: o.id,
        client: o.client,
        lines: o.lines.map((l) => ({ text: specLabel(l.ram, l.ssd), have: l.have, need: l.need })),
        timeLeft: o.limit - (g.elapsed - o.startedAt),
        limit: o.limit,
        state: o.state === 'waiting' ? 'active' : o.state,
      }))
  }

  objectives(g: Game): Objective[] {
    const done = this.list.filter((o) => o.state === 'done').length
    const bosses: Objective[] = g.combat.enabled
      ? [{ text: `👑 Derrotar a los 2 jefes finales${this.bossesSpawned ? ` (quedan ${g.combat.bossesAlive})` : ''}`, done: this.bossesSpawned && g.combat.bossesAlive === 0 }]
      : []
    return [
      { text: `Completar 3 pedidos (${done}/3)`, done: done === 3 },
      ...bosses,
      { text: 'Verificar cada PC con el escáner QR', done: this.scans > 0 },
      { text: 'Fabricar solo lo que se pidió', done: false },
    ]
  }

  metrics(g: Game): Metric[] {
    const errors = g.stats.wrong + g.stats.waste
    return [
      { label: 'PCs entregados', value: String(this.delivered) },
      { label: 'Pedidos a tiempo', value: `${this.onTime} / 3`, tone: this.onTime === 3 ? 'good' : undefined },
      { label: 'Escaneos QR', value: String(this.scans) },
      { label: 'Errores / desperdicio', value: String(errors), tone: errors ? 'bad' : undefined },
      { label: 'Retrasos', value: String(g.stats.late), tone: g.stats.late ? 'bad' : undefined },
    ]
  }

  resources(g: Game): Resources {
    return { personal: 1, maquinas: 3, materia: `${g.stats.materials} piezas` }
  }
}
