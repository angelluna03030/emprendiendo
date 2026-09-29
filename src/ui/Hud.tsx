import { LEVELS } from '../game/levels'
import { fmtTime } from '../game/levels/common'
import type { HudState } from '../game/types'

interface Props {
  hud: HudState
  onPause: () => void
  onShop: () => void
  onWeapon: (id: string) => void
  onView: () => void
}

const VIEW_LABEL = { top: '🎥 Arriba', third: '🎥 3ª persona', first: '🎥 1ª persona' } as const

export function Hud({ hud, onPause, onShop, onWeapon, onView }: Props) {
  const info = LEVELS[hud.levelId - 1]
  const limit = hud.deadline ?? hud.duration
  const left = limit !== null ? limit - hud.elapsed : null
  const overdue = left !== null && left < 0 && hud.deadline !== null
  const z = hud.zombies
  const hurt = hud.elapsed - hud.hurtAt < 0.35

  return (
    <div className={`hud ${hud.view !== 'top' ? 'person' : ''}`}>
      {hud.view !== 'top' && <div className={`crosshair ${hud.locked ? '' : 'dim'}`} />}
      {hud.view !== 'top' && !hud.locked && hud.started && !hud.ended && (
        <div className="lock-hint">🖱️ Haz clic en el juego para mover la cámara con el mouse · <kbd>V</kbd> cambia la vista</div>
      )}
      {hurt && <div className="hurt-flash" />}
      {hud.knocked > 0 && (
        <div className="knocked">
          😵 ¡Te derribaron!
          <small>Te levantas en {Math.ceil(hud.knocked)} s</small>
        </div>
      )}
      {/* Arriba a la izquierda: nivel y objetivos */}
      <div className="hud-panel hud-level" style={{ '--accent': info.color } as React.CSSProperties}>
        <div className="hud-level-head">
          <span className="hud-emoji">{info.emoji}</span>
          <div>
            <small>Nivel {info.id}</small>
            <b>{info.type}</b>
          </div>
        </div>
        <ul className="objectives">
          {hud.objectives.map((o) => (
            <li key={o.text} className={o.done ? 'done' : ''}>
              <span>{o.done ? '✅' : '⬜'}</span> {o.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Arriba al centro: reloj y alertas */}
      <div className="hud-top">
        <div className={`timer ${overdue ? 'late' : left !== null && left < 20 ? 'warn' : ''}`}>
          ⏱ {left === null ? fmtTime(hud.elapsed) : overdue ? `+${fmtTime(-left)} tarde` : fmtTime(left)}
        </div>
        {z.enabled && (
          <div className={`wave ${z.alive > 0 ? 'active' : ''}`}>
            {z.alive > 0 ? `🧟 Oleada ${z.wave}: quedan ${z.alive}` : `🧟 Próxima oleada en ${Math.ceil(z.nextWave)} s`} · 💀 {z.kills}
          </div>
        )}
        {z.bosses.map((b, i) => (
          <div key={i} className="boss">
            <b>👑 Jefe zombi {i + 1}</b>
            <div className="boss-bar">
              <i style={{ width: `${(b.hp / b.max) * 100}%` }} />
            </div>
          </div>
        ))}
        {hud.alerts.map((a) => (
          <div key={a} className="alert">
            {a}
          </div>
        ))}
      </div>

      {/* Arriba a la derecha: puntaje, dinero, recursos, dashboard */}
      <div className="hud-right">
        <div className="hud-stats">
          <div className="pill score">⭐ {hud.score}</div>
          <div className="pill money">💰 ${hud.money}</div>
          <button className="pill view-btn" onClick={onView} title="Cambiar vista (V)">
            {VIEW_LABEL[hud.view]}
          </button>
          <button className="pill pause-btn" onClick={onPause} title="Pausa (Esc)">
            ⏸
          </button>
        </div>
        {z.enabled && (
          <div className="hp">
            <span>❤️</span>
            <div className="hp-bar">
              <i style={{ width: `${hud.hp}%` }} className={hud.hp < 35 ? 'low' : ''} />
            </div>
            <b>{hud.hp}</b>
          </div>
        )}
        {hud.team.length > 1 && (
          <div className="hud-panel team">
            {hud.team.map((t) => (
              <div key={t.name + t.color} className={`mate ${t.me ? 'me' : ''}`}>
                <span className="dot" style={{ background: `#${t.color.toString(16).padStart(6, '0')}` }} />
                <b>{t.name}</b>
                <span className="mate-hp">{t.knocked ? '😵' : `❤️ ${t.hp}`}</span>
              </div>
            ))}
          </div>
        )}
        <div className="hud-panel resources">
          <span title="Personal">👷 {hud.resources.personal}</span>
          <span title="Máquinas">⚙️ {hud.resources.maquinas}</span>
          <span title="Materia prima">📦 {hud.resources.materia}</span>
        </div>

        {hud.orders.length > 0 && (
          <div className="orders">
            {hud.orders.map((o) => (
              <div key={o.id} className={`order ${o.state}`}>
                <div className="order-head">
                  <b>🧑 #{o.id} {o.client}</b>
                  <span>{o.state === 'done' ? '✅' : o.timeLeft > 0 ? fmtTime(o.timeLeft) : '⚠ tarde'}</span>
                </div>
                {o.lines.map((l) => (
                  <div key={l.text} className={`order-line ${l.have >= l.need ? 'ok' : ''}`}>
                    <span>🖥 {l.text}</span>
                    <b>
                      {l.have}/{l.need}
                    </b>
                  </div>
                ))}
                {o.state !== 'done' && (
                  <div className="order-bar">
                    <i style={{ width: `${Math.max(0, Math.min(100, (o.timeLeft / o.limit) * 100))}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="hud-panel dashboard">
          <div className="dash-title">📊 Dashboard de producción</div>
          {hud.metrics.map((m) => (
            <div key={m.label} className="metric">
              <span>{m.label}</span>
              <b className={m.tone ?? ''}>{m.value}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Abajo: acción disponible y lo que llevas */}
      <div className="hud-bottom">
        {hud.hint && <div className="hint">💡 {hud.hint}</div>}
        {hud.held && <div className="held">✋ Llevas: {hud.held}</div>}
        {hud.prompt && (
          <div className={`prompt ${hud.prompt.kind}`}>
            {hud.prompt.kind === 'tap' && <kbd>E</kbd>}
            {hud.prompt.kind === 'hold' && <kbd className="hold">Mantén E</kbd>}
            <span>{hud.prompt.text}</span>
          </div>
        )}
      </div>

      <div className="upgrades">
        {hud.weapons.filter((w) => w.owned).map((w) => (
          <button key={w.id} className={`weapon ${w.active ? 'active' : ''}`} onClick={() => onWeapon(w.id)}>
            <kbd>{w.key}</kbd>
            <span>
              <b>{w.name}</b>
              <small>{w.ammo === null ? '∞ balas' : `${w.ammo} balas`}</small>
            </span>
          </button>
        ))}
        <button className="upgrade shop-btn" onClick={onShop}>
          <kbd>B</kbd>
          <span>
            <b>🛒 Tienda</b>
            <small>Robots, máquinas{z.enabled ? ' y armas' : ''}</small>
          </span>
        </button>
      </div>

      <div className="toasts">
        {hud.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
