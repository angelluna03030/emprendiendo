import * as THREE from 'three'
import type { ItemData, ItemKind, Product } from './types'
import { qrTexture } from './sprites'

/** Modelos low-poly construidos solo con geometrías de Three.js. */

type V3 = [number, number, number]

export const C = {
  wood: 0xe0a96d,
  woodDark: 0xa86b3c,
  metal: 0xb8c4d0,
  steel: 0x8b9bb0,
  dark: 0x334155,
  darker: 0x1e293b,
  yellow: 0xfacc15,
  blue: 0x60a5fa,
  green: 0x4ade80,
  red: 0xf87171,
  purple: 0xa78bfa,
  orange: 0xfb923c,
  teal: 0x2dd4bf,
  pink: 0xf472b6,
  skin: 0xf5c9a5,
  cardboard: 0xd9a871,
  white: 0xf8fafc,
}

export const PRODUCT_COLOR: Record<Product, number> = {
  celular: C.blue,
  tablet: C.pink,
  laptop: C.orange,
}

const cache = new Map<string, THREE.MeshStandardMaterial>()

export function mat(color: number, emissive = 0, rough = 0.8, metal = 0.05) {
  const key = `${color}:${emissive}:${rough}:${metal}`
  let m = cache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: emissive ? 0.8 : 0,
      roughness: rough,
      metalness: metal,
      flatShading: true,
    })
    cache.set(key, m)
  }
  return m
}

/** Material propio (no compartido) para piezas que cambian de color en vivo. */
export function ownMat(color: number, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 1 : 0, flatShading: true, roughness: 0.5 })
}

export function clearMaterialCache() {
  cache.clear()
}

function place<T extends THREE.Mesh>(m: T, pos: V3): T {
  m.position.set(pos[0], pos[1], pos[2])
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export function box(w: number, h: number, d: number, color: number, pos: V3 = [0, 0, 0], material?: THREE.Material) {
  return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material ?? mat(color)), pos)
}

export function cyl(rt: number, rb: number, h: number, color: number, pos: V3 = [0, 0, 0], seg = 12, material?: THREE.Material) {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material ?? mat(color)), pos)
}

export function ball(r: number, color: number, pos: V3 = [0, 0, 0], seg = 10, material?: THREE.Material) {
  return place(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), material ?? mat(color)), pos)
}

function grp(...children: THREE.Object3D[]) {
  const g = new THREE.Group()
  if (children.length) g.add(...children)
  return g
}

/* ------------------------------------------------------------------ */
/* Personajes                                                          */
/* ------------------------------------------------------------------ */

export interface WorkerRig {
  root: THREE.Group
  body: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  hands: THREE.Group
}

export function makeWorker(shirt = 0x3b82f6, hat: number | null = C.yellow, pants = 0x1e3a8a, skin: number = C.skin): WorkerRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const leg = (x: number) => {
    const pivot = grp(box(0.2, 0.42, 0.22, pants, [0, -0.2, 0]), box(0.22, 0.1, 0.3, C.darker, [0, -0.42, 0.04]))
    pivot.position.set(x, 0.46, 0)
    body.add(pivot)
    return pivot
  }
  const legL = leg(-0.13)
  const legR = leg(0.13)

  body.add(box(0.56, 0.52, 0.38, shirt, [0, 0.76, 0]))
  body.add(box(0.58, 0.1, 0.4, C.darker, [0, 0.52, 0]))
  body.add(box(0.2, 0.2, 0.02, C.white, [0, 0.82, 0.2]))

  const head = ball(0.28, skin, [0, 1.28, 0], 12)
  body.add(head)
  body.add(ball(0.045, C.darker, [-0.1, 1.3, 0.25], 6))
  body.add(ball(0.045, C.darker, [0.1, 1.3, 0.25], 6))
  body.add(ball(0.05, 0xfda4af, [-0.17, 1.2, 0.22], 6))
  body.add(ball(0.05, 0xfda4af, [0.17, 1.2, 0.22], 6))

  if (hat !== null) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(hat))
    dome.position.set(0, 1.36, 0)
    dome.castShadow = true
    body.add(dome)
    body.add(cyl(0.36, 0.36, 0.04, hat, [0, 1.37, 0.03], 14))
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(0x5b3a29))
    hair.position.set(0, 1.3, -0.02)
    body.add(hair)
  }

  const arm = (x: number) => {
    const pivot = grp(box(0.14, 0.42, 0.16, shirt, [0, -0.18, 0]), ball(0.09, skin, [0, -0.42, 0], 6))
    pivot.position.set(x, 0.98, 0)
    body.add(pivot)
    return pivot
  }
  const armL = arm(-0.36)
  const armR = arm(0.36)

  const hands = new THREE.Group()
  hands.position.set(0, 0.78, 0.5)
  body.add(hands)

  return { root, body, armL, armR, legL, legR, hands }
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

