import Peer, { type DataConnection, type PeerOptions } from 'peerjs'
import type { LevelId } from '../game/types'

/**
 * Sala cooperativa con PeerJS (conexión directa entre navegadores).
 * El anfitrión simula la partida; los invitados envían sus controles
 * y reciben el estado del juego. Máximo 3 jugadores.
 */

export const MAX_PLAYERS = 3
export const PLAYER_COLORS = [0x3b82f6, 0xef4444, 0x22c55e]
const PREFIX = 'prodgame-tf-'

export interface PlayerInfo {
  id: string
  name: string
  color: number
}

export interface StartInfo {
  level: LevelId
  money: number
  zombies: boolean
  players: PlayerInfo[]
  key: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NetMsg = { t: string; [k: string]: any }

type GameHandler = (from: string, msg: NetMsg) => void

/**
 * Servidores para atravesar routers y firewalls.
 * STUN descubre la dirección pública; TURN retransmite los datos cuando la
 * conexión directa está bloqueada (datos móviles, redes de colegio, etc.).
 * El TURN se configura con variables de entorno en Vercel (ver README):
 * VITE_TURN_URL (una o varias URLs separadas por coma), VITE_TURN_USERNAME y VITE_TURN_CREDENTIAL.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
  ]
  const env = import.meta.env
  if (env.VITE_TURN_URL) {
    servers.push({
      urls: String(env.VITE_TURN_URL).split(',').map((u) => u.trim()),
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    })
  }
  return servers
}

const PEER_OPTIONS: PeerOptions = { config: { iceServers: iceServers() }, debug: 1 }

/** El link solo sirve en este computador si el juego corre en localhost. */
export function isLocalOnly() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function roomLink(code: string) {
  return `${location.origin}${location.pathname}?sala=${code}`
}

export class Session {
  readonly role: 'host' | 'client'
  code = ''
  meId = ''
  players: PlayerInfo[] = []
  status: 'connecting' | 'lobby' | 'closed' = 'connecting'
  error = ''
  inGame = false

  /** React escucha cambios del lobby. */
  onChange: (() => void) | null = null
  /** Invitado: el anfitrión inició un nivel. */
  onStart: ((s: StartInfo) => void) | null = null
  /** Invitado: el anfitrión terminó el nivel (resultado) o volvió al lobby. */
  onEnd: ((msg: NetMsg) => void) | null = null

  private peer: Peer
  private conns = new Map<string, DataConnection>()
  private host: DataConnection | null = null
  private gameHandler: GameHandler | null = null

  private constructor(role: 'host' | 'client', peer: Peer) {
    this.role = role
    this.peer = peer
  }

  /* ---------------------------------------------------------------- */
  /* Crear o unirse                                                    */
  /* ---------------------------------------------------------------- */

  static host(name: string): Promise<Session> {
    return new Promise((resolve, reject) => {
      const code = randomCode()
      const peer = new Peer(PREFIX + code, PEER_OPTIONS)
      const s = new Session('host', peer)
      s.code = code
      peer.on('open', (id) => {
        s.meId = id
        s.players = [{ id, name, color: PLAYER_COLORS[0] }]
        s.status = 'lobby'
        resolve(s)
        s.changed()
      })
      peer.on('connection', (conn) => s.acceptGuest(conn))
      peer.on('error', (err) => {
        if (s.status === 'connecting') reject(new Error(describe(err)))
        else s.fail(describe(err))
      })
      // Si se pierde el contacto con el servidor de salas, reconectar para que la sala siga visible
      peer.on('disconnected', () => {
        if (s.status !== 'closed') setTimeout(() => !peer.destroyed && peer.reconnect(), 1000)
      })
    })
  }

