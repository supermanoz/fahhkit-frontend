/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import GameButton from './ui/GameButton'
import { IconClock, IconTrophy } from './GameIcons'
import { RivalHero } from './pvp/PvpParts'
import { playSfx } from '../utils/gameSound'
import { SERVER_REJECTED_COPY } from '../constants/runMessages'
import { formatCoins } from '../utils/format'
import { coinChange, formatRaceTime } from '../utils/pvpResult'
import './PvpResultPopup.css'

// The PvP post-run popup. One panel that grows with the news:
//   calculating -> my race time counts up -> (waiting for rival | WIN / LOSE /
//   DRAW with both times) -> coins fly into the HUD and the balance counts up.
// Every number is a server value (race times, wallet balances); nothing about
// coins or the winner is computed here. Tap the panel to skip the animation.
const TIME_MS = 900
const COIN_MS = 800
const FLY_COINS = 8

function useCountUp(target, { active, ms, onTick, instant }) {
  const [value, setValue] = useState(instant ? target : 0)
  const tickRef = useRef(onTick)
  tickRef.current = onTick
  useEffect(() => {
    if (target == null) return undefined
    if (!active || instant) {
      setValue(target)
      return undefined
    }
    let raf
    let last = -1
    const t0 = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms)
      const eased = 1 - (1 - p) ** 3
      const v = Math.round(target * eased)
      setValue(v)
      if (v !== last) {
        last = v
        tickRef.current?.(v, p)
      }
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, active, ms, instant])
  return value
}

function Skeleton({ w = 120, h = 34 }) {
  return (
    <span
      className="pvp-pr-skel"
      style={{ width: w, height: h }}
      aria-hidden="true"
    />
  )
}

const INVALID_COPY = {
  DISTANCE_NOT_MET:
    'The full race distance wasn’t covered, so this run didn’t count.',
  CHEAT_DETECTED: SERVER_REJECTED_COPY,
}

function bannerFor(view) {
  if (!view.valid) return { tone: 'calm', title: 'Run didn’t count' }
  switch (view.outcome) {
    case 'win':
      return {
        tone: 'win',
        title: view.forfeit ? 'You won!' : 'You won!',
        sub: view.forfeit ? `${view.opponentName} forfeited the race.` : null,
      }
    case 'lose':
      return {
        tone: 'calm',
        title: 'Good race',
        sub: `${view.opponentName} took this one. On to the next.`,
      }
    case 'draw':
      return {
        tone: 'draw',
        title: 'It’s a tie',
        sub: 'Dead heat - stakes are refunded.',
      }
    case 'refund':
      return {
        tone: 'draw',
        title: 'Race called off',
        sub: 'Stakes are refunded.',
      }
    default:
      return null
  }
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : '+0')

function PointsCard({ view }) {
  const { total, win, race } = view.points
  const tone = total > 0 ? 'is-up' : total < 0 ? 'is-down' : 'is-zero'
  const sub =
    win != null && race != null
      ? `Win: ${signed(win)} / Race: ${signed(race)}`
      : view.outcome === 'win'
        ? 'Race won'
        : view.outcome === 'lose'
          ? 'Race lost'
          : 'Race over'
  return (
    <div className="pvp-pr-card is-points" data-testid="pvp-points">
      <span className="pvp-pr-label">Points</span>
      <span className={`pvp-pr-big pvp-pr-points ${tone}`}>
        {signed(total)}
      </span>
      <span className="pvp-pr-note">{sub}</span>
    </div>
  )
}