const RAM_COLOR = { 16: C.blue, 32: C.purple } as const
const SSD_COLOR = { 512: C.teal, 1024: C.orange } as const

export function makeItemMesh(kind: ItemKind, data: ItemData = {}): THREE.Group {
  const g = new THREE.Group()
  const shiny = mat(0xdbe4ee, 0, 0.3, 0.6)
  switch (kind) {
    case 'aluminio':
      g.add(box(0.62, 0.07, 0.46, 0, [0, 0.04, 0], shiny), box(0.62, 0.07, 0.46, 0, [0.03, 0.12, 0.02], shiny))
      break
    case 'placa':
      g.add(
        box(0.56, 0.05, 0.42, 0x16a34a, [0, 0.03, 0]),
        box(0.14, 0.06, 0.14, C.darker, [-0.12, 0.08, 0]),
        box(0.08, 0.05, 0.22, C.yellow, [0.16, 0.07, 0.04]),
        box(0.1, 0.06, 0.08, C.metal, [0.12, 0.08, -0.13]),
      )
      break
    case 'cpu':
      g.add(
        box(0.4, 0.03, 0.4, 0xeab308, [0, 0.02, 0]),
        box(0.36, 0.06, 0.36, C.dark, [0, 0.06, 0]),
        box(0.24, 0.03, 0.24, 0, [0, 0.1, 0], shiny),
      )
      break
    case 'panel_solar':
      g.add(box(0.72, 0.05, 0.48, 0x1e3a8a, [0, 0.03, 0]), box(0.02, 0.06, 0.48, C.white, [0, 0.04, 0]), box(0.72, 0.06, 0.02, C.white, [0, 0.04, 0]))
      break
    case 'bateria':
      g.add(box(0.3, 0.44, 0.24, 0x22c55e, [0, 0.22, 0]), box(0.31, 0.1, 0.25, 0x14532d, [0, 0.22, 0]), box(0.12, 0.06, 0.1, C.metal, [0, 0.47, 0]))
      break
    case 'kit_celular':
    case 'kit_tablet':
    case 'kit_laptop': {
      const product = kind.slice(4) as Product
      g.add(
        box(0.6, 0.44, 0.5, C.cardboard, [0, 0.22, 0]),
        box(0.62, 0.12, 0.52, PRODUCT_COLOR[product], [0, 0.26, 0]),
        box(0.1, 0.02, 0.52, 0xc08a52, [0, 0.45, 0]),
      )
      break
    }
    case 'lote': {
      g.add(box(0.8, 0.08, 0.6, C.wood, [0, 0.04, 0]))
      for (const [x, z, w, d] of [[0, 0.28, 0.8, 0.05], [0, -0.28, 0.8, 0.05], [0.38, 0, 0.05, 0.6], [-0.38, 0, 0.05, 0.6]]) {
        g.add(box(w, 0.3, d, C.woodDark, [x, 0.2, z]))
      }
      const color = PRODUCT_COLOR[data.product ?? 'celular']
      const n = Math.min(6, Math.ceil((data.count ?? 10) / 5))
      for (let i = 0; i < n; i++) {
        g.add(box(0.2, 0.16, 0.2, color, [-0.22 + (i % 3) * 0.22, 0.17 + Math.floor(i / 3) * 0.17, (i % 2) * 0.1 - 0.05]))
      }
      break
    }
    case 'obleas': {
      g.add(box(0.62, 0.1, 0.62, 0x2563eb, [0, 0.05, 0]))
      const wafer = mat(0xc4b5fd, 0x312e81, 0.2, 0.7)
      for (let i = 0; i < 5; i++) g.add(cyl(0.26, 0.26, 0.04, 0, [0, 0.13 + i * 0.06, 0], 16, wafer))
      break
    }
    case 'chasis':
      g.add(box(0.34, 0.56, 0.52, 0x475569, [0, 0.28, 0]), box(0.02, 0.5, 0.46, C.darker, [0.18, 0.28, 0]))
      break
    case 'ram16':
    case 'ram32': {
      const size = kind === 'ram16' ? 16 : 32
      const sticks = size === 16 ? [0] : [-0.07, 0.07]
      for (const x of sticks) {
        g.add(box(0.06, 0.16, 0.56, 0x15803d, [x, 0.12, 0]), box(0.07, 0.1, 0.46, RAM_COLOR[size], [x, 0.14, 0]), box(0.065, 0.03, 0.56, C.yellow, [x, 0.04, 0]))
      }
      break
    }
    case 'ssd512':
    case 'ssd1tb': {
      const size = kind === 'ssd512' ? 512 : 1024
      g.add(box(0.46, 0.07, 0.32, C.darker, [0, 0.04, 0]), box(0.3, 0.02, 0.2, SSD_COLOR[size], [0, 0.085, 0]))
      break
    }
    case 'pc': {
      const ram = data.ram ?? 16
      const ssd = data.ssd ?? 512
      g.add(
        box(0.4, 0.66, 0.56, 0xe2e8f0, [0, 0.33, 0]),
        box(0.02, 0.56, 0.1, RAM_COLOR[ram], [0.21, 0.36, -0.12], mat(RAM_COLOR[ram], RAM_COLOR[ram])),
        box(0.02, 0.56, 0.1, SSD_COLOR[ssd], [0.21, 0.36, 0.12], mat(SSD_COLOR[ssd], SSD_COLOR[ssd])),
        box(0.3, 0.04, 0.02, C.darker, [0, 0.55, 0.29]),
      )
      if (data.verified) g.add(box(0.26, 0.26, 0.04, C.green, [0, 0.8, 0], mat(C.green, 0x15803d)))
      break
    }
  }
  return g
}

