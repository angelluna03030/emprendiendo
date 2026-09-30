import type { MqttClient } from 'mqtt'
import Peer, { type DataConnection, type PeerOptions } from 'peerjs'
import type { LevelId } from '../game/types'
import { connectAll, connectAny, parse, publish, topicGuest, topicHost } from './relay'

/**
 * Sala cooperativa (máximo 3 jugadores).
 * El anfitrión simula la partida; los invitados envían sus controles y reciben el estado.
 *
 * Hay dos caminos de conexión:
 * 1. Directo entre navegadores con PeerJS/WebRTC (el más rápido).
 * 2. Relevo por un servidor MQTT público (plan B cuando la red bloquea la conexión directa).
 * El anfitrión escucha por los dos; el invitado prueba el directo y, si falla, usa el relevo.
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

/** Un canal hacia otro jugador, directo o por relevo. */
interface Link {
  via: 'directa' | 'servidor'
  send: (msg: NetMsg) => void
  close: () => void
  lastSeen: number
}

/**
 * Servidores STUN/TURN para la conexión directa.
 * Un TURN propio se puede configurar en Vercel con VITE_TURN_URL (URLs separadas por coma),
 * VITE_TURN_USERNAME y VITE_TURN_CREDENTIAL. Sin TURN, el relevo MQTT cubre las redes difíciles.
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
const DIRECT_TIMEOUT = 7000
const RELAY_TIMEOUT = 9000
const HEARTBEAT = 3000
const DEAD_AFTER = 12000

/** El link solo sirve en este computador si el juego corre en localhost. */
export function isLocalOnly() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function roomLink(code: string) {
  return `${location.origin}${location.pathname}?sala=${code}`
}

type JoinError = Error & { final?: boolean }

function joinError(message: string, final = false): JoinError {
  return Object.assign(new Error(message), { final })
}

export class Session {
  readonly role: 'host' | 'client'
  code = ''
  meId = ''
  players: PlayerInfo[] = []
  status: 'connecting' | 'lobby' | 'closed' = 'connecting'
  error = ''
  inGame = false
  /** Invitado: cómo quedó conectado. */
  via: 'directa' | 'servidor' = 'directa'

  /** React escucha cambios del lobby. */
  onChange: (() => void) | null = null
  /** Invitado: el anfitrión inició un nivel. */
  onStart: ((s: StartInfo) => void) | null = null
  /** Invitado: el anfitrión terminó el nivel (resultado) o volvió al lobby. */
  onEnd: ((msg: NetMsg) => void) | null = null

  private peer: Peer | null = null
  private brokers: MqttClient[] = []
  /** Anfitrión: canal hacia cada invitado. */
  private links = new Map<string, Link>()
  /** Invitado: canal hacia el anfitrión. */
  private host: Link | null = null
  private gameHandler: GameHandler | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null

  private constructor(role: 'host' | 'client') {
    this.role = role
  }

  /* ---------------------------------------------------------------- */
  /* Anfitrión                                                         */
  /* ---------------------------------------------------------------- */

  static async host(name: string): Promise<Session> {
    const s = new Session('host')
    s.code = randomCode()
    s.meId = PREFIX + s.code

    // Los dos caminos se abren en paralelo; basta con que funcione uno.
    const [direct, relay] = await Promise.allSettled([s.openPeer(), connectAll()])
    if (relay.status === 'fulfilled') {
      s.brokers = relay.value
      for (const b of s.brokers) {
        b.subscribe(topicHost(s.code), { qos: 1 })
        b.on('message', (_topic, payload) => s.fromRelayGuest(b, payload))
      }
    }
    if (direct.status === 'rejected' && s.brokers.length === 0) {
      s.close()
      throw new Error('No hay conexión con los servidores de salas. Revisa tu internet e intenta de nuevo.')
    }

    s.players = [{ id: s.meId, name, color: PLAYER_COLORS[0] }]
    s.status = 'lobby'
    s.heartbeat = setInterval(() => s.hostHeartbeat(), HEARTBEAT)
    return s
  }

