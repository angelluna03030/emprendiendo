import mqtt, { type MqttClient } from 'mqtt'
import type { NetMsg } from './session'

/**
 * Plan B del modo cooperativo: cuando la conexión directa entre navegadores
 * (WebRTC) está bloqueada por la red, los mensajes viajan por un servidor
 * MQTT público usando WebSocket seguro (funciona casi en cualquier red).
 */

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt']
const ROOT = 'prodgame-tf/v1'

export const topicHost = (code: string) => `${ROOT}/${code}/h`
export const topicGuest = (code: string, id: string) => `${ROOT}/${code}/g/${id}`

/** Mensajes importantes llegan con confirmación; los frecuentes (snap, in) sin ella. */
function qosFor(msg: NetMsg): 0 | 1 {
  return msg.t === 'snap' || msg.t === 'in' || msg.t === 'ping' ? 0 : 1
}

export function publish(client: MqttClient, topic: string, from: string, msg: NetMsg) {
  if (!client.connected) return
  client.publish(topic, JSON.stringify({ f: from, m: msg }), { qos: qosFor(msg) })
}

export function parse(payload: Uint8Array): { f: string; m: NetMsg } | null {
  try {
    const data = JSON.parse(new TextDecoder().decode(payload))
    return data && typeof data.f === 'string' && data.m?.t ? data : null
  } catch {
    return null
  }
}

function connect(url: string, timeoutMs: number): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, {
      clientId: 'pg_' + Math.random().toString(36).slice(2, 12),
      connectTimeout: timeoutMs,
      reconnectPeriod: 2000,
      clean: true,
    })
    const timer = setTimeout(() => {
      client.end(true)
      reject(new Error('timeout ' + url))
    }, timeoutMs)
    client.once('connect', () => {
      clearTimeout(timer)
      resolve(client)
    })
  })
}

/** Anfitrión: se conecta a todos los servidores disponibles. */
export async function connectAll(timeoutMs = 8000): Promise<MqttClient[]> {
  const results = await Promise.allSettled(BROKERS.map((b) => connect(b, timeoutMs)))
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}

/** Invitado: usa el primer servidor que responda. */
export async function connectAny(timeoutMs = 8000): Promise<MqttClient[]> {
  // Se intentan en orden; así anfitrión e invitado coinciden casi siempre en el primero.
  const out: MqttClient[] = []
  for (const b of BROKERS) {
    try {
      out.push(await connect(b, timeoutMs))
    } catch {
      // probar el siguiente
    }
  }
  return out
}