/* ------------------------------------------------------------------ */
/* Estaciones                                                          */
/* ------------------------------------------------------------------ */

export function makeShelf(kind: ItemKind, tint = 0x7c9cbf): THREE.Group {
  const g = new THREE.Group()
  const w = 1.7
  const d = 0.8
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) g.add(box(0.08, 1.7, 0.08, C.dark, [x, 0.85, z]))
  for (const y of [0.15, 0.8, 1.45]) g.add(box(w + 0.05, 0.06, d, tint, [0, y, 0]))
  for (const y of [0.18, 0.83]) {
    for (const x of [-0.42, 0.42]) {
      const item = makeItemMesh(kind)
      item.position.set(x, y, 0)
      item.scale.setScalar(0.85)
      g.add(item)
    }
  }
  return g
}

export function makeTable(color = C.wood): THREE.Group {
  const g = grp(box(1.4, 0.1, 1.0, color, [0, 0.85, 0]))
  for (const x of [-0.6, 0.6]) for (const z of [-0.4, 0.4]) g.add(box(0.1, 0.8, 0.1, C.woodDark, [x, 0.4, z]))
  return g
}

export function makeTrash(): THREE.Group {
  return grp(
    cyl(0.4, 0.32, 0.85, 0x10b981, [0, 0.425, 0], 10),
    cyl(0.45, 0.45, 0.08, 0x047857, [0, 0.87, 0], 10),
    box(0.3, 0.05, 0.05, C.white, [0, 0.5, 0.39]),
    box(0.05, 0.3, 0.05, C.white, [0, 0.5, 0.39]),
  )
}

