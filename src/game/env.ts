import * as THREE from 'three'
import { box, C, cyl, ball, mat } from './models'

export type Theme = 'factory' | 'space'

/** Animación del escenario (planetas, luces, asteroides). */
export type EnvUpdate = (dt: number, t: number) => void

/** Construye el escenario según el tema del nivel. */
export function buildEnvironment(scene: THREE.Scene, theme: Theme): EnvUpdate {
  return theme === 'space' ? buildSpaceStation(scene) : buildFactory(scene)
}

function tileTexture(base: string, alt: string, line: string, glow?: string) {
  const tile = document.createElement('canvas')
  tile.width = tile.height = 128
  const ctx = tile.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = alt
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillRect(64, 64, 64, 64)
  ctx.strokeStyle = line
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, 128, 128)
  if (glow) {
    ctx.fillStyle = glow
    for (const [x, y] of [[4, 4], [120, 4], [4, 120], [120, 120]]) ctx.fillRect(x, y, 4, 4)
  }
  const tex = new THREE.CanvasTexture(tile)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(13, 9)
  return tex
}

function signBoard(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 200
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.roundRect(0, 0, 1024, 200, 40)
  ctx.fill()
  ctx.font = '700 100px "Fredoka", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 512, 108)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.98), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  sign.position.set(0, 2.25, -7.98)
  return sign
}

/* ------------------------------------------------------------------ */
/* Fábrica (niveles 2, 3 y 4)                                          */
/* ------------------------------------------------------------------ */

function buildFactory(scene: THREE.Scene): EnvUpdate {
  scene.background = new THREE.Color(0xbfe3ff)
  scene.fog = new THREE.Fog(0xbfe3ff, 45, 90)
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb6c3d1, 1.6)
  scene.add(hemi, sun(0xfff4e0, 2.2))

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshStandardMaterial({ map: tileTexture('#eef2f6', '#e3e9f0', '#d3dbe5'), roughness: 0.9 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), mat(0x9ad6a0))
  grass.rotation.x = -Math.PI / 2
  grass.position.y = -0.05
  grass.receiveShadow = true
  scene.add(grass)

  scene.add(box(26.4, 3.2, 0.4, 0xf4ece0, [0, 1.6, -8.2]))
  scene.add(box(26.4, 0.35, 0.5, 0x7c9cbf, [0, 3.2, -8.2]))
  for (let x = -10; x <= 10; x += 4) {
    if (Math.abs(x) < 3) continue
    scene.add(box(2.2, 1.0, 0.1, 0xbfdbfe, [x, 2.2, -7.98], mat(0xbfdbfe, 0x1e3a8a, 0.2)))
    scene.add(box(2.4, 0.1, 0.16, C.white, [x, 1.66, -7.95]))
  }
  scene.add(signBoard('⚙ TECH FACTORY', '#facc15'))

  for (const x of [-13, 13]) {
    scene.add(box(0.4, 1.1, 18.4, 0xf4ece0, [x, 0.55, 0]))
    scene.add(box(0.5, 0.15, 18.5, 0x7c9cbf, [x, 1.15, 0]))
  }
  scene.add(box(26.4, 0.25, 0.3, 0x7c9cbf, [0, 0.12, 9.1]))
  for (const z of [-4.6, 4.6]) scene.add(box(22, 0.02, 0.12, C.yellow, [0, 0.011, z]))

  for (const [x, z] of [[-12.2, -7.4], [12.2, -7.4], [-12.2, 8.3], [12.2, 8.3]]) {
    scene.add(cyl(0.35, 0.28, 0.5, 0xc2410c, [x, 0.25, z], 8))
    scene.add(ball(0.5, 0x22c55e, [x, 0.85, z], 7))
    scene.add(ball(0.35, 0x16a34a, [x + 0.2, 1.2, z + 0.1], 7))
  }
  for (const [x, z, s] of [[-11.8, 1.0, 0.7], [-11.9, 1.8, 0.55], [-11.8, 1.4, 0.45]]) {
    scene.add(box(s, s, s, C.cardboard, [x, s / 2 + (s === 0.45 ? 0.7 : 0), z]))
  }
  scene.add(cyl(0.12, 0.12, 26, 0x94a3b8, [0, 2.9, -7.9], 8).rotateZ(Math.PI / 2))
  scene.add(cyl(0.08, 0.08, 26, 0xf59e0b, [0, 2.65, -7.9], 8).rotateZ(Math.PI / 2))
  return () => {}
}

