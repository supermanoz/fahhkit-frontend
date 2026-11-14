/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { levelProgress } from '../utils/territoryGame'
import { formatDistance, formatDuration, formatPace } from '../utils/run'
import HeroFigure from './HeroFigure'
import './RunRewardsModal.css'
import { formatNumber } from '../utils/format'

// One reward sequence for every mode that can grant XP or score - replaces
// the old pair of popups (RunRewardAnimation's XP-only modal, and
// RunScoreCard embedded inside the run-result toast) with a single
// "Run Complete" beat shown once GamePage's toast itself is dismissed (see
// GamePage.jsx's runXpBeforeRef/refreshProfileAfterRun for how xpReward is
// built, and onRunProcessed for scoreBreakdown - both unchanged, just read
// here together instead of by two separate components). TrackRunPanel's
// Boss Fight save flow is a separate, admin/moderator-only staging surface
// with no reward UI today - deliberately out of scope here.
const BAR_MS = 900
const LEVEL_UP_HOLD_MS = 900
const SCORE_MS = 700
const PERK_HOLD_MS = 450

const TITLES = {
  territory: 'Run Complete',
  training: 'Training Complete',
  club_war: 'War Run Complete',
  pvp: 'PvP Result',
}

// "Score" everywhere a mode's own vocabulary doesn't already have a name
// for it (territory/training share the plain territory-scoring breakdown -
// see GamePage's old scoreMode) - club_war/pvp get mode-flavoured labels
// since those numbers aren't territory score at all (pace + base effort
// only, per RunScoreCard.jsx's own comment).
const POINTS_LABEL = {
  territory: 'Score',
  training: 'Score',
  club_war: 'War Points',
  pvp: 'PvP Points',
}