export function makePlatform(): THREE.Group {
  const g = grp(cyl(1.35, 1.5, 0.2, 0x64748b, [0, 0.1, 0], 24), cyl(1.15, 1.15, 0.06, 0x94a3b8, [0, 0.23, 0], 24))
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const b = box(0.35, 0.05, 0.14, i % 2 ? C.yellow : C.darker, [Math.cos(a) * 1.27, 0.21, Math.sin(a) * 1.27])
    b.rotation.y = -a + Math.PI / 2
    g.add(b)
  }
  for (const x of [-1.3, 1.3]) g.add(box(0.1, 1.6, 0.1, C.dark, [x, 0.8, -1.0]), ball(0.14, C.yellow, [x, 1.65, -1.0], 8, mat(C.yellow, 0xf59e0b)))
  return g
}

export function makeTerminal(): { group: THREE.Group; screen: THREE.MeshStandardMaterial } {
  const screen = ownMat(0x38bdf8, 0x0369a1)
  const g = grp(
    box(1.5, 0.1, 0.8, 0xe2e8f0, [0, 0.8, 0]),
    box(0.1, 0.75, 0.7, C.steel, [-0.65, 0.4, 0]),
    box(0.1, 0.75, 0.7, C.steel, [0.65, 0.4, 0]),
    box(0.1, 0.35, 0.1, C.darker, [0, 1.0, -0.2]),
    box(1.0, 0.62, 0.08, C.darker, [0, 1.42, -0.2]),
    box(0.9, 0.52, 0.02, 0, [0, 1.42, -0.155], screen),
    box(0.6, 0.03, 0.22, C.dark, [0, 0.87, 0.12]),
  )
  return { group: g, screen }
}

export interface MachineRig {
  group: THREE.Group
  light: THREE.MeshStandardMaterial
  piston: THREE.Mesh
  body: THREE.Mesh
}

export function makeMachine(color: number, w = 2.2, d = 1.4, h = 1.5): MachineRig {
  const light = ownMat(C.green, C.green)
  const body = box(w * 0.9, h, d * 0.9, color, [0, 0.2 + h / 2, 0])
  const piston = box(0.34, 0.4, 0.34, C.metal, [0, h + 0.35, 0])
  const g = grp(
    box(w, 0.2, d, C.dark, [0, 0.1, 0]),
    body,
    box(w * 0.92, 0.12, d * 0.92, C.yellow, [0, 0.45, 0]),
    box(w * 0.5, h * 0.35, 0.04, 0x0f172a, [0, 0.2 + h * 0.6, d * 0.45 + 0.01], mat(0x0f172a, 0x1e40af)),
    piston,
    cyl(0.12, 0.12, 0.5, C.steel, [-w * 0.32, h + 0.45, -d * 0.2], 8),
    box(0.06, 0.4, 0.06, C.dark, [w * 0.36, h + 0.35, d * 0.25]),
    ball(0.14, 0, [w * 0.36, h + 0.6, d * 0.25], 8, light),
  )
  return { group: g, light, piston, body }
}

export function makeConveyor(length: number): THREE.Group {
  const g = grp(
    box(length, 0.45, 0.9, 0x475569, [0, 0.25, 0]),
    box(length, 0.06, 0.78, C.darker, [0, 0.5, 0]),
    box(length, 0.1, 0.06, C.yellow, [0, 0.55, 0.44]),
    box(length, 0.1, 0.06, C.yellow, [0, 0.55, -0.44]),
  )
  return g
}

export function makeDock(): THREE.Group {
  const g = grp(box(2.0, 0.04, 1.8, 0x94a3b8, [0, 0.02, 0]), box(1.4, 0.14, 1.1, C.wood, [0, 0.1, 0]))
  for (let i = 0; i < 8; i++) {
    g.add(box(0.25, 0.05, 0.1, i % 2 ? C.yellow : C.darker, [-0.88 + i * 0.25, 0.04, 0.95]))
    g.add(box(0.25, 0.05, 0.1, i % 2 ? C.darker : C.yellow, [-0.88 + i * 0.25, 0.04, -0.95]))
  }
  g.add(box(0.1, 1.4, 0.1, C.dark, [0.95, 0.7, -0.8]), box(0.9, 0.4, 0.06, C.green, [0.55, 1.35, -0.8], mat(C.green, 0x166534)))
  return g
}

