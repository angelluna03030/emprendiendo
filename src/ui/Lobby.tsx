import { useState } from 'react'
import { LEVELS } from '../game/levels'
import type { LevelId } from '../game/types'
import { isLocalOnly, MAX_PLAYERS, roomLink, type Session } from '../net/session'

interface Props {
  session: Session | null
  /** Código de sala del link (invitado que aún no se une). */
  joinCode: string | null
  name: string
  unlocked: number
  busy: boolean
  error: string
  onName: (name: string) => void
  onCreate: () => void
  onJoin: () => void
  onStart: (level: LevelId) => void
  onLeave: () => void
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

export function Lobby(props: Props) {
  const { session, joinCode } = props
  const [copied, setCopied] = useState(false)
  const [level, setLevel] = useState<LevelId>(1)
  const error = props.error || (session?.status === 'closed' ? session.error : '')

  const copy = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(roomLink(session.code))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="screen scroll">
      <div className="page lobby">
        <header className="page-head">
          <button className="btn ghost" onClick={props.onLeave}>
            ← Salir
          </button>
          <h2>👥 Jugar en equipo</h2>
        </header>

        {error && <div className="card lobby-error">⚠️ {error}</div>}

        {!session || session.status === 'closed' ? (
          <section className="card">
            <h3>{joinCode ? `Te invitaron a la sala ${joinCode}` : 'Crea una sala y comparte el link'}</h3>
            <p className="muted">
              Hasta {MAX_PLAYERS} jugadores en la misma fábrica. El dinero y el puntaje son del equipo, y con más jugadores llegan
              más zombis y hay que producir más.
            </p>
            <label className="field">
              <span>Tu nombre</span>
              <input value={props.name} maxLength={14} placeholder="Ej: Angel" onChange={(e) => props.onName(e.target.value)} autoFocus />
            </label>
            <div className="row">
              {joinCode ? (
                <button className="btn primary big" disabled={props.busy || !props.name.trim()} onClick={props.onJoin}>
                  {props.busy ? 'Conectando…' : 'Unirme a la sala ▶'}
                </button>
              ) : (
                <button className="btn primary big" disabled={props.busy || !props.name.trim()} onClick={props.onCreate}>
                  {props.busy ? 'Creando sala…' : 'Crear sala ▶'}
                </button>
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="card">
              <h3>
                Sala <span className="code">{session.code}</span>
              </h3>
              {session.isHost ? (
                <>
                  {isLocalOnly() && (
                    <div className="lobby-warn">
                      ⚠️ Este link empieza con <b>localhost</b>: solo funciona en <b>este computador</b>. Para jugar con otras
                      personas abre el juego desde su dirección publicada (por ejemplo el link de Vercel) y crea la sala desde ahí.
                    </div>
                  )}
                  <p>Envía este link a tus amigos para que entren:</p>
                  <div className="link-row">
                    <input readOnly value={roomLink(session.code)} onFocus={(e) => e.target.select()} />
                    <button className="btn" onClick={copy}>
                      {copied ? '✓ Copiado' : '📋 Copiar'}
                    </button>
                  </div>
                  <p className="muted small-note">
                    💡 Deja esta pestaña abierta y visible mientras tus amigos entran y durante la partida (en el celular, no
                    cambies de app). Si alguien no logra conectarse, prueben con otra red, por ejemplo datos móviles.
                  </p>
                </>
              ) : (
                <p className="muted">
                  Estás conectado ({session.via === 'directa' ? '⚡ conexión directa' : '🛰️ por servidor de relevo'}). El anfitrión elige el
                  nivel y empieza la partida.
                </p>
              )}
            </section>

            <section className="card">
              <h3>
                Jugadores ({session.players.length}/{MAX_PLAYERS})
              </h3>
              <div className="players">
                {session.players.map((p, i) => (
                  <div key={p.id} className="player-chip" style={{ '--pc': hex(p.color) } as React.CSSProperties}>
                    <span className="dot" />
                    <b>{p.name}</b>
                    {i === 0 && <small>👑 Anfitrión</small>}
                    {p.id === session.meId && <small>(tú)</small>}
                  </div>
                ))}
                {Array.from({ length: MAX_PLAYERS - session.players.length }, (_, i) => (
                  <div key={i} className="player-chip empty">
                    Esperando jugador…
                  </div>
                ))}
              </div>
            </section>

            {session.isHost ? (
              <section className="card">
                <h3>Elige el nivel</h3>
                <div className="level-pick">
                  {LEVELS.map((l) => (
                    <button
                      key={l.id}
                      className={`level-mini ${level === l.id ? 'active' : ''}`}
                      style={{ '--accent': l.color } as React.CSSProperties}
                      disabled={l.id > props.unlocked}
                      onClick={() => setLevel(l.id)}
                    >
                      <span>{l.id > props.unlocked ? '🔒' : l.emoji}</span>
                      <b>Nivel {l.id}</b>
                      <small>{l.type}</small>
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button className="btn primary big" onClick={() => props.onStart(level)}>
                    ▶ Empezar con {session.players.length} {session.players.length === 1 ? 'jugador' : 'jugadores'}
                  </button>
                </div>
              </section>
            ) : (
              <section className="card waiting">⏳ Esperando que el anfitrión empiece la partida…</section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
