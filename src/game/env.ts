import * as THREE from 'three'
import { box, C, cyl, ball, mat } from './models'

/** Construye la nave de la fábrica: piso, paredes y decoración. */
export function buildFactory(scene: THREE.Scene) {
  // Piso con baldosas
  const tile = document.createElement('canvas')
  tile.width = tile.height = 128
  const ctx = tile.getContext('2d')!
  ctx.fillStyle = '#eef2f6'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#e3e9f0'
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillRect(64, 64, 64, 64)
  ctx.strokeStyle = '#d3dbe5'
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(tile)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(13, 9)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // Terreno exterior
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), mat(0x9ad6a0))
  grass.rotation.x = -Math.PI / 2
  grass.position.y = -0.05
  grass.receiveShadow = true
  scene.add(grass)

  // Pared trasera con ventanas
  scene.add(box(26.4, 3.2, 0.4, 0xf4ece0, [0, 1.6, -8.2]))
  scene.add(box(26.4, 0.35, 0.5, 0x7c9cbf, [0, 3.2, -8.2]))
  for (let x = -10; x <= 10; x += 4) {
    if (Math.abs(x) < 3) continue
    scene.add(box(2.2, 1.0, 0.1, 0xbfdbfe, [x, 2.2, -7.98], mat(0xbfdbfe, 0x1e3a8a, 0.2)))
    scene.add(box(2.4, 0.1, 0.16, C.white, [x, 1.66, -7.95]))
  }
  scene.add(signBoard())

  // Paredes laterales bajas (para ver dentro)
  for (const x of [-13, 13]) {
    scene.add(box(0.4, 1.1, 18.4, 0xf4ece0, [x, 0.55, 0]))
    scene.add(box(0.5, 0.15, 18.5, 0x7c9cbf, [x, 1.15, 0]))
  }
  // Borde delantero
  scene.add(box(26.4, 0.25, 0.3, 0x7c9cbf, [0, 0.12, 9.1]))

  // Franjas de seguridad
  for (const z of [-4.6, 4.6]) scene.add(box(22, 0.02, 0.12, C.yellow, [0, 0.011, z]))

  // Plantas y cajas decorativas
  for (const [x, z] of [[-12.2, -7.4], [12.2, -7.4], [-12.2, 8.3], [12.2, 8.3]]) {
    scene.add(cyl(0.35, 0.28, 0.5, 0xc2410c, [x, 0.25, z], 8))
    scene.add(ball(0.5, 0x22c55e, [x, 0.85, z], 7))
    scene.add(ball(0.35, 0x16a34a, [x + 0.2, 1.2, z + 0.1], 7))
  }
  for (const [x, z, s] of [[-11.8, 1.0, 0.7], [-11.9, 1.8, 0.55], [-11.8, 1.4, 0.45]]) {
    scene.add(box(s, s, s, C.cardboard, [x, s / 2 + (s === 0.45 ? 0.7 : 0), z]))
  }

  // Tuberías en la pared
  scene.add(cyl(0.12, 0.12, 26, 0x94a3b8, [0, 2.9, -7.9], 8).rotateZ(Math.PI / 2))
  scene.add(cyl(0.08, 0.08, 26, 0xf59e0b, [0, 2.65, -7.9], 8).rotateZ(Math.PI / 2))
}

function signBoard() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 200
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.roundRect(0, 0, 1024, 200, 40)
  ctx.fill()
  ctx.font = '700 110px "Fredoka", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#facc15'
  ctx.fillText('⚙ TECH FACTORY', 512, 108)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.98), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  sign.position.set(0, 2.25, -7.98)
  return sign
}
