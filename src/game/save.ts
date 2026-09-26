import type { LevelId, LevelResult } from './types'

/** Toda la información del juego vive en localStorage (sin servidor). */
const KEY = 'production-game:v1'

export const START_MONEY = 600
/** Si el jugador queda casi sin dinero, el banco le presta hasta este mínimo. */
export const MIN_MONEY = 400

export interface RunRecord {
  date: string
  score: number
  time: number
  bestLevel: LevelId
}

export interface SaveData {
  version: 1
  money: number
  /** Nivel más alto desbloqueado (5 = partida completada). */
  unlocked: number
  results: Partial<Record<LevelId, LevelResult>>
  best: Partial<Record<LevelId, number>>
  runs: RunRecord[]
  plays: number
  muted: boolean
  musicMuted: boolean
  /** Modo zombis activado (se puede apagar para presentar en clase). */
  zombies: boolean
}

export function newRun(prev?: SaveData): SaveData {
  return {
    version: 1,
    money: START_MONEY,
    unlocked: 1,
    results: {},
    best: prev?.best ?? {},
    runs: prev?.runs ?? [],
    plays: prev?.plays ?? 0,
    muted: prev?.muted ?? false,
    musicMuted: prev?.musicMuted ?? false,
    zombies: prev?.zombies ?? true,
  }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return newRun()
    const data = JSON.parse(raw) as SaveData
    if (data?.version !== 1) return newRun()
    return { ...newRun(), ...data }
  } catch {
    return newRun()
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Almacenamiento bloqueado (modo privado): el juego sigue funcionando sin guardar.
  }
}

export function clearSave(): SaveData {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignorado
  }
  return newRun()
}
