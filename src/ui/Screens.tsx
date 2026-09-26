import { LEVELS } from '../game/levels'
import { fmtTime } from '../game/levels/common'
import type { RunRecord, SaveData } from '../game/save'
import type { LevelId, LevelResult } from '../game/types'

/* ------------------------------------------------------------------ */
/* Menú inicial                                                        */
/* ------------------------------------------------------------------ */

export function Menu(props: { save: SaveData; onPlay: () => void; onHelp: () => void; onRecords: () => void; onToggleSound: () => void; onToggleMusic: () => void; onToggleZombies: () => void }) {
  const { save } = props
  return (
    <div className="screen menu">
      <div className="floaties" aria-hidden>
        {['⚙️', '💾', '📦', '🖥️', '🔋', '🛰️','🧟‍♀️ ' ,'📱', '🔧'].map((e, i) => (
          <span key={e} style={{ left: `${8 + i * 11.5}%`, animationDelay: `${i * -1.7}s` }}>
            {e}
          </span>
        ))}
      </div>
      <div className="menu-box">
        <div className="logo-gear">🏭</div>
        <h1 className="title">
          PRODUCTION
          <br />
          <span>GAME</span>
        </h1>
        <p className="subtitle">Tech Factory · Simulador de tipos de producción</p>
        <div className="menu-buttons">
          <button className="btn primary big" onClick={props.onPlay} autoFocus>
            ▶ Jugar
          </button>
          <button className="btn big" onClick={props.onHelp}>
            ▶ Instrucciones
          </button>
          <button className="btn" onClick={props.onRecords}>
            📊 Récords y datos
          </button>
          <div className="toggles">
            <button className="btn ghost small" onClick={props.onToggleMusic}>
              {save.musicMuted ? '🎵 Música: no' : '🎵 Música: sí'}
            </button>
            <button className="btn ghost small" onClick={props.onToggleSound}>
              {save.muted ? '🔇 Efectos: no' : '🔊 Efectos: sí'}
            </button>
          </div>
          <button className={`btn small ${save.zombies ? 'zombie-on' : 'ghost'}`} onClick={props.onToggleZombies}>
            {save.zombies ? '🧟 Modo zombis: ACTIVADO' : '🧟 Modo zombis: apagado'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Instrucciones                                                       */
/* ------------------------------------------------------------------ */

export function Instructions({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen scroll">
      <div className="page">
        <header className="page-head">
          <button className="btn ghost" onClick={onBack}>
            ← Menú
          </button>
          <h2>📖 Instrucciones</h2>
        </header>

        <section className="card">
          <h3>🎯 Objetivo</h3>
          <p>
            Administras <b>Tech Factory</b>, una pequeña fábrica de tecnología. Debes cumplir pedidos usando los cuatro
            sistemas de producción: <b>producir correctamente → entregar → recibir dinero</b>, evitando desperdicios y
            retrasos.
          </p>
          <p>
            <b>Condición de victoria:</b> supera los 4 niveles alcanzando el puntaje mínimo de cada uno.
          </p>
        </section>

        <section className="card">
          <h3>🕹️ Controles</h3>
          <div className="keys big">
            <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas: moverse</span>
            <span><kbd>E</kbd> o <kbd>Espacio</kbd>: tomar, dejar, usar</span>
            <span>Mantener <kbd>E</kbd>: ensamblar o reparar</span>
            <span><kbd>B</kbd>: tienda (robots, máquinas y armas)</span>
            <span><kbd>Esc</kbd>: pausa</span>
          </div>
          <p>Solo puedes llevar un objeto a la vez. Usa las mesas para dejar cosas y la caneca para desechar.</p>
          <p>
            💡 <b>¿No sabes qué hacer?</b> Sigue la <b>flecha amarilla</b> que flota sobre la fábrica y lee el mensaje
            "Siguiente paso" en la parte de abajo de la pantalla.
          </p>
        </section>

        <section className="card">
          <h3>🧟 Zombis y armas</h3>
          <p>
            Mientras produces llegan oleadas de zombis (la primera a los 20 segundos). Cada zombi quiere una de estas cosas:
          </p>
          <ul className="bullets">
            <li><b>Atacarte:</b> te quita vida ❤️. Si llegas a 0 te derriban: pierdes lo que llevabas y $50.</li>
            <li><b>Dañar una máquina:</b> la máquina se detiene y echa humo. Mantén <kbd>E</kbd> junto a ella para repararla.</li>
            <li><b>Robar materiales:</b> se lleva piezas de una estantería o mesa. ¡Dispárale antes de que escape o será desperdicio!</li>
          </ul>
          <div className="keys big">
            <span>🖱️ Mueve el mouse para <b>apuntar</b></span>
            <span><b>Clic</b>: un disparo</span>
            <span><b>Mantener clic</b>: ráfaga continua</span>
            <span><kbd>1</kbd> Pistola (∞) · <kbd>2</kbd> Subfusil · <kbd>3</kbd> Escopeta</span>
          </div>
          <p>Cada zombi derrotado te da dinero. Si prefieres jugar solo la parte de producción, apaga el modo zombis en el menú.</p>
        </section>

        <section className="card">
          <h3>🛒 Tienda (tecla B)</h3>
          <div className="resource-grid">
            <div><span>🔫</span><b>Armas</b><small>Subfusil, escopeta y su munición.</small></div>
            <div><span>🗼</span><b>Torreta robot</b><small>Se instala donde estás y dispara sola.</small></div>
            <div><span>🛡️</span><b>Robot guardián</b><small>Te sigue y te protege.</small></div>
            <div><span>🔧</span><b>Robot reparador</b><small>Arregla solo las máquinas dañadas.</small></div>
            <div><span>🏭</span><b>Máquinas del nivel</b><small>Dron de carga, ensambladora turbo, cambio rápido, robot abastecedor, brazo de ensamble…</small></div>
          </div>
          <p>El juego se pausa mientras compras. Lo que compras dura el nivel actual: piensa si la inversión vale la pena.</p>
        </section>

        <section className="card">
          <h3>📦 Recursos</h3>
          <div className="resource-grid">
            <div><span>💰</span><b>Dinero</b><small>Compras materia prima y cobras al entregar.</small></div>
            <div><span>👷</span><b>Personal</b><small>Tú y los técnicos que contrates.</small></div>
            <div><span>⚙️</span><b>Máquinas</b><small>Ensambladoras, líneas, robots y escáneres.</small></div>
            <div><span>⏱️</span><b>Tiempo</b><small>Fechas límite y duración de cada nivel.</small></div>
            <div><span>📦</span><b>Materia prima</b><small>Piezas, kits y obleas de silicio.</small></div>
          </div>
        </section>

        <section className="card">
          <h3>⭐ Puntuación</h3>
          <div className="score-table">
            <span className="good">+10</span><span>Producto o etapa correcta</span>
            <span className="good">+20</span><span>Pedido entregado a tiempo</span>
            <span className="bad">−10</span><span>Desperdicio (desechar, producir de más, derramar)</span>
            <span className="bad">−20</span><span>Pedido o producto incorrecto</span>
            <span className="bad">−30</span><span>Retraso (pasar la fecha límite)</span>
            <span className="bad">−10</span><span>La línea se detiene (sin materia prima o por avería)</span>
          </div>
          <p>Si te quedas sin dinero no puedes comprar materiales. ¡No uses más recursos de los necesarios!</p>
        </section>

        <section className="card">
          <h3>🏭 Los cuatro niveles</h3>
          <div className="level-explain wide">
            {LEVELS.map((l) => (
              <div key={l.id} style={{ '--accent': l.color } as React.CSSProperties}>
                <h4>
                  {l.emoji} Nivel {l.id} · {l.type}
                </h4>
                <p>{l.concept}</p>
                <div className="flow small">
                  {l.flow.map((f, i) => (
                    <span key={f + i}>
                      {i > 0 && <i>→</i>}
                      <b>{f}</b>
                    </span>
                  ))}
                </div>
                <ol className="intro-steps">
                  {l.steps.map((st) => (
                    <li key={st}>{st}</li>
                  ))}
                </ol>
                <p className="muted">🤖 {l.digital}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>🤖 Procesos digitales incorporados</h3>
          <ul className="bullets">
            <li><b>Sensor + alerta automática:</b> la tolva avisa cuando queda poca materia prima (nivel 3).</li>
            <li><b>Robot y automatización:</b> un brazo robótico puede abastecer la línea solo (nivel 3).</li>
            <li><b>Código QR:</b> cada PC se verifica con un escáner antes de entregarlo (nivel 4).</li>
            <li><b>Sistema de pedidos:</b> los clientes envían pedidos personalizados con tiempo límite (nivel 4).</li>
            <li><b>Dashboard de producción:</b> indicadores en vivo en todos los niveles.</li>
            <li><b>Base de datos local:</b> el progreso y los récords se guardan en el navegador (localStorage).</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Selección de nivel                                                  */
/* ------------------------------------------------------------------ */

export function LevelSelect(props: { save: SaveData; money: number; onPick: (id: LevelId) => void; onBack: () => void; onNewRun: () => void }) {
  const { save } = props
  return (
    <div className="screen scroll">
      <div className="page">
        <header className="page-head">
          <button className="btn ghost" onClick={props.onBack}>
            ← Menú
          </button>
          <h2>🏭 Elige un nivel</h2>
          <div className="pill money">💰 ${props.money}</div>
        </header>
        <div className="level-grid">
          {LEVELS.map((l) => {
            const locked = l.id > save.unlocked
            const result = save.results[l.id]
            return (
              <button
                key={l.id}
                className={`level-card ${locked ? 'locked' : ''} ${result?.passed ? 'passed' : ''}`}
                style={{ '--accent': l.color } as React.CSSProperties}
                disabled={locked}
                onClick={() => props.onPick(l.id)}
              >
                <div className="level-num">Nivel {l.id}</div>
                <div className="level-emoji">{locked ? '🔒' : l.emoji}</div>
                <b>{l.type}</b>
                <small>{l.title}</small>
                <div className="level-foot">
                  {result?.passed ? (
                    <span>✅ {result.score} pts</span>
                  ) : locked ? (
                    <span>Supera el nivel {l.id - 1}</span>
                  ) : (
                    <span>🎯 Mínimo {l.minScore} pts</span>
                  )}
                  {save.best[l.id] !== undefined && <span className="muted">Récord: {save.best[l.id]}</span>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="row center">
          <button
            className="btn ghost small"
            onClick={() => {
              if (confirm('¿Empezar una partida nueva? Se reinicia el dinero y los niveles (los récords se conservan).')) props.onNewRun()
            }}
          >
            ↻ Nueva partida
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Resultado de nivel                                                  */
/* ------------------------------------------------------------------ */

export function LevelResultView(props: { result: LevelResult; allDone: boolean; onNext: () => void; onRetry: () => void; onMenu: () => void; onFinal: () => void }) {
  const r = props.result
  const info = LEVELS[r.levelId - 1]
  const s = r.stats
  return (
    <div className="screen center-screen">
      <div className="card result" style={{ '--accent': info.color } as React.CSSProperties}>
        <div className="result-emoji">{r.passed ? '🎉' : '😓'}</div>
        <h2>{r.passed ? '¡Nivel superado!' : r.completed ? 'No alcanzaste el puntaje mínimo' : 'Se acabó el tiempo'}</h2>
        <p className="muted">
          {info.emoji} {info.type}
        </p>
        <div className="big-stats">
          <div>
            <small>Puntuación</small>
            <b>{r.score}</b>
            <small>mínimo {r.minScore}</small>
          </div>
          <div>
            <small>Tiempo</small>
            <b>{fmtTime(r.time)}</b>
          </div>
          <div>
            <small>Dinero</small>
            <b className={r.moneyDelta >= 0 ? 'good' : 'bad'}>
              {r.moneyDelta >= 0 ? '+' : '−'}${Math.abs(r.moneyDelta)}
            </b>
          </div>
        </div>
        <div className="chips">
          <span className="good">✅ Correctos: {s.correct}</span>
          <span className={s.waste ? 'bad' : ''}>🗑 Desperdicios: {s.waste}</span>
          <span className={s.wrong ? 'bad' : ''}>❌ Incorrectos: {s.wrong}</span>
          <span className={s.late ? 'bad' : ''}>⏰ Retrasos: {s.late}</span>
          {r.levelId === 3 && <span className={s.stops ? 'bad' : ''}>⛔ Paradas: {s.stops}</span>}
          <span>📦 Materiales: {s.materials}</span>
        </div>
        <div className="summary">
          {r.summary.map((m) => (
            <div key={m.label} className="metric">
              <span>{m.label}</span>
              <b className={m.tone ?? ''}>{m.value}</b>
            </div>
          ))}
        </div>
        {!r.passed && <p className="muted">El dinero de este intento no se guarda. ¡Inténtalo otra vez!</p>}
        <div className="row">
          <button className="btn ghost" onClick={props.onMenu}>
            Niveles
          </button>
          <button className="btn" onClick={props.onRetry}>
            ↻ Reintentar
          </button>
          {r.passed && props.allDone && (
            <button className="btn primary big" onClick={props.onFinal} autoFocus>
              🏆 Ver resultado final
            </button>
          )}
          {r.passed && !props.allDone && r.levelId < 4 && (
            <button className="btn primary big" onClick={props.onNext} autoFocus>
              Siguiente nivel ▶
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pantalla final                                                      */
/* ------------------------------------------------------------------ */

export function FinalScreen(props: { run: RunRecord; save: SaveData; onMenu: () => void; onNewRun: () => void }) {
  const { run, save } = props
  const best = LEVELS[run.bestLevel - 1]
  return (
    <div className="screen center-screen final">
      <div className="confetti" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * -0.6}s`, background: ['#facc15', '#60a5fa', '#f472b6', '#4ade80'][i % 4] }} />
        ))}
      </div>
      <div className="card result">
        <div className="result-emoji">🏆</div>
        <h1 className="final-title">Producción completada</h1>
        <div className="big-stats">
          <div>
            <small>Puntuación</small>
            <b>{run.score} puntos</b>
          </div>
          <div>
            <small>Tiempo</small>
            <b>{fmtTime(run.time)}</b>
          </div>
          <div>
            <small>Dinero final</small>
            <b className="good">${save.money}</b>
          </div>
        </div>
        <p className="best-level">
          Nivel con mejor desempeño:{' '}
          <b style={{ color: best.color }}>
            {best.emoji} {best.type}
          </b>
        </p>
        <div className="summary">
          {LEVELS.map((l) => {
            const r = save.results[l.id]
            return (
              <div key={l.id} className="metric">
                <span>
                  {l.emoji} {l.type}
                </span>
                <b>
                  {r?.score ?? 0} pts · {fmtTime(r?.time ?? 0)}
                </b>
              </div>
            )
          })}
        </div>
        <div className="row">
          <button className="btn ghost" onClick={props.onMenu}>
            Menú
          </button>
          <button className="btn primary big" onClick={props.onNewRun}>
            ↻ Jugar de nuevo
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Récords (datos guardados en localStorage)                           */
/* ------------------------------------------------------------------ */

export function Records(props: { save: SaveData; onBack: () => void; onClear: () => void }) {
  const { save } = props
  const top = [...save.runs].sort((a, b) => b.score - a.score)
  return (
    <div className="screen scroll">
      <div className="page">
        <header className="page-head">
          <button className="btn ghost" onClick={props.onBack}>
            ← Menú
          </button>
          <h2>📊 Récords y datos</h2>
        </header>
        <section className="card">
          <div className="big-stats">
            <div>
              <small>Partidas completadas</small>
              <b>{save.runs.length}</b>
            </div>
            <div>
              <small>Mejor puntaje</small>
              <b>{top[0]?.score ?? '—'}</b>
            </div>
            <div>
              <small>Niveles jugados</small>
              <b>{save.plays}</b>
            </div>
          </div>
        </section>
        <section className="card">
          <h3>🏅 Mejor puntaje por nivel</h3>
          <div className="summary">
            {LEVELS.map((l) => (
              <div key={l.id} className="metric">
                <span>
                  {l.emoji} {l.type}
                </span>
                <b>{save.best[l.id] ?? '—'}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>📜 Historial de partidas</h3>
          {top.length === 0 ? (
            <p className="muted">Aún no has completado una partida. ¡Supera los 4 niveles!</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Puntaje</th>
                  <th>Tiempo</th>
                  <th>Mejor nivel</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.date}>
                    <td>{new Date(r.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{r.score}</td>
                    <td>{fmtTime(r.time)}</td>
                    <td>{LEVELS[r.bestLevel - 1].type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <p className="muted center-text">Todos los datos se guardan solo en este navegador (localStorage). Nada se envía a un servidor.</p>
        <div className="row center">
          <button
            className="btn ghost small danger"
            onClick={() => {
              if (confirm('¿Borrar todos los datos guardados?')) props.onClear()
            }}
          >
            🗑 Borrar todos los datos
          </button>
        </div>
      </div>
    </div>
  )
}