export default function PvpResultPopup({
  status, // 'submitting' | 'submitted' | 'error' | 'offline'
  error,
  view,
  delayed,
  distanceText,
  paceText,
  balanceBefore,
  balanceAfter,
  settled,
  onBalanceTick, // (n|null) -> HUD coin value while the count-up runs
  onDone,
  onDetails,
  onRetry,
  alreadySeen = false, // re-opened after it was shown: no replay
  rivalHero = null, // { name, id, color } - the rival's equipped hero, when known
  heroCatalog,
}) {
  const reduced = useReducedMotion()
  const [skipped, setSkipped] = useState(false)
  const instant = reduced || skipped || alreadySeen
  const [timeDone, setTimeDone] = useState(instant)
  const [coinPhase, setCoinPhase] = useState(instant ? 'done' : 'idle')
  const panelRef = useRef(null)
  const coinsRef = useRef(null)
  const [fly, setFly] = useState(null)
  const playedFinalRef = useRef(alreadySeen)

  const calculating =
    status === 'submitting' || (status === 'submitted' && !view.hasOwn)
  const showOwn = status === 'submitted' && view.hasOwn
  const banner = showOwn && view.resolved ? bannerFor(view) : null

  // 1. my race time counts up the moment it arrives
  const time = useCountUp(view.raceTimeSeconds, {
    active: showOwn,
    ms: TIME_MS,
    instant,
    onTick: (_v, p) => p < 1 && playSfx('tick'),
  })
  useEffect(() => {
    if (!showOwn || timeDone) return undefined
    const t = setTimeout(() => setTimeDone(true), instant ? 0 : TIME_MS + 150)
    return () => clearTimeout(t)
  }, [showOwn, timeDone, instant])

  // 2. coins - only once the race is decided AND the server's balance is known
  const change = coinChange(balanceBefore, balanceAfter)
  const wins = view.outcome === 'win'
  const gains = change != null && change > 0
  useEffect(() => {
    if (!view.resolved || !timeDone || balanceAfter == null) return
    if (playedFinalRef.current) {
      setCoinPhase('done')
      return
    }
    playedFinalRef.current = true
    if (instant || !gains) {
      setCoinPhase('done')
      if (wins) playSfx('chime')
      return
    }
    // burst: coins leave the score card for the HUD balance
    const from = coinsRef.current?.getBoundingClientRect()
    const to = document
      .querySelector('.game-hud .game-hud-icon-coin')
      ?.getBoundingClientRect()
    if (from && to) {
      setFly({
        from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
        to: { x: to.left + to.width / 2, y: to.top + to.height / 2 },
      })
    }
    setCoinPhase('counting')
    playSfx('chime')
    const end = setTimeout(() => {
      setCoinPhase('done')
      setFly(null)
    }, COIN_MS + 500)
    return () => clearTimeout(end)
    // one run per resolution
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.resolved, timeDone, balanceAfter])

  const shownBalance = useCountUp(balanceAfter, {
    active: coinPhase === 'counting',
    ms: COIN_MS,
    instant: coinPhase !== 'counting',
  })
  // Count-up from the OLD balance (the hook counts from 0).
  const balanceNow =
    coinPhase === 'counting' && balanceAfter != null && balanceBefore != null
      ? Math.round(
          balanceBefore +
            (balanceAfter - balanceBefore) *
              (balanceAfter ? shownBalance / balanceAfter : 1)
        )
      : coinPhase === 'idle'
        ? balanceBefore
        : balanceAfter
  useEffect(() => {
    if (coinPhase === 'counting') onBalanceTick?.(balanceNow)
    else if (coinPhase === 'done') onBalanceTick?.(null)
    // Result is in but the coins haven't flown yet: the HUD keeps the OLD
    // balance meanwhile (the wallet refresh already has the new one).
    else if (view.resolved && balanceBefore != null)
      onBalanceTick?.(balanceBefore)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinPhase, balanceNow])
  useEffect(() => () => onBalanceTick?.(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  const diff =
    view.resolved &&
    view.raceTimeSeconds != null &&
    view.opponentRaceTimeSeconds != null
      ? Math.abs(view.raceTimeSeconds - view.opponentRaceTimeSeconds)
      : null

  const title =
    banner?.title ||
    (showOwn ? 'Race time in' : calculating ? 'Calculating…' : 'PvP race')
  const toneClass = banner ? `is-${banner.tone}` : ''

  return (
    <motion.div
      className="pvp-pr-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        aria-label={title}
        className={`pvp-pr-panel ${toneClass}`}
        data-testid="pvp-result"
        data-phase={
          status !== 'submitted'
            ? status
            : !view.hasOwn
              ? 'calculating'
              : view.resolved
                ? 'final'
                : 'waiting'
        }
        data-outcome={view.outcome}
        initial={reduced ? { opacity: 0 } : { y: 40, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={
          reduced
            ? { duration: 0.12 }
            : { type: 'spring', damping: 18, stiffness: 300 }
        }
        onClick={() => setSkipped(true)}
      >
        <div className={`pvp-pr-banner ${toneClass}`}>
          <span className="pvp-pr-banner-text">{title}</span>
        </div>
        {banner?.sub && <p className="pvp-pr-sub">{banner.sub}</p>}

        {status === 'error' && (
          <div className="pvp-pr-state" role="alert">
            <p className="pvp-pr-lead">Couldn’t send your run</p>
            <p className="pvp-pr-note">
              {error || 'Something went wrong.'} Your run is safe on this phone.
            </p>
          </div>
        )}
        {status === 'offline' && (
          <div className="pvp-pr-state" role="status">
            <p className="pvp-pr-lead">No internet</p>
            <p className="pvp-pr-note">
              PvP results need a connection. Your run is saved on this phone and
              will be sent as soon as you’re back online.
            </p>
          </div>
        )}

        {(calculating || showOwn) && (
          <>
            {/* RACE TIME - the PvP "score" */}
            <div className="pvp-pr-card" data-testid="pvp-time">
              <span className="pvp-pr-label">
                <IconClock /> Your race time
              </span>
              {calculating || !view.valid ? (
                calculating ? (
                  <Skeleton w={150} h={44} />
                ) : (
                  <span className="pvp-pr-big is-void">--:--</span>
                )
              ) : (
                <span className="pvp-pr-big">{formatRaceTime(time)}</span>
              )}
              {showOwn && !view.valid && (
                <span className="pvp-pr-note">
                  {INVALID_COPY[view.invalidReason] ||
                    'This run didn’t count for the race.'}
                </span>
              )}
              {showOwn && view.heroBonus && view.valid && (
                <span className="pvp-pr-chip">
                  {view.heroBonus.heroName} saved{' '}
                  {formatRaceTime(view.heroBonus.timeSavedSeconds)}
                </span>
              )}
              {(distanceText || paceText) && (
                <span className="pvp-pr-meta">
                  {[distanceText, paceText].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>

            {/* RIVAL - waiting, then side by side */}
            {showOwn && timeDone && (
              <div className="pvp-pr-versus" data-testid="pvp-versus">
                {view.resolved ? (
                  <>
                    <div className={`pvp-pr-side ${wins ? 'is-won' : ''}`}>
                      <span className="pvp-pr-side-name">You</span>
                      <span className="pvp-pr-side-time">
                        {view.valid
                          ? formatRaceTime(view.raceTimeSeconds)
                          : '--:--'}
                      </span>
                    </div>
                    <span className="pvp-pr-vs">VS</span>
                    <div
                      className={`pvp-pr-side ${view.outcome === 'lose' ? 'is-won' : ''}`}
                    >
                      <RivalHero
                        hero={rivalHero}
                        catalog={heroCatalog}
                        name={view.opponentName}
                        size={30}
                      />
                      <span className="pvp-pr-side-name">
                        {view.opponentName}
                      </span>
                      <span className="pvp-pr-side-time">
                        {view.opponentRaceTimeSeconds != null
                          ? formatRaceTime(view.opponentRaceTimeSeconds)
                          : '--:--'}
                      </span>
                    </div>
                    {diff != null && diff > 0 && (
                      <span className="pvp-pr-diff">
                        {formatRaceTime(diff)}{' '}
                        {view.outcome === 'win' ? 'faster' : 'behind'}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="pvp-pr-waiting" data-testid="pvp-waiting">
                    <RivalHero
                      hero={rivalHero}
                      catalog={heroCatalog}
                      name={view.opponentName}
                      size={30}
                    />
                    <span className="pvp-pr-live" aria-hidden="true" />
                    {view.opponentSubmitted
                      ? `${view.opponentName} just finished - settling the race…`
                      : `Waiting for ${view.opponentName} to finish`}
                  </div>
                )}
              </div>
            )}

            {/* POINTS - only when the server reported them */}
            {showOwn && timeDone && view.resolved && view.points && (
              <PointsCard view={view} />
            )}

            {/* FAHHCOINS */}
            {showOwn && timeDone && (
              <div
                className="pvp-pr-card is-coins"
                ref={coinsRef}
                data-testid="pvp-coins"
              >
                <span className="pvp-pr-label">
                  <IconTrophy /> Fahhcoins
                </span>
                {!view.resolved ? (
                  <span className="pvp-pr-pot">
                    {view.stake != null
                      ? `${formatCoins(Number(view.stake) * 2)} pot on the line`
                      : 'Decided when the race ends'}
                  </span>
                ) : balanceAfter == null && !settled ? (
                  <Skeleton w={130} h={34} />
                ) : (
                  <>
                    <span className="pvp-pr-balance">
                      <span
                        className="game-coin pvp-pr-coin"
                        aria-hidden="true"
                      />
                      {formatCoins(balanceNow ?? balanceAfter ?? 0)}
                    </span>
                    <span className="pvp-pr-note">
                      {gains
                        ? `+${formatCoins(change)} from the pot`
                        : view.outcome === 'lose' && view.stake != null
                          ? `${formatCoins(view.stake)} stake went to the winner`
                          : view.outcome === 'draw' || view.outcome === 'refund'
                            ? 'Stake refunded'
                            : 'Balance updated'}
                    </span>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {delayed && calculating && (
          <p
            className="pvp-pr-note is-delay"
            role="status"
            data-testid="pvp-delayed"
          >
            Still processing - we’ll let you know the moment your result is
            ready. You can close this.
          </p>
        )}

        <div className="pvp-pr-actions" onClick={(e) => e.stopPropagation()}>
          {status === 'error' && (
            <GameButton size="lg" fullWidth sound onClick={onRetry}>
              Try again
            </GameButton>
          )}
          <GameButton
            size="lg"
            fullWidth
            sound
            variant={status === 'error' ? 'neutral' : 'primary'}
            data-testid="pvp-done"
            onClick={onDone}
          >
            Done
          </GameButton>
          {showOwn && onDetails && (
            <GameButton variant="neutral" fullWidth sound onClick={onDetails}>
              View Details
            </GameButton>
          )}
        </div>
      </motion.div>

      {fly && !reduced && (
        <div className="pvp-pr-fly" aria-hidden="true">
          {Array.from({ length: FLY_COINS }).map((_, i) => (
            <motion.span
              key={i}
              className="game-coin pvp-pr-fly-coin"
              initial={{ x: fly.from.x, y: fly.from.y, opacity: 0, scale: 0.4 }}
              animate={{
                x: [
                  fly.from.x,
                  (fly.from.x + fly.to.x) / 2 + (i % 2 ? 50 : -50),
                  fly.to.x,
                ],
                y: [fly.from.y, Math.min(fly.from.y, fly.to.y) - 60, fly.to.y],
                opacity: [0, 1, 1, 0],
                scale: [0.4, 1.2, 0.7],
              }}
              transition={{
                delay: i * 0.07,
                duration: 0.7,
                times: [0, 0.45, 1],
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
