/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { levelProgress } from '../utils/territoryGame'
import HeroFigure from './HeroFigure'
import ShareRunCarousel from './ShareRunCarousel'
import { CompletedRunStats } from './RunResultCard'
import { TitleRibbon } from '../game/ui/GameModal'
import { IconClose } from './GameIcons'
import './RunRewardsModal.css'
import { formatNumber } from '../utils/format'
import GameButton from './ui/GameButton'

// One reward sequence for every mode that can grant XP or score - replaces
// the old pair of popups (RunRewardAnimation's XP-only modal, and
// RunScoreCard embedded inside the run-result toast) with a single
// "Run Complete" beat shown once GamePage's toast itself is dismissed (see
// GamePage.jsx's runXpBeforeRef/refreshProfileAfterRun for how xpReward is
// built, and onRunProcessed for scoreBreakdown - both unchanged, just read
// here together instead of by two separate components). TrackRunPanel's
// Boss Fight save flow is a separate, admin/moderator-only staging surface
// with no reward UI today - deliberately out of scope here.
// Accessible name of the run-image step (there is no visible title on it).
export const IMAGE_STEP_LABEL = 'Your run'

const BAR_MS = 900
const LEVEL_UP_HOLD_MS = 900
const SCORE_MS = 700
const PERK_HOLD_MS = 450