export function makeTruck(color = C.blue): THREE.Group {
  const g = grp(
    box(3.2, 1.9, 1.9, C.white, [0, 1.35, 0]),
    box(3.22, 0.3, 1.92, color, [0, 1.0, 0]),
    box(1.3, 1.4, 1.8, color, [2.35, 1.1, 0]),
    box(0.05, 0.6, 1.5, 0x93c5fd, [3.01, 1.45, 0], mat(0x93c5fd, 0x1e3a8a, 0.2)),
  )
  for (const x of [-1, 1, 2.3]) {
    for (const z of [-0.95, 0.95]) {
      const wheel = cyl(0.36, 0.36, 0.25, C.darker, [x, 0.36, z], 12)
      wheel.rotation.x = Math.PI / 2
      g.add(wheel)
    }
  }
  return g
}

export function makeScanner(): { group: THREE.Group; laser: THREE.Mesh } {
  const laser = box(1.5, 0.03, 0.03, 0, [0, 1.0, 0], mat(0xef4444, 0xef4444))
  const qr = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: qrTexture() }))
  qr.position.set(0, 1.85, 0.17)
  const g = grp(
    box(1.9, 0.05, 1.0, C.darker, [0, 0.025, 0]),
    box(0.16, 1.8, 0.16, C.dark, [-0.85, 0.9, 0]),
    box(0.16, 1.8, 0.16, C.dark, [0.85, 0.9, 0]),
    box(1.86, 0.34, 0.3, 0x0ea5e9, [0, 1.85, 0]),
    laser,
    qr,
  )
  return { group: g, laser }
}

export interface HopperRig {
  group: THREE.Group
  fill: THREE.Mesh
  fillMat: THREE.MeshStandardMaterial
}

export function makeHopper(): HopperRig {
  const fillMat = ownMat(C.green, 0x166534)
  const fillGeo = new THREE.BoxGeometry(0.16, 1, 0.08)
  fillGeo.translate(0, 0.5, 0)
  const fill = new THREE.Mesh(fillGeo, fillMat)
  fill.position.set(1.0, 1.0, 0.05)
  const g = grp(
    box(0.12, 1.3, 0.12, C.dark, [-0.55, 0.65, -0.55]),
    box(0.12, 1.3, 0.12, C.dark, [0.55, 0.65, -0.55]),
    box(0.12, 1.3, 0.12, C.dark, [-0.55, 0.65, 0.55]),
    box(0.12, 1.3, 0.12, C.dark, [0.55, 0.65, 0.55]),
    cyl(0.85, 0.3, 1.0, 0x94a3b8, [0, 1.7, 0], 8),
    cyl(0.2, 0.2, 0.6, C.steel, [0, 0.95, 0], 8),
    box(0.26, 1.1, 0.06, C.darker, [1.0, 1.55, 0]),
    fill,
  )
  return { group: g, fill, fillMat }
}

export function makeCounter(): THREE.Group {
  return grp(
    box(2.4, 1.0, 0.8, 0xf59e8b, [0, 0.5, 0]),
    box(2.5, 0.08, 0.9, 0xfff7ed, [0, 1.04, 0]),
    box(0.5, 0.3, 0.4, C.dark, [0.8, 1.23, 0]),
    box(0.4, 0.15, 0.05, C.green, [0.8, 1.4, -0.1], mat(C.green, 0x166534)),
  )
}

export function makeRobotArm(): { group: THREE.Group; joint: THREE.Group } {
  const joint = grp(box(0.2, 1.1, 0.2, C.orange, [0, 0.55, 0]), ball(0.16, C.dark, [0, 1.1, 0]), box(0.9, 0.16, 0.16, C.orange, [0.45, 1.1, 0]), box(0.2, 0.22, 0.2, C.dark, [0.9, 1.0, 0]))
  joint.position.y = 0.3
  const g = grp(cyl(0.4, 0.45, 0.3, C.dark, [0, 0.15, 0], 10), joint)
  return { group: g, joint }
}

/* ------------------------------------------------------------------ */
/* Satélite (nivel por proyecto)                                       */
/* ------------------------------------------------------------------ */