  private openPeer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(this.meId, PEER_OPTIONS)
      this.peer = peer
      const timer = setTimeout(() => reject(new Error('peer timeout')), 8000)
      peer.on('open', () => {
        clearTimeout(timer)
        resolve()
      })
      peer.on('connection', (conn) => this.acceptDirect(conn))
      peer.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      // Si se pierde el contacto con el servidor de PeerJS, reconectar para que la sala siga visible
      peer.on('disconnected', () => {
        if (this.status !== 'closed') setTimeout(() => !peer.destroyed && peer.reconnect(), 1000)
      })
    })
  }

  private acceptDirect(conn: DataConnection) {
    const link: Link = {
      via: 'directa',
      send: (msg) => conn.open && conn.send(msg),
      close: () => conn.close(),
      lastSeen: Date.now(),
    }
    conn.on('data', (data) => this.fromGuest(conn.peer, link, data as NetMsg))
    conn.on('close', () => this.dropGuest(conn.peer))
    conn.on('error', () => this.dropGuest(conn.peer))
  }

  private fromRelayGuest(broker: MqttClient, payload: Uint8Array) {
    const data = parse(payload)
    if (!data) return
    const id = data.f
    let link = this.links.get(id)
    if (!link) {
      if (data.m.t !== 'hello') return
      link = {
        via: 'servidor',
        send: (msg) => publish(broker, topicGuest(this.code, id), this.meId, msg),
        close: () => publish(broker, topicGuest(this.code, id), this.meId, { t: 'bye' }),
        lastSeen: Date.now(),
      }
    }
    if (data.m.t === 'bye') {
      this.dropGuest(id)
      return
    }
    this.fromGuest(id, link, data.m)
  }

  private fromGuest(id: string, link: Link, msg: NetMsg) {
    link.lastSeen = Date.now()
    if (msg.t === 'ping') return
    if (msg.t === 'hello') {
      if (this.links.has(id)) {
        // Hola repetido (reintento): reenviar el lobby
        link.send({ t: 'lobby', players: this.players })
        return
      }
      if (this.players.length >= MAX_PLAYERS) {
        link.send({ t: 'full' })
        return
      }
      if (this.inGame) {
        link.send({ t: 'busy' })
        return
      }
      const used = new Set(this.players.map((p) => p.color))
      const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[1]
      this.links.set(id, link)
      this.players.push({ id, name: String(msg.name || 'Jugador').slice(0, 14), color })
      this.broadcastLobby()
      this.changed()
      return
    }
    if (!this.links.has(id)) return
    this.gameHandler?.(id, msg)
  }

  /** Mantiene vivos los canales por relevo y quita a quien se fue sin avisar. */
  private hostHeartbeat() {
    const now = Date.now()
    for (const [id, link] of this.links) {
      if (link.via !== 'servidor') continue
      if (now - link.lastSeen > DEAD_AFTER) this.dropGuest(id)
      else link.send({ t: 'ping' })
    }
  }

  private dropGuest(id: string) {
    if (!this.links.has(id)) return
    this.links.delete(id)
    this.players = this.players.filter((p) => p.id !== id)
    this.gameHandler?.(id, { t: 'leave' })
    this.broadcastLobby()
    this.changed()
  }

  private broadcastLobby() {
    this.broadcast({ t: 'lobby', players: this.players })
  }

  broadcast(msg: NetMsg) {
    for (const link of this.links.values()) link.send(msg)
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

  /**
   * Se une a una sala: primero intenta la conexión directa y, si la red
   * la bloquea, se conecta por el relevo del servidor.
   */
  static async join(code: string, name: string): Promise<Session> {
    const clean = code.trim().toUpperCase()
    // `&relay=1` en el link fuerza el relevo (útil para probar)
    const forceRelay = new URLSearchParams(location.search).has('relay')
    if (!forceRelay) {
      try {
        return await Session.joinDirect(clean, name)
      } catch (e) {
        if ((e as JoinError).final) throw e
      }
    }
    try {
      return await Session.joinRelay(clean, name)
    } catch (e) {
      const relayError = e as JoinError
      if (relayError.final) throw relayError
      throw joinError(
        `No se pudo entrar a la sala ${clean}. Verifica que el anfitrión tenga el lobby abierto (sin cerrar la pestaña ni cambiar de app) y que el link esté completo.`,
      )
    }
  }

  private static joinDirect(code: string, name: string): Promise<Session> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PEER_OPTIONS)
      const s = new Session('client')
      s.peer = peer
      s.code = code
      let done = false

      const fail = (message: string, final = false) => {
        if (done) return
        done = true
        clearTimeout(timer)
        peer.destroy()
        reject(joinError(message, final))
      }
      const timer = setTimeout(() => fail('La conexión directa no abrió a tiempo.'), DIRECT_TIMEOUT)

      peer.on('open', (id) => {
        s.meId = id
        const conn = peer.connect(PREFIX + code, { reliable: true })
        s.host = { via: 'directa', send: (msg) => conn.open && conn.send(msg), close: () => conn.close(), lastSeen: Date.now() }
        conn.on('open', () => conn.send({ t: 'hello', name }))
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
            s.via = 'directa'
            resolve(s)
          }
          s.fromHost(msg)
        })
        conn.on('error', () => fail('Falló la conexión directa.'))
        conn.on('close', () => {
          if (done) s.fail('Se perdió la conexión con el anfitrión (cerró la sala o se desconectó).')
        })
      })
      peer.on('error', (err) => {
        if (!done) fail(describe(err))
        else s.fail(describe(err))
      })
      peer.on('disconnected', () => {
        // Solo afecta al servidor de salas; la conexión con el anfitrión sigue
        if (done) setTimeout(() => !peer.destroyed && peer.reconnect(), 1000)
      })
    })
  }

  private static async joinRelay(code: string, name: string): Promise<Session> {
    const brokers = await connectAny()
    if (!brokers.length) throw joinError('No hay conexión con los servidores de salas. Revisa tu internet.')
    const s = new Session('client')
    s.code = code
    s.meId = 'r-' + Math.random().toString(36).slice(2, 10)
    s.brokers = brokers

    return new Promise((resolve, reject) => {
      let done = false
      const finish = (err: JoinError | null, winner?: MqttClient) => {
        if (done) return
        done = true
        clearTimeout(timer)
        // Solo se conserva el servidor por el que respondió el anfitrión
        for (const b of brokers) if (b !== winner) b.end(true)
        if (err) {
          reject(err)
          return
        }
        s.brokers = winner ? [winner] : []
        s.status = 'lobby'
        s.via = 'servidor'
        s.heartbeat = setInterval(() => s.guestHeartbeat(), HEARTBEAT)
        resolve(s)
      }
      const timer = setTimeout(() => finish(joinError('No respondió la sala por el servidor.')), RELAY_TIMEOUT)

      for (const b of brokers) {
        b.subscribe(topicGuest(code, s.meId), { qos: 1 }, () => {
          publish(b, topicHost(code), s.meId, { t: 'hello', name })
        })
        b.on('message', (_topic, payload) => {
          const data = parse(payload)
          if (!data) return
          const msg = data.m
          if (!done) {
            if (msg.t === 'full' || msg.t === 'busy') {
              finish(joinError(msg.t === 'full' ? 'La sala está llena (máximo 3 jugadores).' : 'La partida ya empezó. Espera a que termine el nivel y vuelve a abrir el link.', true))
              return
            }
            if (msg.t !== 'lobby') return
            s.host = {
              via: 'servidor',
              send: (m) => publish(b, topicHost(code), s.meId, m),
              close: () => publish(b, topicHost(code), s.meId, { t: 'bye' }),
              lastSeen: Date.now(),
            }
            finish(null, b)
          }
          if (s.brokers[0] !== b && done) return
          if (s.host) s.host.lastSeen = Date.now()
          if (msg.t === 'bye') {
            s.fail('El anfitrión cerró la sala.')
            return
          }
          s.fromHost(msg)
        })
      }
    })
  }

  private guestHeartbeat() {
    if (!this.host) return
    if (Date.now() - this.host.lastSeen > DEAD_AFTER) {
      this.fail('Se perdió la conexión con el anfitrión (cerró la sala o se desconectó).')
      return
    }
    this.host.send({ t: 'ping' })
  }

  private fromHost(msg: NetMsg) {
    switch (msg.t) {
      case 'ping':
        return
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
    this.host?.send(msg)
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
    if (this.heartbeat) clearInterval(this.heartbeat)
    for (const l of this.links.values()) l.close()
    this.host?.close()
    // Dar tiempo a que salga el aviso de despedida por el relevo
    const brokers = this.brokers
    setTimeout(() => brokers.forEach((b) => b.end(true)), 300)
    this.peer?.destroy()
  }
}

function describe(err: unknown): string {
  const type = (err as { type?: string })?.type
  if (type === 'peer-unavailable') return 'No se encontró la sala por conexión directa.'
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'No hay conexión con el servidor de salas. Revisa tu internet.'
  if (type === 'browser-incompatible') return 'Tu navegador no soporta la conexión directa.'
  if (type === 'unavailable-id') return 'Ese código de sala ya está en uso. Intenta de nuevo.'
  return 'Error de conexión: ' + (type ?? String(err))
}