  /**
   * Se une a una sala. Reintenta varias veces porque la sala puede tardar
   * unos segundos en aparecer (o el anfitrión puede estar reconectando).
   */
  static async join(code: string, name: string): Promise<Session> {
    const clean = code.trim().toUpperCase()
    let last: Error = new Error('No se pudo conectar.')
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await Session.tryJoin(clean, name)
      } catch (e) {
        last = e as Error
        // Sala llena o partida en curso: no tiene sentido reintentar
        if ((e as { final?: boolean }).final) break
        await sleep(1500)
      }
    }
    throw last
  }

  private static tryJoin(code: string, name: string): Promise<Session> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PEER_OPTIONS)
      const s = new Session('client', peer)
      s.code = code
      let phase: 'server' | 'connect' | 'hello' = 'server'
      let done = false

      const fail = (message: string, final = false) => {
        if (done) return
        done = true
        clearTimeout(timer)
        peer.destroy()
        reject(Object.assign(new Error(message), { final }))
      }
      const timer = setTimeout(() => {
        if (phase === 'server') fail('No hay conexión con el servidor de salas. Revisa tu internet.')
        else if (phase === 'connect')
          fail(
            'La sala existe, pero tu red no permite conectarse con el anfitrión. Prueben con otra red (por ejemplo datos móviles) o que el anfitrión use otra conexión.',
          )
        else fail('El anfitrión no respondió. Pídele que tenga el juego abierto en el lobby, sin cambiar de pestaña.')
      }, 15000)

      peer.on('open', (id) => {
        s.meId = id
        phase = 'connect'
        const conn = peer.connect(PREFIX + code, { reliable: true })
        s.host = conn
        conn.on('open', () => {
          phase = 'hello'
          conn.send({ t: 'hello', name })
        })
        conn.on('data', (data) => {
          const msg = data as NetMsg
          if (msg.t === 'full' || msg.t === 'busy') {
            fail(msg.t === 'full' ? 'La sala está llena (máximo 3 jugadores).' : 'La partida ya empezó. Espera a que termine el nivel y vuelve a abrir el link.', true)
            return
          }
          if (msg.t === 'lobby' && !done) {
            done = true
            clearTimeout(timer)
            s.status = 'lobby'
            resolve(s)
          }
          s.fromHost(msg)
        })
        conn.on('error', () => {
          if (!done) fail('Falló la conexión con el anfitrión. Intenta otra vez.')
        })
        conn.on('close', () => {
          if (done) s.fail('Se perdió la conexión con el anfitrión (cerró la sala o se desconectó).')
        })
      })
      peer.on('error', (err) => {
        const type = (err as { type?: string }).type
        if (!done) {
          if (type === 'peer-unavailable')
            fail(`No existe la sala ${code}. Verifica que el anfitrión tenga el lobby abierto (sin cerrar ni cambiar de app) y que el link esté completo.`)
          else fail(describe(err))
        } else s.fail(describe(err))
      })
      peer.on('disconnected', () => {
        // Solo afecta al servidor de salas; la conexión con el anfitrión sigue
        if (!done) return
        setTimeout(() => !peer.destroyed && peer.reconnect(), 1000)
      })
    })
  }

  /* ---------------------------------------------------------------- */
  /* Anfitrión                                                         */
  /* ---------------------------------------------------------------- */

  private acceptGuest(conn: DataConnection) {
    conn.on('data', (data) => {
      const msg = data as NetMsg
      if (msg.t === 'hello') {
        if (this.players.length >= MAX_PLAYERS) {
          conn.send({ t: 'full' })
          setTimeout(() => conn.close(), 300)
          return
        }
        if (this.inGame) {
          conn.send({ t: 'busy' })
          setTimeout(() => conn.close(), 300)
          return
        }
        const used = new Set(this.players.map((p) => p.color))
        const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[1]
        this.conns.set(conn.peer, conn)
        this.players.push({ id: conn.peer, name: String(msg.name || 'Jugador').slice(0, 14), color })
        this.broadcastLobby()
        this.changed()
        return
      }
      this.gameHandler?.(conn.peer, msg)
    })
    conn.on('close', () => this.dropGuest(conn.peer))
    conn.on('error', () => this.dropGuest(conn.peer))
  }

  private dropGuest(id: string) {
    if (!this.conns.has(id)) return
    this.conns.delete(id)
    this.players = this.players.filter((p) => p.id !== id)
    this.gameHandler?.(id, { t: 'leave' })
    this.broadcastLobby()
    this.changed()
  }

  private broadcastLobby() {
    this.broadcast({ t: 'lobby', players: this.players })
  }

  broadcast(msg: NetMsg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg)
  }

  /** El anfitrión inicia un nivel para todos. */
  startLevel(info: Omit<StartInfo, 'players' | 'key'>): StartInfo {
    const start: StartInfo = { ...info, players: [...this.players], key: Date.now() }
    this.inGame = true
    this.broadcast({ t: 'start', ...start })
    return start
  }

  endLevel(msg: NetMsg) {
    this.inGame = false
    this.broadcast(msg)
  }

  /* ---------------------------------------------------------------- */
  /* Invitado                                                          */
  /* ---------------------------------------------------------------- */

  private fromHost(msg: NetMsg) {
    switch (msg.t) {
      case 'lobby':
        this.players = msg.players
        this.changed()
        return
      case 'start':
        this.inGame = true
        this.onStart?.(msg as unknown as StartInfo)
        return
      case 'end':
      case 'toLobby':
        this.inGame = false
        this.onEnd?.(msg)
        return
      default:
        this.gameHandler?.('host', msg)
    }
  }

  send(msg: NetMsg) {
    if (this.host?.open) this.host.send(msg)
  }

  /* ---------------------------------------------------------------- */
  /* Común                                                             */
  /* ---------------------------------------------------------------- */

  setGameHandler(h: GameHandler | null) {
    this.gameHandler = h
  }

  get isHost() {
    return this.role === 'host'
  }

  private fail(error: string) {
    if (this.status === 'closed') return
    this.status = 'closed'
    this.error = error
    this.changed()
  }

  private changed() {
    this.onChange?.()
  }

  close() {
    this.status = 'closed'
    this.onChange = null
    this.onStart = null
    this.onEnd = null
    this.gameHandler = null
    for (const c of this.conns.values()) c.close()
    this.host?.close()
    this.peer.destroy()
  }
}

function describe(err: unknown): string {
  const type = (err as { type?: string })?.type
  if (type === 'peer-unavailable') return 'No se encontró la sala. Revisa el link.'
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'No hay conexión con el servidor de salas. Revisa tu internet.'
  if (type === 'browser-incompatible') return 'Tu navegador no soporta el modo cooperativo.'
  if (type === 'unavailable-id') return 'Ese código de sala ya está en uso. Intenta de nuevo.'
  return 'Error de conexión: ' + (type ?? String(err))
}