export function makeSatelliteParts(): { ghost: THREE.Object3D; parts: THREE.Object3D[]; beacon: THREE.MeshStandardMaterial } {
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, wireframe: true, transparent: true, opacity: 0.7 }),
  )
  ghost.position.y = 0.8

  const gold = mat(0xfbbf24, 0x78350f, 0.35, 0.6)
  const structure = grp(box(0.95, 0.95, 0.95, 0, [0, 0.8, 0], gold), box(1.0, 0.08, 1.0, C.dark, [0, 0.3, 0]), box(1.0, 0.08, 1.0, C.dark, [0, 1.3, 0]))

  const dish = cyl(0.5, 0.08, 0.18, C.white, [0, 1.6, 0], 16)
  const electronics = grp(dish, cyl(0.03, 0.03, 0.5, C.dark, [0, 1.8, 0], 6), ball(0.07, C.red, [0, 2.07, 0], 6), box(0.5, 0.4, 0.04, 0x16a34a, [0, 0.8, 0.5]))

  const wing = (x: number) => grp(box(0.5, 0.06, 0.06, C.metal, [x * 0.7, 0.8, 0]), box(1.3, 0.05, 0.62, 0x1e3a8a, [x * 1.5, 0.8, 0], mat(0x1e3a8a, 0x1e3a8a, 0.3, 0.4)))
  const energy = grp(wing(-1), wing(1))

  const beacon = ownMat(C.green, C.green)
  const software = grp(ball(0.1, 0, [0.35, 1.42, 0.35], 8, beacon), box(0.3, 0.2, 0.02, 0, [-0.2, 1.0, 0.5], mat(0x38bdf8, 0x0369a1)))

  const tested = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 32), mat(C.green, 0x16a34a))
  tested.rotation.x = Math.PI / 2
  tested.position.y = 0.35
  const tests = grp(tested)

  const parts = [structure, electronics, energy, software, tests]
  for (const p of parts) p.visible = false
  return { ghost, parts, beacon }
}

/* ------------------------------------------------------------------ */
/* Zombis, armas y robots                                              */
/* ------------------------------------------------------------------ */

export function makeZombie(brute: boolean): WorkerRig {
  const rig = makeWorker(brute ? 0x7f1d1d : 0x6b7280, null, 0x44403c, 0x86c77a)
  rig.root.scale.setScalar(brute ? 1.35 : 1)
  // Brazos estirados hacia adelante
  rig.armL.rotation.x = rig.armR.rotation.x = -1.45
  // Ojos rojos brillantes
  const eye = mat(0xef4444, 0xef4444)
  rig.body.add(ball(0.05, 0, [-0.1, 1.3, 0.26], 6, eye), ball(0.05, 0, [0.1, 1.3, 0.26], 6, eye))
  return rig
}

/** Jefe final: zombi gigante con corona y ojos brillantes. */
export function makeBoss(): WorkerRig {
  const rig = makeWorker(0x1e1b4b, null, 0x111827, 0x65a30d)
  rig.root.scale.setScalar(2.2)
  rig.armL.rotation.x = rig.armR.rotation.x = -1.45
  const eye = mat(0xfacc15, 0xfacc15)
  rig.body.add(ball(0.06, 0, [-0.1, 1.3, 0.26], 6, eye), ball(0.06, 0, [0.1, 1.3, 0.26], 6, eye))
  const gold = mat(0xfbbf24, 0xb45309, 0.3, 0.7)
  rig.body.add(cyl(0.24, 0.26, 0.14, 0, [0, 1.6, 0], 10, gold))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), gold)
    spike.position.set(Math.cos(a) * 0.2, 1.74, Math.sin(a) * 0.2)
    rig.body.add(spike)
  }
  rig.body.add(ball(0.05, 0, [0, 1.62, 0.25], 6, mat(C.red, C.red)))
  return rig
}

