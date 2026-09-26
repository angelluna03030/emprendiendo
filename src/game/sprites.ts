import * as THREE from 'three'

const FONT = '"Fredoka", "Segoe UI", system-ui, sans-serif'

interface TextOptions {
  bg?: string | null
  fg?: string
  /** Altura en unidades del mundo de cada línea. */
  lineHeight?: number
  stroke?: string
}

/** Etiqueta de texto en 3D que siempre mira a la cámara. */
export class TextSprite {
  readonly sprite: THREE.Sprite
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private texture: THREE.CanvasTexture
  private opts: Required<TextOptions>
  private current = ''

  constructor(text: string, opts: TextOptions = {}) {
    this.opts = {
      bg: opts.bg === undefined ? 'rgba(255,255,255,0.92)' : opts.bg,
      fg: opts.fg ?? '#1e293b',
      lineHeight: opts.lineHeight ?? 0.42,
      stroke: opts.stroke ?? '',
    }
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 4
    const material = new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true })
    this.sprite = new THREE.Sprite(material)
    this.sprite.renderOrder = 10
    this.set(text)
  }

  set(text: string, fg?: string) {
    const key = `${text}|${fg ?? ''}`
    if (key === this.current) return
    this.current = key
    const lines = text.split('\n')
    const px = 64
    const pad = 26
    const ctx = this.ctx
    ctx.font = `600 ${px}px ${FONT}`
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2
    const height = lines.length * px * 1.15 + pad * 0.9
    this.canvas.width = Math.ceil(width)
    this.canvas.height = Math.ceil(height)
    ctx.font = `600 ${px}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (this.opts.bg) {
      ctx.fillStyle = this.opts.bg
      ctx.beginPath()
      ctx.roundRect(4, 4, this.canvas.width - 8, this.canvas.height - 8, 30)
      ctx.fill()
    }
    lines.forEach((line, i) => {
      const y = pad * 0.45 + px * 1.15 * (i + 0.5)
      if (this.opts.stroke) {
        ctx.lineWidth = 12
        ctx.strokeStyle = this.opts.stroke
        ctx.strokeText(line, this.canvas.width / 2, y)
      }
      ctx.fillStyle = fg ?? this.opts.fg
      ctx.fillText(line, this.canvas.width / 2, y)
    })
    this.texture.needsUpdate = true
    const h = (this.canvas.height / (px * 1.15)) * this.opts.lineHeight
    this.sprite.scale.set((h * this.canvas.width) / this.canvas.height, h, 1)
  }

  set opacity(v: number) {
    ;(this.sprite.material as THREE.SpriteMaterial).opacity = v
  }
}

/** Barra de progreso flotante (acciones de mantener E). */
export class ProgressSprite {
  readonly sprite: THREE.Sprite
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private texture: THREE.CanvasTexture
  private last = -1

  constructor() {
    this.canvas.width = 256
    this.canvas.height = 48
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }))
    this.sprite.renderOrder = 11
    this.sprite.scale.set(1.8, 0.34, 1)
    this.set(0)
  }

  set(p: number) {
    const v = Math.round(Math.min(1, Math.max(0, p)) * 100)
    if (v === this.last) return
    this.last = v
    const ctx = this.ctx
    ctx.clearRect(0, 0, 256, 48)
    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    ctx.roundRect(2, 2, 252, 44, 22)
    ctx.fill()
    ctx.fillStyle = v >= 100 ? '#4ade80' : '#facc15'
    ctx.beginPath()
    ctx.roundRect(8, 8, Math.max(32, 240 * (v / 100)), 32, 16)
    ctx.fill()
    this.texture.needsUpdate = true
  }
}

/** Textura tipo código QR para el escáner. */
export function qrTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 84
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 84, 84)
  ctx.fillStyle = '#0f172a'
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      if (Math.random() > 0.55) ctx.fillRect(x * 4, y * 4, 4, 4)
    }
  }
  for (const [x, y] of [[0, 0], [56, 0], [0, 56]]) {
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(x, y, 28, 28)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x + 4, y + 4, 20, 20)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(x + 8, y + 8, 12, 12)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
