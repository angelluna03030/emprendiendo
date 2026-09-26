import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Game } from '../game/Game'
import { LEVELS } from '../game/levels'
import type { HudState, LevelId, LevelResult, ShopCategory } from '../game/types'
import { Hud } from './Hud'

interface Props {
  levelId: LevelId
  money: number
  zombies: boolean
  musicOn: boolean
  onToggleMusic: () => void
  onEnd: (result: LevelResult) => void
  onExit: () => void
}

const CATEGORY: Record<ShopCategory, string> = {
  arma: '🔫 Armas y munición',
  defensa: '🛡️ Defensa',
  fabrica: '🏭 Robots y máquinas de la fábrica',
}

export function GameView({ levelId, money, zombies, musicOn, onToggleMusic, onEnd, onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<HudState | null>(null)
  const [started, setStarted] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const info = LEVELS[levelId - 1]

  const handleEnd = useEffectEvent((result: LevelResult) => onEnd(result))

  useEffect(() => {
    const game = new Game(mountRef.current!, levelId, money, { onHud: setHud, onEnd: (r) => handleEnd(r) }, { zombies })
    gameRef.current = game
    if (import.meta.env.DEV) Object.assign(window, { __game: game })
    return () => {
      game.dispose()
      gameRef.current = null
    }
  }, [levelId, money, zombies, attempt])

  const start = () => {
    setStarted(true)
    gameRef.current?.start()
  }

  const restart = () => {
    setStarted(false)
    setHud(null)
    setAttempt((a) => a + 1)
  }

  const game = () => gameRef.current

  return (
    <div className="game">
      <div ref={mountRef} className={`game-canvas ${zombies ? 'aim' : ''}`} />
      {hud && started && (
        <Hud
          hud={hud}
          onPause={() => game()?.setPaused(true)}
          onShop={() => game()?.setShop(true)}
          onWeapon={(id) => game()?.selectWeapon(id)}
        />
      )}

      {!started && (
        <div className="overlay">
          <div className="card intro" style={{ '--accent': info.color } as React.CSSProperties}>
            <div className="intro-badge">Nivel {info.id} de 4</div>
            <div className="intro-emoji">{info.emoji}</div>
            <h2>{info.type}</h2>
            <p className="intro-title">{info.title}</p>
            <p className="intro-concept">{info.concept}</p>
            <div className="flow">
              {info.flow.map((f, i) => (
                <span key={f}>
                  {i > 0 && <i>→</i>}
                  <b>{f}</b>
                </span>
              ))}
            </div>
            <ol className="intro-steps">
              {info.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="intro-tip">💡 Sigue la <b>flecha amarilla</b>: siempre te muestra a dónde ir y qué hacer.</p>
            <p className="intro-digital">
              <b>🤖 Tecnología digital:</b> {info.digital}
            </p>
            <div className="intro-meta">
              <span>🎯 Puntaje mínimo: {info.minScore}</span>
              <span>💰 Dinero: ${money}</span>
            </div>
            <div className="keys">
              <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> moverse</span>
              <span><kbd>E</kbd> usar · mantener para trabajar</span>
              <span><kbd>B</kbd> tienda</span>
              {zombies && <span>🖱️ apuntar · clic disparar · mantener = ráfaga</span>}
              {zombies && <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> armas</span>}
              <span><kbd>Esc</kbd> pausa</span>
            </div>
            {zombies && <p className="intro-zombie">🧟 ¡Cuidado! A los 20 s llegan zombis: te atacan, dañan máquinas y roban materiales.</p>}
            <div className="row">
              <button className="btn ghost" onClick={onExit}>← Volver</button>
              <button className="btn primary big" onClick={start} autoFocus>¡A producir! ▶</button>
            </div>
          </div>
        </div>
      )}

      {hud?.shopOpen && (
        <div className="overlay" onClick={() => game()?.setShop(false)}>
          <div className="card shop" onClick={(e) => e.stopPropagation()}>
            <div className="shop-head">
              <h2>🛒 Tienda</h2>
              <div className="pill money">💰 ${hud.money}</div>
            </div>
            <p className="muted">El juego está en pausa mientras compras. Lo que compras sirve durante este nivel.</p>
            {(Object.keys(CATEGORY) as ShopCategory[]).map((cat) => {
              const items = hud.upgrades.filter((u) => u.category === cat)
              if (!items.length) return null
              return (
                <section key={cat}>
                  <h3>{CATEGORY[cat]}</h3>
                  <div className="shop-grid">
                    {items.map((u) => (
                      <button
                        key={u.id}
                        className={`shop-item ${u.owned ? 'owned' : ''}`}
                        disabled={u.owned || hud.money < u.cost}
                        onClick={() => game()?.buy(u.id)}
                      >
                        <b>{u.label}</b>
                        <small>{u.desc}</small>
                        <span className="price">{u.owned ? (u.repeatable ? 'Máximo' : 'Comprado ✓') : `$${u.cost}`}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
            <div className="row">
              <button className="btn primary big" onClick={() => game()?.setShop(false)} autoFocus>
                Volver al juego (B)
              </button>
            </div>
          </div>
        </div>
      )}

      {hud?.paused && (
        <div className="overlay">
          <div className="card pause">
            <h2>⏸ Pausa</h2>
            <button className="btn primary big" onClick={() => game()?.setPaused(false)} autoFocus>
              Continuar
            </button>
            <button className="btn" onClick={onToggleMusic}>{musicOn ? '🎵 Música: sí' : '🎵 Música: no'}</button>
            <button className="btn" onClick={restart}>↻ Reiniciar nivel</button>
            <button className="btn ghost" onClick={onExit}>Salir al menú</button>
          </div>
        </div>
      )}
    </div>
  )
}
