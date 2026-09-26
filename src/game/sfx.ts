/** Efectos de sonido sintetizados con WebAudio (sin archivos externos). */

export type SfxName = 'pick' | 'drop' | 'good' | 'bad' | 'error' | 'done' | 'cash' | 'alarm' | 'win' | 'click' | 'shot' | 'shotgun' | 'hit' | 'hurt' | 'groan' | 'kill'

// [frecuencia Hz, duración s, forma de onda, retraso s]
type Note = [number, number, OscillatorType, number]

const SOUNDS: Record<SfxName, Note[]> = {
  pick: [[520, 0.07, 'triangle', 0], [780, 0.08, 'triangle', 0.05]],
  drop: [[420, 0.08, 'triangle', 0], [300, 0.1, 'triangle', 0.05]],
  good: [[660, 0.09, 'square', 0], [880, 0.12, 'square', 0.08]],
  bad: [[240, 0.14, 'sawtooth', 0], [180, 0.2, 'sawtooth', 0.1]],
  error: [[200, 0.12, 'square', 0], [200, 0.12, 'square', 0.15]],
  done: [[520, 0.08, 'triangle', 0], [660, 0.08, 'triangle', 0.07], [880, 0.14, 'triangle', 0.14]],
  cash: [[1200, 0.06, 'square', 0], [1600, 0.12, 'square', 0.06]],
  alarm: [[880, 0.15, 'square', 0], [660, 0.15, 'square', 0.18], [880, 0.15, 'square', 0.36]],
  win: [[523, 0.12, 'triangle', 0], [659, 0.12, 'triangle', 0.12], [784, 0.12, 'triangle', 0.24], [1047, 0.3, 'triangle', 0.36]],
  click: [[700, 0.05, 'triangle', 0]],
  shot: [[900, 0.04, 'square', 0], [300, 0.05, 'square', 0.02]],
  shotgun: [[160, 0.12, 'sawtooth', 0], [90, 0.15, 'sawtooth', 0.03]],
  hit: [[420, 0.04, 'square', 0]],
  hurt: [[220, 0.1, 'sawtooth', 0], [150, 0.14, 'sawtooth', 0.06]],
  groan: [[95, 0.35, 'sawtooth', 0], [80, 0.35, 'sawtooth', 0.2]],
  kill: [[300, 0.06, 'square', 0], [150, 0.12, 'square', 0.05]],
}

let ctx: AudioContext | null = null
let muted = false

export function setMuted(value: boolean) {
  muted = value
}

export function play(name: SfxName) {
  if (muted) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    for (const [freq, dur, type, delay] of SOUNDS[name]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      const t = now + delay
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    }
  } catch {
    // Audio no disponible: se ignora.
  }
}
