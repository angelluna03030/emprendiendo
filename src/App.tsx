import { useEffect, useState } from 'react'
import { clearSave, loadSave, MIN_MONEY, newRun, writeSave, type RunRecord, type SaveData } from './game/save'
import { setMusic } from './game/music'
import { play, setMuted } from './game/sfx'
import type { LevelId, LevelResult } from './game/types'
import { GameView } from './ui/GameView'
import { FinalScreen, Instructions, LevelResultView, LevelSelect, Menu, Records } from './ui/Screens'

type Screen =
  | { name: 'menu' }
  | { name: 'help' }
  | { name: 'levels' }
  | { name: 'records' }
  | { name: 'play'; level: LevelId; money: number; key: number }
  | { name: 'result'; result: LevelResult }
  | { name: 'final'; run: RunRecord }

const ALL: LevelId[] = [1, 2, 3, 4]

/** Solo en desarrollo: `?nivel=3` abre directamente ese nivel sin guardar nada (para probar o presentar). */
const DEV_LEVEL = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('nivel')) : 0

function devScreen(): Screen {
  if (DEV_LEVEL >= 1 && DEV_LEVEL <= 4) return { name: 'play', level: DEV_LEVEL as LevelId, money: 1000, key: 0 }
  return { name: 'menu' }
}

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave)
  const [screen, setScreen] = useState<Screen>(devScreen)

  useEffect(() => setMuted(save.muted), [save.muted])
  useEffect(() => setMusic(!save.musicMuted), [save.musicMuted])

  const update = (next: SaveData) => {
    setSave(next)
    if (!DEV_LEVEL) writeSave(next)
  }

  // El banco presta lo mínimo para poder comprar materiales.
  const playMoney = Math.max(save.money, MIN_MONEY)

  const go = (s: Screen) => {
    play('click')
    setScreen(s)
  }

  const startLevel = (level: LevelId) => go({ name: 'play', level, money: playMoney, key: Date.now() })

  const handleEnd = (r: LevelResult) => {
    const next: SaveData = {
      ...save,
      plays: save.plays + 1,
      best: { ...save.best, [r.levelId]: Math.max(save.best[r.levelId] ?? -Infinity, r.score) },
    }
    if (r.passed) {
      next.results = { ...save.results, [r.levelId]: r }
      next.money = playMoney + r.moneyDelta
      next.unlocked = Math.max(save.unlocked, Math.min(4, r.levelId + 1))
    }
    update(next)
    setScreen({ name: 'result', result: r })
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
    update({ ...save, unlocked: 5, runs: [run, ...save.runs].slice(0, 20) })
    play('win')
    setScreen({ name: 'final', run })
  }

  switch (screen.name) {
    case 'menu':
      return (
        <Menu
          save={save}
          onPlay={() => go({ name: 'levels' })}
          onHelp={() => go({ name: 'help' })}
          onRecords={() => go({ name: 'records' })}
          onToggleSound={() => update({ ...save, muted: !save.muted })}
          onToggleMusic={() => update({ ...save, musicMuted: !save.musicMuted })}
          onToggleZombies={() => update({ ...save, zombies: !save.zombies })}
        />
      )
    case 'help':
      return <Instructions onBack={() => go({ name: 'menu' })} />
    case 'records':
      return <Records save={save} onBack={() => go({ name: 'menu' })} onClear={() => update(clearSave())} />
    case 'levels':
      return (
        <LevelSelect
          save={save}
          money={playMoney}
          onPick={startLevel}
          onBack={() => go({ name: 'menu' })}
          onNewRun={() => update(newRun(save))}
        />
      )
    case 'play':
      return (
        <GameView
          key={screen.key}
          levelId={screen.level}
          money={screen.money}
          zombies={save.zombies}
          musicOn={!save.musicMuted}
          onToggleMusic={() => update({ ...save, musicMuted: !save.musicMuted })}
          onEnd={handleEnd}
          onExit={() => go({ name: 'levels' })}
        />
      )
    case 'result': {
      const id = screen.result.levelId
      return (
        <LevelResultView
          result={screen.result}
          allDone={allPassed && id === 4}
          onNext={() => startLevel(Math.min(4, id + 1) as LevelId)}
          onRetry={() => startLevel(id)}
          onMenu={() => go({ name: 'levels' })}
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
            update(newRun(save))
            go({ name: 'levels' })
          }}
        />
      )
  }
}
