import type * as THREE from 'three'
import type { Game } from './Game'

export type LevelId = 1 | 2 | 3 | 4

export type Product = 'celular' | 'tablet' | 'laptop'

export type ItemKind =
  | 'aluminio'
  | 'placa'
  | 'cpu'
  | 'panel_solar'
  | 'bateria'
  | 'kit_celular'
  | 'kit_tablet'
  | 'kit_laptop'
  | 'lote'
  | 'obleas'
  | 'chasis'
  | 'ram16'
  | 'ram32'
  | 'ssd512'
  | 'ssd1tb'
  | 'pc'

/** Items que se compran en una estantería. */
export type BuyKind = Exclude<ItemKind, 'lote' | 'pc'>

export interface ItemData {
  product?: Product
  count?: number
  ram?: 16 | 32
  ssd?: 512 | 1024
  verified?: boolean
}

export interface Item {
  kind: ItemKind
  label: string
  mesh: THREE.Object3D
  data: ItemData
}

export interface HoldAction {
  key: string
  label: string
  duration: number
  onDone: () => void
}

export interface Station {
  name: string
  object: THREE.Object3D
  /** Huella en el piso (ancho x, fondo z) para colisión y alcance. */
  size: [number, number]
  /** Acción al tocar E. null = no hay acción disponible. */
  prompt?: (g: Game) => string | null
  /** Pista informativa cuando no hay acción. */
  info?: (g: Game) => string | null
  interact?: (g: Game) => void
  /** Acción que requiere mantener E presionada. */
  hold?: (g: Game) => HoldAction | null
  /** Los zombis pueden dañarla (queda detenida hasta repararla). */
  machine?: boolean
  /** Daño personalizado (si no, el motor la marca como dañada). */
  onDamage?: (g: Game) => void
  /** Un zombi ladrón intenta llevarse algo. Devuelve lo robado o null. */
  steal?: (g: Game) => string | null
}

export interface Hint {
  target: THREE.Object3D
  text: string
}

export interface RepairTarget {
  pos: THREE.Vector3
  repair: () => void
}

export type StatKey = 'correct' | 'waste' | 'wrong' | 'late' | 'stops'

export interface LevelStats {
  correct: number
  waste: number
  wrong: number
  late: number
  stops: number
  materials: number
  earned: number
  spent: number
}

export interface Objective {
  text: string
  done: boolean
}

export interface OrderCard {
  id: number
  client: string
  lines: { text: string; have: number; need: number }[]
  timeLeft: number
  limit: number
  state: 'active' | 'late' | 'done'
}

export interface Metric {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'warn'
}

export type ShopCategory = 'arma' | 'defensa' | 'fabrica'

export interface Upgrade {
  id: string
  label: string
  desc: string
  cost: number
  owned: boolean
  category: ShopCategory
  /** Se puede comprar varias veces (munición, botiquín, torretas). */
  repeatable?: boolean
}

export interface WeaponSlot {
  id: string
  name: string
  key: string
  ammo: number | null
  owned: boolean
  active: boolean
}

export interface Resources {
  personal: number
  maquinas: number
  materia: string
}

export interface Level {
  id: LevelId
  /** Fecha límite en segundos (se penaliza el retraso). */
  deadline: number | null
  /** Duración fija del nivel (producción continua). */
  duration: number | null
  /** Tiempo máximo antes de terminar el nivel sin completarlo. */
  maxTime: number
  minScore: number
  /** Puntaje de referencia de un desempeño excelente. */
  refScore: number
  endDelay: number
  build(g: Game): void
  update(dt: number, g: Game): void
  objectives(g: Game): Objective[]
  metrics(g: Game): Metric[]
  resources(g: Game): Resources
  alerts(g: Game): string[]
  orders(g: Game): OrderCard[]
  upgrades(g: Game): Upgrade[]
  buy(id: string, g: Game): void
  /** Siguiente paso sugerido (flecha de ayuda). */
  hint(g: Game): Hint | null
  /** Averías propias del nivel que el robot reparador puede atender. */
  repairTargets(g: Game): RepairTarget[]
  /** Multiplicador de zombis por oleada (nivel 4 = x3). */
  zombieScale: number
  isComplete(g: Game): boolean
  onEnd(g: Game): void
}

export interface Toast {
  id: number
  text: string
  tone: 'good' | 'bad' | 'info' | 'warn'
}

export interface Prompt {
  text: string
  kind: 'tap' | 'hold' | 'info'
}

export interface HudState {
  levelId: LevelId
  score: number
  money: number
  elapsed: number
  deadline: number | null
  duration: number | null
  late: boolean
  resources: Resources
  objectives: Objective[]
  metrics: Metric[]
  alerts: string[]
  orders: OrderCard[]
  upgrades: Upgrade[]
  prompt: Prompt | null
  held: string | null
  hint: string | null
  hp: number
  knocked: number
  hurtAt: number
  weapons: WeaponSlot[]
  zombies: { enabled: boolean; alive: number; wave: number; nextWave: number; kills: number; bosses: { hp: number; max: number }[] }
  shopOpen: boolean
  paused: boolean
  ended: boolean
  toasts: Toast[]
}

export interface LevelResult {
  levelId: LevelId
  score: number
  time: number
  completed: boolean
  passed: boolean
  minScore: number
  refScore: number
  stats: LevelStats
  moneyDelta: number
  summary: Metric[]
}
