import { useEffect, useState } from 'react'
import { setMusic } from './game/music'
import { clearSave, loadSave, MIN_MONEY, newRun, writeSave, type RunRecord, type SaveData } from './game/save'
import { play, setMuted } from './game/sfx'
import type { LevelId, LevelResult } from './game/types'
import { Session, type NetMsg, type PlayerInfo } from './net/session'
import { GameView } from './ui/GameView'
import { Lobby } from './ui/Lobby'
import { FinalScreen, Instructions, LevelResultView, LevelSelect, Menu, Records } from './ui/Screens'

interface Coop {
  players: PlayerInfo[]
  zombies: boolean
}

type Screen =
  | { name: 'menu' }
  | { name: 'help' }
  | { name: 'levels' }
  | { name: 'records' }
  | { name: 'coop' }
  | { name: 'play'; level: LevelId; money: number; key: number; coop?: Coop }
  | { name: 'result'; result: LevelResult; coop?: boolean }
  | { name: 'final'; run: RunRecord }

const ALL: LevelId[] = [1, 2, 3, 4]
const NAME_KEY = 'production-game:name'

/** Link de invitación: ?sala=CODIGO */
const JOIN_CODE = new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? null

/** Solo en desarrollo: `?nivel=3` abre directamente ese nivel sin guardar nada (para probar o presentar). */
const DEV_LEVEL = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('nivel')) : 0

