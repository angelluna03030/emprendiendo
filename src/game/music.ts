import musicUrl from '../assets/sonido.mp3'

/** Música de fondo (src/assets/sonido.mp3) en bucle. */

let audio: HTMLAudioElement | null = null
let wanted = false

function ensure() {
  if (!audio) {
    audio = new Audio(musicUrl)
    audio.loop = true
    audio.volume = 0.35
  }
  return audio
}

// Los navegadores bloquean el audio hasta que el usuario interactúa:
// se reintenta en el primer clic o tecla.
function retryOnGesture() {
  const retry = () => {
    window.removeEventListener('pointerdown', retry)
    window.removeEventListener('keydown', retry)
    if (wanted) void ensure().play().catch(() => {})
  }
  window.addEventListener('pointerdown', retry)
  window.addEventListener('keydown', retry)
}

export function setMusic(on: boolean) {
  wanted = on
  const a = ensure()
  if (on) a.play().catch(retryOnGesture)
  else a.pause()
}
