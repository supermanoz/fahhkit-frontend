/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { levelProgress } from '../utils/territoryGame'
import './RunRewardAnimation.css'

// Bar-fill timings (ms) - same beats as a Clash Royale-style XP reward: fill
// toward 100%, pop "Level up!" if it crosses, reset and fill the rest on the
// new level. A run that didn't level up skips straight to BAR_MS.
const BAR_MS = 900
const LEVEL_UP_HOLD_MS = 900

// XP earned this run, animating into the level bar - shown once the server
// has actually finished processing the run (see GamePage's
// refreshProfileAfterRun), since XP isn't known any sooner than that. Only
// XP here, deliberately - Fahhcoin isn't earned per run at all, it accrues
// passively from territory already held via an hourly job, so there's no
// honest "+N coins" number to show alongside this.
export default function RunRewardAnimation({
  beforeLevel,
  beforeXp,
  afterLevel,
  afterXp,
  onDismiss,
}) {
  const xpGained = Math.max(0, Math.round(afterXp - beforeXp))
  const leveledUp = afterLevel > beforeLevel
  const beforeProgress = levelProgress(beforeLevel, beforeXp)
  const afterProgress = levelProgress(afterLevel, afterXp)

  // phase: 'fill' (bar animating toward its target) -> (if leveled up)
  // 'level-up' (bar pinned at 100%, badge flourish) -> 'fill-new' (bar
  // reset to 0, animating to the new level's progress) -> 'done'.
  const [phase, setPhase] = useState('fill')
  const [barPct, setBarPct] = useState(beforeProgress.pct)
  const [displayLevel, setDisplayLevel] = useState(beforeLevel)
  const [xpCount, setXpCount] = useState(0)

  useEffect(() => {
    // Bar: straight to the target pct, or to 100% first if this run
    // crossed a level.
    const raf1 = requestAnimationFrame(() =>
      setBarPct(leveledUp ? 1 : afterProgress.pct)
    )
    const timers = []
    if (leveledUp) {
      timers.push(
        setTimeout(() => {
          setPhase('level-up')
          setDisplayLevel(afterLevel)
        }, BAR_MS)
      )
      timers.push(
        setTimeout(() => {
          setPhase('fill-new')
          setBarPct(0)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setBarPct(afterProgress.pct))
          )
        }, BAR_MS + LEVEL_UP_HOLD_MS)
      )
      timers.push(
        setTimeout(() => setPhase('done'), BAR_MS + LEVEL_UP_HOLD_MS + BAR_MS)
      )
    } else {
      timers.push(setTimeout(() => setPhase('done'), BAR_MS))
    }
    return () => {
      cancelAnimationFrame(raf1)
      timers.forEach(clearTimeout)
    }
    // Runs once per mount - this component is remounted fresh (new key)
    // for each reward, never re-triggered by a prop change mid-animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "+N XP" counts up over the same total span the bar takes to settle,
  // independent of the bar's own fill/level-up/fill-new phase split.
  const totalMs = leveledUp ? BAR_MS + LEVEL_UP_HOLD_MS + BAR_MS : BAR_MS
  const countStartRef = useRef(null)
  useEffect(() => {
    let rafId
    function tick(ts) {
      if (countStartRef.current == null) countStartRef.current = ts
      const t = Math.min(1, (ts - countStartRef.current) / totalMs)
      setXpCount(Math.round(t * xpGained))
      if (t < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="run-reward-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="run-reward-card"
        initial={{ scale: 0.85, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      >
        <p className="run-reward-kicker">Run complete</p>
        <p className="run-reward-xp-gained">+{xpCount} XP</p>

        <div className="run-reward-level-row">
          <span className="run-reward-level-badge">
            <span className="run-reward-level-num">{displayLevel}</span>
          </span>
          <div className="run-reward-bar-track">
            <div
              className="run-reward-bar-fill"
              style={{ width: `${Math.round(barPct * 100)}%` }}
            />
          </div>
        </div>

        {phase === 'level-up' && (
          <motion.p
            className="run-reward-level-up"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          >
            🎉 Level up!
          </motion.p>
        )}

        <button
          type="button"
          className="game-btn game-btn-green run-reward-action"
          onClick={onDismiss}
        >
          Nice
        </button>
      </motion.div>
    </motion.div>
  )
}
