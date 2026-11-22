/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { GamePanel, GameActions } from '../game/ui/GameModal'
import GameButton from '../game/ui/GameButton'
import { IconFlag, IconRunning, IconSwords } from './GameIcons'
import { TOUR_ACTIONS, TOUR_COPY, tourStepLabel } from '../constants/tourCopy'
import {
  measureTarget,
  placeTooltip,
  sameRect,
  SPOT_PAD,
} from '../utils/tourLayout'
import './GameTour.css'
import { visibleInterval } from '../utils/visibleInterval'

const MODE_ICON = {
  training: IconRunning,
  conquer: IconFlag,
  pvp: IconSwords,
}

const EDGE = 12 // minimum distance from the screen edge
const POLL_MS = 120
// How long a target may stay missing/hidden before its step is skipped. The
// radial buttons spring in, so give them a moment.
const MISSING_MS = 1600

function spotStyle(rect) {
  const w = rect.w + SPOT_PAD * 2
  const h = rect.h + SPOT_PAD * 2
  const round = Math.abs(w - h) < 10
  return {
    left: rect.x - SPOT_PAD,
    top: rect.y - SPOT_PAD,
    width: w,
    height: h,
    borderRadius: round ? 9999 : 18,
  }
}

// The first-time walkthrough overlay. A full-screen blocker swallows every
// tap (so nothing underneath is hit by accident); the "hole" is only an
// outline + a dimming shadow around the target. `step` carries the target
// selector, `copy` is read from constants/tourCopy.js.
export default function GameTour({
  step,
  index,
  count,
  paused = false,
  speaker = null,
  canStartTraining = true,
  onNext,
  onBack,
  onSkip,
  onStartTraining,
  onMissing,
}) {
  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const [rect, setRect] = useState(null)
  const [layout, setLayout] = useState(null)
  const missingSince = useRef(null)
  const missingRef = useRef(onMissing)
  missingRef.current = onMissing
  const stepId = step?.id
  const selector = step?.target ?? null

  // Follow the target (it springs in, the viewport can resize/rotate, the
  // keyboard can open): poll cheaply and only set state on a real change.
  useEffect(() => {
    if (paused || !stepId) return undefined
    missingSince.current = null
    const tick = () => {
      const r = measureTarget(selector)
      setRect((prev) => (sameRect(prev, r) ? prev : r))
      if (selector && !r) {
        missingSince.current ??= Date.now()
        if (Date.now() - missingSince.current > MISSING_MS) {
          missingSince.current = Date.now()
          missingRef.current?.(1)
        }
      } else {
        missingSince.current = null
      }
    }
    tick()
    const stopPoll = visibleInterval(tick, POLL_MS, 'tour-rect-poll')
    window.addEventListener('resize', tick)
    window.addEventListener('orientationchange', tick)
    return () => {
      stopPoll()
      window.removeEventListener('resize', tick)
      window.removeEventListener('orientationchange', tick)
    }
  }, [stepId, selector, paused])

  // Reset between steps so the old spotlight never lingers on the new text.
  useEffect(() => {
    setRect(null)
  }, [stepId])

  const place = useCallback(() => {
    const root = rootRef.current
    const card = cardRef.current
    if (!root || !card) return
    const cs = getComputedStyle(root)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const bounds = {
      left: Math.max(EDGE, parseFloat(cs.paddingLeft) || 0),
      right: vw - Math.max(EDGE, parseFloat(cs.paddingRight) || 0),
      top: Math.max(EDGE, parseFloat(cs.paddingTop) || 0),
      bottom: vh - Math.max(EDGE, parseFloat(cs.paddingBottom) || 0),
    }
    const natural = card.firstElementChild?.scrollHeight ?? card.offsetHeight
    setLayout(
      placeTooltip({
        rect,
        card: { w: Math.min(360, bounds.right - bounds.left), h: natural },
        bounds,
      })
    )
  }, [rect])

  useLayoutEffect(() => {
    place()
  }, [place, stepId, paused])
  useEffect(() => {
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [place])

  // Escape = back (or close on step 1), same as the Android back button.
  useEffect(() => {
    if (paused) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (index > 0) onBack?.()
      else onSkip?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused, index, onBack, onSkip])

  // Keep the primary action focused for keyboard/screen-reader users.
  useEffect(() => {
    if (paused || !stepId) return
    cardRef.current?.querySelector('[data-tour-primary]')?.focus({
      preventScroll: true,
    })
  }, [stepId, paused])

  if (!step || paused) return null
  const copy = TOUR_COPY[step.id]
  if (!copy) return null
  const last = step.cta
  const first = index === 0
  const hasTarget = Boolean(selector)
  const cardStyle = layout
    ? {
        left: layout.left,
        top: layout.top,
        width: layout.width,
        maxHeight: layout.maxHeight,
        '--tour-arrow-x': `${layout.arrowX}px`,
      }
    : { visibility: 'hidden' }

  return (
    <div
      ref={rootRef}
      className="game-tour"
      data-testid="game-tour"
      data-step={step.id}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`game-tour-scrim${hasTarget && rect ? ' has-hole' : ''}`}
        aria-hidden="true"
      />
      {hasTarget && rect && (
        <div
          className="game-tour-spot"
          style={spotStyle(rect)}
          aria-hidden="true"
        />
      )}
      <div
        ref={cardRef}
        className={`game-tour-card is-${layout?.mode ?? 'center'}`}
        style={cardStyle}
        role="dialog"
        aria-label={copy.title}
      >
        <GamePanel className="game-tour-panel">
          <div className="game-tour-inner">
            <div className="game-tour-top">
              <span
                className="game-tour-dots"
                role="img"
                aria-label={tourStepLabel(index, count)}
              >
                {Array.from({ length: count }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i === index ? 'is-on' : i < index ? 'is-done' : ''
                    }
                  />
                ))}
              </span>
              <button type="button" className="game-tour-skip" onClick={onSkip}>
                {TOUR_ACTIONS.skip}
              </button>
            </div>
            <div className="game-tour-head">
              {step.id === 'welcome' && speaker && (
                <span className="game-tour-speaker">{speaker}</span>
              )}
              <div className="game-tour-text">
                {copy.body && <p className="game-tour-body">{copy.body}</p>}
              </div>
            </div>
            {copy.modes && (
              <ul className="game-tour-modes">
                {copy.modes.map((m) => {
                  const Icon = MODE_ICON[m.id]
                  return (
                    <li key={m.id} className={`game-tour-mode is-${m.id}`}>
                      <span className="game-tour-mode-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="game-tour-mode-text">
                        <b>{m.name}</b> <span>{m.line}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {last ? (
              <GameActions stacked>
                {canStartTraining && (
                  <GameButton
                    variant="success"
                    size="lg"
                    onClick={onStartTraining}
                    data-tour-primary
                  >
                    {TOUR_ACTIONS.startTraining}
                  </GameButton>
                )}
                <GameButton
                  variant="secondary"
                  size="lg"
                  onClick={onSkip}
                  {...(canStartTraining ? {} : { 'data-tour-primary': true })}
                >
                  {TOUR_ACTIONS.explore}
                </GameButton>
              </GameActions>
            ) : (
              <div className="game-tour-nav">
                {!first && (
                  <GameButton variant="secondary" size="lg" onClick={onBack}>
                    {TOUR_ACTIONS.back}
                  </GameButton>
                )}
                <GameButton
                  variant="success"
                  size="lg"
                  onClick={onNext}
                  data-tour-primary
                >
                  {TOUR_ACTIONS.next}
                </GameButton>
              </div>
            )}
          </div>
        </GamePanel>
        {layout && layout.mode !== 'center' && (
          <span className="game-tour-arrow" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