function reducedMotion() {
  return Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

// phase order: 'stats' -> 'xp' -> (leveled up: 'level-up' -> 'xp-new') ->
// 'score' -> 'perk' (only if a hero perk applied) -> 'total'. Each phase
// reveals its own section and leaves every earlier one on screen - nothing
// is replaced, the card just grows - same build-up RunRewardAnimation's bar
// already used for its own level-up beat.
export default function RunRewardsModal({
  mode = 'territory',
  stats,
  xpReward,
  scoreBreakdown,
  onDismiss,
}) {
  const hasXp = Boolean(xpReward)
  const xpGained = hasXp
    ? Math.max(0, Math.round(xpReward.afterXp - xpReward.beforeXp))
    : 0
  const leveledUp = hasXp && xpReward.afterLevel > xpReward.beforeLevel
  const beforeProgress = hasXp
    ? levelProgress(xpReward.beforeLevel, xpReward.beforeXp)
    : null
  const afterProgress = hasXp
    ? levelProgress(xpReward.afterLevel, xpReward.afterXp)
    : null

  const totalScore = scoreBreakdown?.totalScore
  const hasScore = totalScore != null
  const heroBonus = scoreBreakdown?.heroBonus || null

  const reduceMotionRef = useRef(reducedMotion())

  const [phase, setPhase] = useState('stats')
  const [barPct, setBarPct] = useState(beforeProgress?.pct ?? 0)
  const [displayLevel, setDisplayLevel] = useState(xpReward?.beforeLevel ?? 1)
  const [xpCount, setXpCount] = useState(0)
  const [scoreCount, setScoreCount] = useState(0)

  const skippedRef = useRef(false)
  const timersRef = useRef([])
  const framesRef = useRef([])

  function clearAllTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    framesRef.current.forEach(cancelAnimationFrame)
    framesRef.current = []
  }

  // Jumps straight to the fully-revealed end state - tapping the card
  // during the sequence, or prefers-reduced-motion from the very start.
  function skip() {
    if (skippedRef.current) return
    skippedRef.current = true
    clearAllTimers()
    setBarPct(afterProgress?.pct ?? 0)
    setDisplayLevel(xpReward?.afterLevel ?? xpReward?.beforeLevel ?? 1)
    setXpCount(xpGained)
    setScoreCount(hasScore ? Math.round(totalScore) : 0)
    setPhase('total')
  }

  useEffect(() => {
    if (reduceMotionRef.current) {
      skip()
      return clearAllTimers
    }

    function after(ms, fn) {
      const id = setTimeout(fn, ms)
      timersRef.current.push(id)
    }

    // Stats row is already visible (initial phase); XP starts almost
    // immediately so the card doesn't sit static for a beat first.
    after(250, () => {
      if (skippedRef.current) return
      setPhase('xp')
      requestAnimationFrame(() => {
        if (skippedRef.current) return
        setBarPct(leveledUp ? 1 : (afterProgress?.pct ?? 0))
        const start = performance.now()
        function tick(ts) {
          if (skippedRef.current) return
          const t = Math.min(1, (ts - start) / BAR_MS)
          setXpCount(Math.round(t * xpGained))
          if (t < 1) framesRef.current.push(requestAnimationFrame(tick))
        }
        framesRef.current.push(requestAnimationFrame(tick))
      })

      let xpPhaseMs = BAR_MS
      if (leveledUp) {
        xpPhaseMs = BAR_MS + LEVEL_UP_HOLD_MS + BAR_MS
        after(BAR_MS, () => {
          if (skippedRef.current) return
          setPhase('level-up')
          setDisplayLevel(xpReward.afterLevel)
        })
        after(BAR_MS + LEVEL_UP_HOLD_MS, () => {
          if (skippedRef.current) return
          setPhase('xp-new')
          setBarPct(0)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (!skippedRef.current) setBarPct(afterProgress?.pct ?? 0)
            })
          )
        })
      }

      after(xpPhaseMs, () => {
        if (skippedRef.current) return
        if (!hasScore) {
          setPhase('total')
          return
        }
        setPhase('score')
        const start = performance.now()
        function tick(ts) {
          if (skippedRef.current) return
          const t = Math.min(1, (ts - start) / SCORE_MS)
          setScoreCount(Math.round(t * totalScore))
          if (t < 1) framesRef.current.push(requestAnimationFrame(tick))
        }
        framesRef.current.push(requestAnimationFrame(tick))

        after(SCORE_MS, () => {
          if (skippedRef.current) return
          if (heroBonus) {
            setPhase('perk')
            after(PERK_HOLD_MS, () => {
              if (!skippedRef.current) setPhase('total')
            })
          } else {
            setPhase('total')
          }
        })
      })
    })

    return clearAllTimers
    // Runs once per mount - this component is remounted fresh per reward
    // (GamePage keys it by run id), never re-triggered by a prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const phaseOrder = [
    'stats',
    'xp',
    'level-up',
    'xp-new',
    'score',
    'perk',
    'total',
  ]
  const reached = (p) => phaseOrder.indexOf(phase) >= phaseOrder.indexOf(p)

  const title = TITLES[mode] || TITLES.territory
  const pointsLabel = POINTS_LABEL[mode] || POINTS_LABEL.territory

  return (
    <motion.div
      className="run-rewards-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={skip}
    >
      <motion.div
        className="run-rewards-card"
        initial={{ scale: 0.9, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="run-rewards-title">{title}</h3>

        {stats && (
          <div className="run-rewards-stats">
            <span className="run-rewards-stat">
              <span className="run-rewards-stat-value">
                {formatDistance(stats.distance)}
              </span>
              <span className="run-rewards-stat-label">Distance</span>
            </span>
            <span className="run-rewards-stat">
              <span className="run-rewards-stat-value">
                {formatDuration(stats.duration)}
              </span>
              <span className="run-rewards-stat-label">Time</span>
            </span>
            <span className="run-rewards-stat">
              <span className="run-rewards-stat-value">
                {formatPace(stats.avgPace)}
              </span>
              <span className="run-rewards-stat-label">Pace</span>
            </span>
          </div>
        )}

        {hasXp && reached('xp') && (
          <div className="run-rewards-section">
            <p className="run-rewards-xp-gained">+{xpCount} XP</p>
            <div className="run-rewards-level-row">
              <span className="run-rewards-level-badge">
                <span className="run-rewards-level-num">{displayLevel}</span>
              </span>
              <div className="run-rewards-bar-track">
                <div
                  className="run-rewards-bar-fill"
                  style={{ width: `${Math.round(barPct * 100)}%` }}
                />
              </div>
            </div>
            {phase === 'level-up' && (
              <motion.p
                className="run-rewards-level-up"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                Level up!
              </motion.p>
            )}
          </div>
        )}

        {hasScore && reached('score') && (
          <div className="run-rewards-section run-rewards-score-row">
            <span className="run-rewards-score-label">{pointsLabel}</span>
            <span className="run-rewards-score-value">
              +{formatNumber(scoreCount)}
            </span>
          </div>
        )}

        {heroBonus && reached('perk') && (
          <motion.div
            className="run-rewards-perk-card"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          >
            <span className="run-rewards-perk-icon">
              <HeroFigure hero={{ name: heroBonus.heroName }} height={44} />
            </span>
            <span className="run-rewards-perk-text">
              <strong>{heroBonus.heroName}</strong>&apos;s perk added +
              {Math.round(heroBonus.totalBonus)} {pointsLabel.toLowerCase()}
            </span>
          </motion.div>
        )}

        {reached('total') && (hasXp || hasScore) && (
          <motion.p
            className="run-rewards-total"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Total:{hasXp && <> +{formatNumber(xpGained)} XP</>}
            {hasXp && hasScore && ' · '}
            {hasScore && (
              <>
                {' '}
                +{formatNumber(totalScore)} {pointsLabel}
              </>
            )}
          </motion.p>
        )}

        {reached('total') && (
          <button
            type="button"
            className="game-btn game-btn-green run-rewards-action"
            onClick={onDismiss}
          >
            Continue
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