const TITLES = {
  territory: 'Run Complete',
  training: 'Run saved',
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
  // Finished run ({points, distance, duration, avgPace, id}) for the final
  // "Your run" step - the same ShareRunCarousel Me -> History uses. No route
  // (fewer than 2 points) = no image step.
  run,
  // The equipped hero - last resort for the Hero Poster share card.
  heroFallback = null,
  onDismiss,
}) {
  const hasImage = (run?.points?.length || 0) >= 2
  const hasXp = Boolean(xpReward)
  // Every run with a route opens on the stats card first (a run with no XP
  // says so), then the image slide - Training included.
  const [step, setStep] = useState('rewards') // 'rewards' | 'image'
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

  // The finished run plus what this reward sequence knows, for the Overlay
  // image (score/XP lines only appear when there are any).
  const shareRun = useMemo(
    () => ({
      ...run,
      score: hasScore ? totalScore : undefined,
      xp: hasXp ? xpGained : undefined,
    }),
    [run, hasScore, totalScore, hasXp, xpGained]
  )

  const reduceMotionRef = useRef(reducedMotion())

  const [phase, setPhase] = useState('stats')
  const [barPct, setBarPct] = useState(beforeProgress?.pct ?? 0)
  const [displayLevel, setDisplayLevel] = useState(xpReward?.beforeLevel ?? 1)
  const [xpCount, setXpCount] = useState(0)
  // "XP 340 / 500": progress inside the level being shown. Starts at the OLD
  // value (the bar fills from there) and ends at the NEW one.
  const [xpInto, setXpInto] = useState(beforeProgress?.into ?? 0)
  const [xpSpan, setXpSpan] = useState(
    (leveledUp ? beforeProgress?.span : afterProgress?.span) ?? 1
  )
  // The bar snaps (no slide) when it resets to empty after a level-up.
  const [barSnap, setBarSnap] = useState(false)
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
    setBarSnap(true)
    setBarPct(afterProgress?.pct ?? 0)
    setXpInto(afterProgress?.into ?? 0)
    setXpSpan(afterProgress?.span ?? 1)
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

    // Counts a number from -> to over `ms` (same easing-free count the XP
    // number always used).
    function tween(from, to, ms, set) {
      const start = performance.now()
      function tick(ts) {
        if (skippedRef.current) return
        const t = Math.min(1, (ts - start) / ms)
        set(Math.round(from + (to - from) * t))
        if (t < 1) framesRef.current.push(requestAnimationFrame(tick))
      }
      framesRef.current.push(requestAnimationFrame(tick))
    }

    // Stats row is already visible (initial phase); XP starts almost
    // immediately so the card doesn't sit static for a beat first.
    after(250, () => {
      if (skippedRef.current) return
      setPhase('xp')
      requestAnimationFrame(() => {
        if (skippedRef.current || !hasXp) return
        setBarPct(leveledUp ? 1 : (afterProgress?.pct ?? 0))
        tween(0, xpGained, BAR_MS, setXpCount)
        tween(
          beforeProgress.into,
          leveledUp ? beforeProgress.span : afterProgress.into,
          BAR_MS,
          setXpInto
        )
      })

      let xpPhaseMs = hasXp ? BAR_MS : 0
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
          setBarSnap(true)
          setBarPct(0)
          setXpInto(0)
          setXpSpan(afterProgress.span)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (skippedRef.current) return
              setBarSnap(false)
              setBarPct(afterProgress.pct)
              tween(0, afterProgress.into, BAR_MS, setXpInto)
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
  const animating = !reached('total') && (hasXp || hasScore)
  const levelUpShown = leveledUp && reached('level-up')
  const noRewards = !hasXp && !hasScore

  // "Skip" only fast-forwards the animation (every number jumps to its final
  // value); the run image still follows - it is never skipped.
  function skipToNext() {
    skip()
    if (hasImage) setStep('image')
  }

  return (
    <motion.div
      className="run-rewards-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={skip}
    >
      <motion.div
        className={`run-rewards-card${step === 'image' ? ' is-image-step' : ' is-rewards-step'}`}
        // The image step has no visible heading any more, so the dialog is
        // named directly (the rewards step is named after its own title).
        role="dialog"
        aria-modal="true"
        aria-label={step === 'image' ? IMAGE_STEP_LABEL : title}
        initial={{ scale: 0.9, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The image panel is mounted from the start (hidden) so its canvases
            are drawn while the XP animation plays and it's ready on Next. */}
        {hasImage && (
          <motion.div
            className="run-rewards-image-step"
            hidden={step !== 'image'}
            initial={false}
            animate={
              step === 'image' && !reduceMotionRef.current
                ? { x: [48, 0], opacity: [0, 1] }
                : { x: 0, opacity: 1 }
            }
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <button
              type="button"
              className="game-close-btn run-rewards-image-close"
              aria-label="Close"
              onClick={onDismiss}
            >
              <IconClose />
            </button>
            <ShareRunCarousel run={shareRun} heroFallback={heroFallback} />
            <GameButton className="run-rewards-action" onClick={onDismiss}>
              Done
            </GameButton>
          </motion.div>
        )}
        <div
          className="gm-panel run-rewards-panel"
          data-tone="info"
          hidden={step === 'image'}
        >
          <TitleRibbon tone="info">
            <span role="heading" aria-level={3}>
              {title}
            </span>
          </TitleRibbon>
          <div className="gm-panel-inner has-ribbon run-rewards-main">
            <CompletedRunStats run={stats} />

            {noRewards && (
              <p className="run-rewards-note">
                No XP this time. Run a bit longer to earn XP.
              </p>
            )}

            {hasXp && reached('xp') && (
              <div className="run-rewards-section run-rewards-xp">
                <p className="run-rewards-xp-chip run-rewards-xp-gained">
                  +{formatNumber(xpCount)} XP
                </p>
                <div className="run-rewards-level-row">
                  <motion.span
                    className={`run-rewards-level-badge${levelUpShown ? ' is-up' : ''}`}
                    key={displayLevel}
                    initial={
                      levelUpShown && !reduceMotionRef.current
                        ? { scale: 0.6 }
                        : false
                    }
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 12 }}
                  >
                    <span className="run-rewards-level-num">
                      {displayLevel}
                    </span>
                    {levelUpShown && (
                      <span className="run-rewards-sparkles" aria-hidden="true">
                        <i>✦</i>
                        <i>✦</i>
                        <i>✦</i>
                        <i>✦</i>
                      </span>
                    )}
                  </motion.span>
                  <div className="run-rewards-bar-col">
                    <div
                      className={`run-rewards-bar-track${barSnap ? ' is-snap' : ''}`}
                      role="progressbar"
                      aria-label="XP progress"
                      aria-valuemin={0}
                      aria-valuemax={xpSpan}
                      aria-valuenow={xpInto}
                    >
                      <div
                        className="run-rewards-bar-fill"
                        style={{
                          width: `${Math.round(barPct * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="run-rewards-bar-text">
                      XP {formatNumber(xpInto)} / {formatNumber(xpSpan)}
                    </p>
                  </div>
                </div>
                {levelUpShown && (
                  <motion.p
                    className="run-rewards-level-up"
                    initial={
                      reduceMotionRef.current
                        ? false
                        : { scale: 0.6, opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  >
                    Level {xpReward.afterLevel}!
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
                  <HeroFigure hero={{ name: heroBonus.heroName }} height={40} />
                </span>
                <span className="run-rewards-perk-text">
                  <strong>{heroBonus.heroName}</strong>&apos;s perk added +
                  {Math.round(heroBonus.totalBonus)} {pointsLabel.toLowerCase()}
                </span>
              </motion.div>
            )}

            {reached('total') && (
              <GameButton
                className="run-rewards-action"
                onClick={hasImage ? () => setStep('image') : onDismiss}
              >
                {hasImage ? 'Next' : 'Continue'}
              </GameButton>
            )}
            {animating && (
              <button
                type="button"
                className="run-rewards-skip"
                onClick={skipToNext}
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