export function makeGun(kind: string): THREE.Group {
  const g = new THREE.Group()
  const barrel = (r: number, len: number, color: number, x: number, y: number, z: number, material?: THREE.Material) =>
    cyl(r, r, len, color, [x, y, z], 8, material).rotateX(Math.PI / 2)
  switch (kind) {
    case 'subfusil':
      g.add(box(0.12, 0.14, 0.62, C.darker, [0, 0, 0.25]), box(0.08, 0.26, 0.1, C.dark, [0, -0.15, 0.1]), box(0.06, 0.2, 0.08, C.orange, [0, -0.12, 0.32]))
      break
    case 'escopeta':
      g.add(box(0.12, 0.13, 0.8, 0x78350f, [0, 0, 0.3]), barrel(0.05, 0.5, C.darker, 0.03, 0.05, 0.55), barrel(0.05, 0.5, C.darker, -0.03, 0.05, 0.55))
      break
    case 'rifle':
      g.add(box(0.1, 0.14, 0.9, 0xe2e8f0, [0, 0, 0.35]), barrel(0.04, 0.5, 0, 0, 0.02, 0.8, mat(0x22d3ee, 0x06b6d4)), box(0.06, 0.1, 0.25, 0x22d3ee, [0, 0.1, 0.25], mat(0x22d3ee, 0x0891b2)))
      break
    case 'lanzallamas':
      g.add(cyl(0.12, 0.12, 0.45, C.red, [0, -0.05, 0.05], 10), barrel(0.05, 0.55, C.dark, 0, 0.05, 0.45), ball(0.07, 0, [0, 0.05, 0.74], 6, mat(C.orange, 0xf97316)))
      break
    case 'bazuca':
      g.add(barrel(0.12, 1.0, 0x4d7c0f, 0, 0.08, 0.3), barrel(0.14, 0.12, C.darker, 0, 0.08, 0.82), box(0.08, 0.22, 0.1, C.dark, [0, -0.1, 0.15]))
      break
    case 'minigun': {
      const spin = new THREE.Group()
      spin.name = 'spin'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        spin.add(barrel(0.03, 0.7, C.darker, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0))
      }
      spin.position.set(0, 0.02, 0.55)
      g.add(box(0.2, 0.22, 0.4, C.yellow, [0, 0, 0.05]), spin)
      break
    }
    default:
      g.add(box(0.1, 0.13, 0.36, C.dark, [0, 0, 0.14]), box(0.08, 0.2, 0.09, C.darker, [0, -0.12, 0.02]))
  }
  return g
}

/** Zombi volador: pequeño, con alas de murciélago. */
export function makeFlyer(): WorkerRig & { wings: THREE.Group[] } {
  const rig = makeWorker(0x4c1d95, null, 0x1e1b4b, 0x86c77a)
  rig.root.scale.setScalar(0.8)
  rig.armL.rotation.x = rig.armR.rotation.x = -1.45
  const eye = mat(0xfacc15, 0xfacc15)
  rig.body.add(ball(0.05, 0, [-0.1, 1.3, 0.26], 6, eye), ball(0.05, 0, [0.1, 1.3, 0.26], 6, eye))
  const wingMat = mat(0x6d28d9, 0x2e1065)
  const wing = (side: number) => {
    const w = new THREE.Group()
    w.position.set(side * 0.28, 0.95, -0.15)
    const m1 = box(0.9, 0.04, 0.5, 0, [side * 0.45, 0, 0], wingMat)
    const m2 = box(0.5, 0.04, 0.35, 0, [side * 0.95, -0.05, -0.1], wingMat)
    w.add(m1, m2)
    rig.body.add(w)
    return w
  }
  return { ...rig, wings: [wing(-1), wing(1)] }
}

/** Zombi corredor: flaco y rápido. */
export function makeRunner(): WorkerRig {
  const rig = makeWorker(0xea580c, null, 0x44403c, 0x9bd08a)
  rig.root.scale.set(0.85, 1.05, 0.85)
  rig.armL.rotation.x = rig.armR.rotation.x = -1.2
  const eye = mat(0xef4444, 0xef4444)
  rig.body.add(ball(0.05, 0, [-0.1, 1.3, 0.26], 6, eye), ball(0.05, 0, [0.1, 1.3, 0.26], 6, eye))
  return rig
}

