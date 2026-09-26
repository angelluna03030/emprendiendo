import * as THREE from 'three'
import type { Game } from '../Game'
import { CATALOG, makeItem } from '../items'
import { makeShelf, makeTable, makeTrash } from '../models'
import { TextSprite } from '../sprites'
import type { BuyKind, Hint, Item, Level, LevelId, Metric, Objective, OrderCard, RepairTarget, Resources, Station, Upgrade } from '../types'

/** Implementación por defecto de las partes opcionales de un nivel. */
export abstract class BaseLevel implements Level {
  abstract id: LevelId
  abstract deadline: number | null
  abstract duration: number | null
  abstract maxTime: number
  abstract minScore: number
  abstract refScore: number
  endDelay = 1.6
  zombieScale = 1
  abstract build(g: Game): void
  abstract update(dt: number, g: Game): void
  abstract objectives(g: Game): Objective[]
  abstract metrics(g: Game): Metric[]
  abstract resources(g: Game): Resources
  abstract isComplete(g: Game): boolean
  /* eslint-disable @typescript-eslint/no-unused-vars */
  alerts(_g: Game): string[] {
    return []
  }
  orders(_g: Game): OrderCard[] {
    return []
  }
  upgrades(_g: Game): Upgrade[] {
    return []
  }
  buy(_id: string, _g: Game) {}
  hint(_g: Game): Hint | null {
    return null
  }
  repairTargets(_g: Game): RepairTarget[] {
    return []
  }
  onEnd(_g: Game) {}
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

/** Bonificación por terminar antes de la fecha límite. */
export function timeBonus(g: Game, divisor: number, cap: number) {
  const deadline = g.level.deadline
  if (deadline === null || g.isLate) return
  const left = deadline - g.elapsed
  const bonus = Math.min(cap, Math.floor(left / divisor))
  if (bonus > 0) g.reward(bonus, 'Bonus por tiempo restante')
}

export function at(obj: THREE.Object3D, y = 2.2) {
  return obj.position.clone().setY(y)
}

export function label(obj: THREE.Object3D, text: string, y: number, opts: ConstructorParameters<typeof TextSprite>[1] = {}) {
  const t = new TextSprite(text, opts)
  t.sprite.position.set(0, y, 0)
  obj.add(t.sprite)
  return t
}

export function place(obj: THREE.Object3D, x: number, z: number, rotY = 0) {
  obj.position.set(x, 0, z)
  obj.rotation.y = rotY
  return obj
}

/** Estantería de materia prima: cada vez que tomas algo se paga su costo. */
export function addShelf(g: Game, kind: BuyKind, x: number, z: number, tint?: number): Station {
  const info = CATALOG[kind]
  const object = place(makeShelf(kind, tint), x, z)
  label(object, `${info.label}\n$${info.cost}`, 2.25, { lineHeight: 0.34 })
  return g.addStation({
    name: info.label,
    object,
    size: [1.8, 0.9],
    prompt: (g) => (g.held ? null : `Comprar ${info.label} ($${info.cost})`),
    info: (g) => (g.held ? 'Tienes las manos ocupadas' : null),
    interact: (g) => {
      if (!g.spend(info.cost, at(object, 2.6))) return
      g.stats.materials++
      g.take(makeItem(kind))
    },
    // Un zombi se lleva materia prima ya pagada del inventario.
    steal: (g) => {
      g.loseMoney(info.cost)
      return info.label
    },
  })
}

/** Mesa de apoyo: guarda un item. */
export function addTable(g: Game, x: number, z: number): Station {
  const object = place(makeTable(), x, z)
  let item: Item | null = null
  return g.addStation({
    name: 'Mesa',
    object,
    size: [1.4, 1.0],
    prompt: (g) => {
      if (g.held && !item) return `Dejar ${g.held.label} en la mesa`
      if (!g.held && item) return `Tomar ${item.label}`
      return null
    },
    info: (g) => (g.held && item ? 'La mesa está ocupada' : 'Puedes dejar un objeto aquí'),
    interact: (g) => {
      if (g.held && !item) {
        item = g.release()
        item.mesh.position.set(0, 0.9, 0)
        object.add(item.mesh)
      } else if (!g.held && item) {
        object.remove(item.mesh)
        g.take(item)
        item = null
      }
    },
    steal: () => {
      if (!item) return null
      const stolen = item
      object.remove(stolen.mesh)
      item = null
      return stolen.label
    },
  })
}

/** Caneca: desechar cuenta como desperdicio. */
export function addTrash(g: Game, x: number, z: number): Station {
  const object = place(makeTrash(), x, z)
  label(object, '🗑 Desechos', 1.5, { lineHeight: 0.3 })
  return g.addStation({
    name: 'Caneca',
    object,
    size: [0.9, 0.9],
    prompt: (g) => (g.held ? `Desechar ${g.held.label} (−10)` : null),
    info: () => 'Desechar cuenta como desperdicio',
    interact: (g) => {
      const item = g.consumeHeld()
      g.reward(-10, `Desperdicio: ${item.label}`, 'waste', { at: at(object) })
    },
  })
}

export function fmtTime(s: number) {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