function initialScreen(): Screen {
  if (JOIN_CODE) return { name: 'coop' }
  if (DEV_LEVEL >= 1 && DEV_LEVEL <= 4) return { name: 'play', level: DEV_LEVEL as LevelId, money: 1000, key: 0 }
  return { name: 'menu' }
}

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave)
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [session, setSession] = useState<Session | null>(null)
  const [, setLobbyTick] = useState(0)
  const [joinCode, setJoinCode] = useState(JOIN_CODE)
  const [name, setName] = useState(loadName)
  const [busy, setBusy] = useState(false)
  const [coopError, setCoopError] = useState('')

  useEffect(() => setMuted(save.muted), [save.muted])
  useEffect(() => setMusic(!save.musicMuted), [save.musicMuted])

  const update = (fn: (s: SaveData) => SaveData) => {
    setSave((prev) => {
      const next = fn(prev)
      if (!DEV_LEVEL) writeSave(next)
      return next
    })
  }

  // El banco presta lo mínimo para poder comprar materiales.
  const playMoney = Math.max(save.money, MIN_MONEY)

  const go = (s: Screen) => {
    play('click')
    setScreen(s)
  }

  const startLevel = (level: LevelId) => go({ name: 'play', level, money: playMoney, key: Date.now() })

  /** Guarda récords; el progreso (dinero y niveles) solo lo guarda quien juega solo o el anfitrión. */
  const recordResult = (r: LevelResult, progress: boolean) => {
    update((prev) => {
      const next: SaveData = {
        ...prev,
        plays: prev.plays + 1,
        best: { ...prev.best, [r.levelId]: Math.max(prev.best[r.levelId] ?? -Infinity, r.score) },
      }
      if (progress && r.passed) {
        next.results = { ...prev.results, [r.levelId]: r }
        next.money = Math.max(prev.money, MIN_MONEY) + r.moneyDelta
        next.unlocked = Math.max(prev.unlocked, Math.min(4, r.levelId + 1))
      }
      return next
    })
  }

  const handleEnd = (r: LevelResult) => {
    const coop = screen.name === 'play' && !!screen.coop
    recordResult(r, true)
    if (coop) session?.endLevel({ t: 'end', result: r })
    setScreen({ name: 'result', result: r, coop })
  }

  const allPassed = ALL.every((id) => save.results[id]?.passed)

  const showFinal = () => {
    const results = ALL.map((id) => save.results[id]!)
    const best = results.reduce((a, b) => (b.score / b.refScore > a.score / a.refScore ? b : a))
    const run: RunRecord = {
      date: new Date().toISOString(),
      score: results.reduce((sum, r) => sum + r.score, 0),
      time: results.reduce((sum, r) => sum + r.time, 0),
      bestLevel: best.levelId,
    }
    update((prev) => ({ ...prev, unlocked: 5, runs: [run, ...prev.runs].slice(0, 20) }))
    play('win')
    setScreen({ name: 'final', run })
  }

  /* ---------------------------------------------------------------- */
  /* Cooperativo                                                       */
  /* ---------------------------------------------------------------- */

  const attach = (s: Session) => {
    s.onChange = () => {
      setLobbyTick((t) => t + 1)
      // Si se cae la conexión durante la partida, volver al lobby a ver el error
      if (s.status === 'closed') setScreen((cur) => (cur.name === 'play' || cur.name === 'result' ? { name: 'coop' } : cur))
    }
    s.onStart = (st) => setScreen({ name: 'play', level: st.level, money: st.money, key: st.key, coop: { players: st.players, zombies: st.zombies } })
    s.onEnd = (msg: NetMsg) => {
      if (msg.t === 'end') {
        const r = msg.result as LevelResult
        recordResult(r, false)
        setScreen({ name: 'result', result: r, coop: true })
      } else setScreen({ name: 'coop' })
    }
    setSession(s)
  }

  const saveName = (n: string) => {
    setName(n)
    try {
      localStorage.setItem(NAME_KEY, n)
    } catch {
      // sin almacenamiento: el nombre solo dura esta sesión
    }
  }

  const connect = async (make: () => Promise<Session>) => {
    setBusy(true)
    setCoopError('')
    try {
      attach(await make())
    } catch (e) {
      setCoopError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const leaveCoop = () => {
    session?.close()
    setSession(null)
    setJoinCode(null)
    setCoopError('')
    if (JOIN_CODE) history.replaceState(null, '', location.pathname)
    go({ name: 'menu' })
  }

  const startCoop = (level: LevelId) => {
    if (!session?.isHost) return
    const st = session.startLevel({ level, money: playMoney, zombies: save.zombies })
    go({ name: 'play', level, money: st.money, key: st.key, coop: { players: st.players, zombies: st.zombies } })
  }

  const backToLobby = () => {
    if (session?.isHost) session.endLevel({ t: 'toLobby' })
    go({ name: 'coop' })
  }

  switch (screen.name) {
    case 'menu':
      return (
        <Menu
          save={save}
          onPlay={() => go({ name: 'levels' })}
          onCoop={() => go({ name: 'coop' })}
          onHelp={() => go({ name: 'help' })}
          onRecords={() => go({ name: 'records' })}
          onToggleSound={() => update((s) => ({ ...s, muted: !s.muted }))}
          onToggleMusic={() => update((s) => ({ ...s, musicMuted: !s.musicMuted }))}
          onToggleZombies={() => update((s) => ({ ...s, zombies: !s.zombies }))}
        />
      )
    case 'help':
      return <Instructions onBack={() => go({ name: 'menu' })} />
    case 'records':
      return <Records save={save} onBack={() => go({ name: 'menu' })} onClear={() => update(() => clearSave())} />
    case 'levels':
      return (
        <LevelSelect
          save={save}
          money={playMoney}
          onPick={startLevel}
          onBack={() => go({ name: 'menu' })}
          onNewRun={() => update((s) => newRun(s))}
        />
      )
    case 'coop':
      return (
        <Lobby
          session={session}
          joinCode={joinCode}
          name={name}
          unlocked={Math.min(4, save.unlocked)}
          busy={busy}
          error={coopError}
          onName={saveName}
          onCreate={() => connect(() => Session.host(name.trim()))}
          onJoin={() => joinCode && connect(() => Session.join(joinCode, name.trim()))}
          onStart={startCoop}
          onLeave={leaveCoop}
        />
      )
    case 'play':
      return (
        <GameView
          key={screen.key}
          levelId={screen.level}
          money={screen.money}
          zombies={screen.coop ? screen.coop.zombies : save.zombies}
          session={screen.coop ? session : null}
          players={screen.coop?.players}
          musicOn={!save.musicMuted}
          onToggleMusic={() => update((s) => ({ ...s, musicMuted: !s.musicMuted }))}
          onEnd={handleEnd}
          onExit={() => (screen.coop ? (session?.isHost ? backToLobby() : leaveCoop()) : go({ name: 'levels' }))}
        />
      )
    case 'result': {
      const id = screen.result.levelId
      const mode = !screen.coop ? 'solo' : session?.isHost ? 'host' : 'guest'
      return (
        <LevelResultView
          result={screen.result}
          mode={mode}
          allDone={allPassed && id === 4 && mode !== 'guest'}
          onNext={() => (mode === 'host' ? startCoop(Math.min(4, id + 1) as LevelId) : startLevel(Math.min(4, id + 1) as LevelId))}
          onRetry={() => (mode === 'host' ? startCoop(id) : startLevel(id))}
          onMenu={() => (mode === 'solo' ? go({ name: 'levels' }) : mode === 'host' ? backToLobby() : leaveCoop())}
          onFinal={showFinal}
        />
      )
    }
    case 'final':
      return (
        <FinalScreen
          run={screen.run}
          save={save}
          onMenu={() => go({ name: 'menu' })}
          onNewRun={() => {
            update((s) => newRun(s))
            go({ name: 'levels' })
          }}
        />
      )
  }
}