/** Zombi explosivo: inflado y brillante. */
export function makeExploder(): WorkerRig & { glow: THREE.MeshStandardMaterial } {
  const rig = makeWorker(0x7f1d1d, null, 0x44403c, 0x86c77a)
  rig.armL.rotation.x = rig.armR.rotation.x = -1.45
  const glow = ownMat(0xf97316, 0xea580c)
  rig.body.add(ball(0.42, 0, [0, 0.8, 0.05], 10, glow))
  for (const [x, y] of [[-0.2, 1.0], [0.25, 0.65], [0.1, 1.05]]) rig.body.add(ball(0.08, 0, [x, y, 0.4], 6, mat(C.yellow, C.yellow)))
  return { ...rig, glow }
}

/** Casco de astronauta para los zombis del espacio. */
export function makeHelmet(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.3 }),
  )
  m.position.set(0, 1.28, 0)
  return m
}

export function makeMine(): THREE.Group {
  return grp(cyl(0.28, 0.32, 0.1, C.dark, [0, 0.05, 0], 10), ball(0.07, 0, [0, 0.13, 0], 6, mat(C.red, C.red)))
}

export function makeTesla(): { group: THREE.Group; orb: THREE.MeshStandardMaterial } {
  const orb = ownMat(0x93c5fd, 0x3b82f6)
  const g = grp(cyl(0.45, 0.55, 0.25, C.dark, [0, 0.12, 0], 8), cyl(0.12, 0.18, 1.4, C.steel, [0, 0.9, 0], 8))
  for (const y of [0.6, 0.9, 1.2]) g.add(cyl(0.3, 0.3, 0.06, 0xb45309, [0, y, 0], 12))
  g.add(ball(0.26, 0, [0, 1.8, 0], 12, orb))
  return { group: g, orb }
}

export function makeTurret(): { group: THREE.Group; head: THREE.Group } {
  const head = grp(box(0.5, 0.36, 0.5, 0x0ea5e9, [0, 0, 0]), cyl(0.07, 0.07, 0.6, C.darker, [0, 0.02, 0.45], 8).rotateX(Math.PI / 2), ball(0.08, 0, [0, 0.2, 0.2], 6, mat(C.red, C.red)))
  head.position.y = 1.05
  const g = grp(cyl(0.45, 0.55, 0.25, C.dark, [0, 0.12, 0], 8), cyl(0.12, 0.12, 0.7, C.steel, [0, 0.55, 0], 8), head)
  return { group: g, head }
}

export function makeBot(color: number): { group: THREE.Group; head: THREE.Group } {
  const head = grp(box(0.5, 0.36, 0.42, color, [0, 0, 0]), box(0.36, 0.14, 0.02, 0x0f172a, [0, 0.03, 0.22]), ball(0.04, 0, [-0.08, 0.04, 0.24], 6, mat(C.teal, C.teal)), ball(0.04, 0, [0.08, 0.04, 0.24], 6, mat(C.teal, C.teal)))
  head.position.y = 1.0
  const g = grp(box(0.6, 0.5, 0.5, C.white, [0, 0.5, 0]), box(0.62, 0.1, 0.52, color, [0, 0.62, 0]), head)
  for (const x of [-0.3, 0.3]) {
    const w = cyl(0.16, 0.16, 0.12, C.darker, [x, 0.16, 0], 10)
    w.rotation.z = Math.PI / 2
    g.add(w)
  }
  g.add(cyl(0.02, 0.02, 0.3, C.dark, [0.15, 1.3, 0], 4), ball(0.05, 0, [0.15, 1.46, 0], 6, mat(C.red, C.red)))
  return { group: g, head }
}

export function makeDrone(): THREE.Group {
  const g = grp(box(0.5, 0.16, 0.5, C.orange, [0, 0, 0]), box(0.2, 0.1, 0.2, C.darker, [0, -0.12, 0]))
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
    g.add(box(0.06, 0.06, 0.06, C.dark, [x, 0.06, z]), cyl(0.2, 0.2, 0.02, 0xe2e8f0, [x, 0.1, z], 10))
  }
  return g
}

export function makeHintArrow(): THREE.Group {
  const m = new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 12), m)
  cone.rotation.x = Math.PI
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10), m)
  stem.position.y = 0.5
  return grp(cone, stem)
}