function sun(color: number, intensity: number) {
  const light = new THREE.DirectionalLight(color, intensity)
  light.position.set(-8, 18, 10)
  light.castShadow = true
  light.shadow.mapSize.set(2048, 2048)
  const s = light.shadow.camera
  s.left = -16
  s.right = 16
  s.top = 14
  s.bottom = -14
  s.far = 60
  light.shadow.bias = -0.0005
  return light
}

/* ------------------------------------------------------------------ */
/* Estación espacial (nivel 1)                                         */
/* ------------------------------------------------------------------ */

function planetTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')!
  const bands = ['#f59e0b', '#fbbf24', '#ea580c', '#fcd34d', '#c2410c', '#fde68a', '#f97316', '#fbbf24']
  bands.forEach((b, i) => {
    ctx.fillStyle = b
    ctx.fillRect(0, i * 16, 256, 16)
  })
  ctx.fillStyle = 'rgba(127,29,29,0.6)'
  ctx.beginPath()
  ctx.ellipse(170, 70, 26, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function glowSprite(color: string, size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  s.scale.set(size, size, 1)
  return s
}

function buildSpaceStation(scene: THREE.Scene): EnvUpdate {
  scene.background = new THREE.Color(0x050814)
  scene.fog = null
  scene.add(new THREE.HemisphereLight(0xb4c6ff, 0x1e1b4b, 1.4), sun(0xe0e7ff, 2.3))
  const rim = new THREE.PointLight(0x22d3ee, 30, 30)
  rim.position.set(0, 6, -6)
  scene.add(rim)

  // Estrellas
  const count = 1800
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const palette = [new THREE.Color(0xffffff), new THREE.Color(0xbfdbfe), new THREE.Color(0xfde68a), new THREE.Color(0xf5d0fe)]
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(90 + Math.random() * 30)
    if (v.y < -20) v.y *= -1
    pos.set([v.x, v.y, v.z], i * 3)
    const c = palette[i % palette.length]
    col.set([c.r, c.g, c.b], i * 3)
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }))
  scene.add(stars)

  // Nebulosas de colores
  for (const [color, x, y, z, size] of [
    ['rgba(168,85,247,0.35)', -40, -30, -60, 80],
    ['rgba(56,189,248,0.3)', 45, -25, -40, 70],
    ['rgba(244,114,182,0.25)', 20, -40, 30, 90],
  ] as [string, number, number, number, number][]) {
    const n = glowSprite(color, size)
    n.position.set(x, y, z)
    scene.add(n)
  }

  // Planeta con anillos y luna
  const planet = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 20), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.8 }))
  planet.position.set(-27, -13, -12)
  planet.rotation.z = 0.3
  scene.add(planet)
  const atmo = glowSprite('rgba(251,191,36,0.45)', 32)
  atmo.position.copy(planet.position)
  scene.add(atmo)
  const ring = new THREE.Mesh(new THREE.RingGeometry(14, 20, 64), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }))
  ring.position.copy(planet.position)
  ring.rotation.set(-1.2, 0.2, 0.3)
  scene.add(ring)
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 14), mat(0xcbd5e1))
  moon.position.set(24, -7, -16)
  scene.add(moon)

  // Asteroides flotando
  const asteroids: THREE.Mesh[] = []
  for (let i = 0; i < 14; i++) {
    const a = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 1.2, 0), mat(0x78716c))
    const ang = Math.random() * Math.PI * 2
    const r = 20 + Math.random() * 12
    a.position.set(Math.cos(ang) * r, -6 - Math.random() * 10, Math.sin(ang) * r * 0.7)
    a.userData.spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.6)
    scene.add(a)
    asteroids.push(a)
  }

  // Plataforma de la estación
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 18),
    new THREE.MeshStandardMaterial({ map: tileTexture('#1b2436', '#202b40', '#2c4262', '#67e8f9'), roughness: 0.5, metalness: 0.4 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  scene.add(box(26.6, 0.6, 18.6, 0x334155, [0, -0.31, 0]))
  // Bordes brillantes
  const neon = mat(0x22d3ee, 0x06b6d4)
  scene.add(box(26.6, 0.08, 0.12, 0, [0, 0.02, 9.25], neon), box(26.6, 0.08, 0.12, 0, [0, 0.02, -9.25], neon))
  scene.add(box(0.12, 0.08, 18.6, 0, [-13.25, 0.02, 0], neon), box(0.12, 0.08, 18.6, 0, [13.25, 0.02, 0], neon))
  // Soportes debajo de la estación
  for (const x of [-9, 0, 9]) scene.add(cyl(0.6, 0.3, 8, 0x475569, [x, -4.5, 0], 8))
  // Motores
  for (const x of [-10, 10]) {
    scene.add(cyl(1.2, 1.6, 2, 0x64748b, [x, -1.5, 6], 12))
    const flame = glowSprite('rgba(56,189,248,0.9)', 5)
    flame.position.set(x, -3, 6)
    scene.add(flame)
  }

  // Pared trasera metálica con ventanales al espacio
  scene.add(box(26.4, 3.2, 0.4, 0x334155, [0, 1.6, -8.2]))
  scene.add(box(26.4, 0.2, 0.5, 0x22d3ee, [0, 3.2, -8.2], neon))
  for (let x = -10; x <= 10; x += 4) {
    if (Math.abs(x) < 3) continue
    scene.add(box(2.4, 1.3, 0.1, 0, [x, 2.0, -7.98], mat(0x0b1026, 0x1e1b4b, 0.1)))
    for (let k = 0; k < 6; k++) scene.add(box(0.05, 0.05, 0.02, 0, [x - 1 + Math.random() * 2, 1.5 + Math.random() * 1, -7.92], mat(0xffffff, 0xffffff)))
  }
  scene.add(signBoard('🚀 ESTACIÓN ORBITAL', '#67e8f9'))

  // Barandas laterales con luces
  const lights: THREE.MeshStandardMaterial[] = []
  for (const x of [-13, 13]) {
    scene.add(box(0.3, 0.9, 18.4, 0x475569, [x, 0.45, 0]))
    for (let z = -7; z <= 7; z += 3.5) {
      const m = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1 })
      lights.push(m)
      scene.add(ball(0.12, 0, [x, 1.0, z], 8, m))
    }
  }

  // Cohete junto a la estación
  const rocket = new THREE.Group()
  rocket.add(
    cyl(0.9, 0.9, 5, 0xf8fafc, [0, 3.5, 0], 16),
    new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 16), mat(C.red)).translateY(6.9),
    cyl(0.95, 0.95, 0.4, C.red, [0, 2.2, 0], 16),
    ball(0.35, 0, [0, 4.6, 0.85], 10, mat(0x38bdf8, 0x0ea5e9)),
  )
  for (let i = 0; i < 3; i++) {
    const fin = box(0.1, 1.4, 1.0, C.red, [0, 1.4, 0])
    fin.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.9, 1.4, Math.sin((i / 3) * Math.PI * 2) * 0.9)
    fin.rotation.y = -(i / 3) * Math.PI * 2
    rocket.add(fin)
  }
  rocket.position.set(15, -0.5, -6.5)
  scene.add(rocket)
  scene.add(box(0.3, 7, 0.3, 0x64748b, [13.7, 3, -7.3]), box(1.4, 0.2, 0.2, 0x64748b, [14.3, 5, -7.3]))

  // Antenas y tanques de combustible
  for (const [x, z] of [[-12.2, -7.4], [12.2, -7.4]]) {
    scene.add(cyl(0.05, 0.05, 2.5, 0x94a3b8, [x, 1.25, z], 6))
    scene.add(ball(0.12, 0, [x, 2.55, z], 8, mat(C.red, C.red)))
  }
  for (const [x, z] of [[-12.1, 8.2], [12.1, 8.2]]) {
    scene.add(cyl(0.45, 0.45, 1.2, 0xe2e8f0, [x, 0.6, z], 12), ball(0.45, 0xe2e8f0, [x, 1.2, z], 12))
  }
  for (const z of [-4.6, 4.6]) scene.add(box(22, 0.02, 0.12, 0, [0, 0.011, z], neon))

  return (dt, t) => {
    planet.rotation.y += dt * 0.03
    moon.position.x = 24 + Math.sin(t * 0.05) * 2
    stars.rotation.y += dt * 0.004
    for (const a of asteroids) {
      a.rotation.x += a.userData.spin.x * dt
      a.rotation.y += a.userData.spin.y * dt
      a.position.y += Math.sin(t + a.position.x) * dt * 0.1
    }
    lights.forEach((m, i) => (m.emissiveIntensity = Math.sin(t * 3 + i) > 0.3 ? 1.2 : 0.2))
    rocket.position.y = -0.5 + Math.sin(t * 0.8) * 0.05
  }
}
