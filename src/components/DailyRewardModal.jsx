/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { IconCheck, IconClose, IconLock, IconGift } from './GameIcons'
import { resolveFileUrl } from '../api/client'
import { isNative } from '../utils/geo'
import { playSfx } from '../utils/gameSound'
import { formatCoins } from '../utils/format'
import {
  formatCountdown,
  splitCoins,
  tileState,
} from '../utils/dailyRewardState'
import './DailyRewardModal.css'
import GameButton from './ui/GameButton'

const FLY_COINS = 8
const FLY_START_MS = 700 // tile flip/burst first, then the coins leave
const FLY_STEP_MS = 110
const FLY_TRAVEL_MS = 750
const SPARKS = Array.from({ length: 10 }, (_, i) => ({
  a: (i / 10) * 360,
  d: 34 + (i % 3) * 10,
}))

function ItemArt({ item, className = '' }) {
  return item?.imageUrl ? (
    <img
      className={className}
      src={resolveFileUrl(item.imageUrl)}
      alt=""
      draggable="false"
    />
  ) : (
    <IconGift className={className} aria-hidden="true" />
  )
}

function RewardBits({ reward, big = false }) {
  return (
    <>
      {reward.coins > 0 && (
        <span className={`dr-bit${big ? ' is-big' : ''}`}>
          +{formatCoins(reward.coins)}
          <span className="game-coin" aria-hidden="true" />
        </span>
      )}
      {reward.xp > 0 && <span className="dr-bit dr-xp">+{reward.xp} XP</span>}
      {reward.item && (
        <span className="dr-bit dr-item">{reward.item.name}</span>
      )}
    </>
  )
}

function Tile({ reward, state, index, flipped, reduced }) {
  const special = reward.day === 7
  return (
    <motion.div
      className={`dr-tile is-${state}${special ? ' is-special' : ''}${
        flipped && !reduced ? ' is-flip' : ''
      }`}
      data-testid={`daily-tile-${reward.day}`}
      data-state={state}
      aria-label={`Day ${reward.day}, ${state}`}
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.9 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: state === 'today' && !special ? 1.08 : 1,
      }}
      transition={{
        delay: reduced ? 0 : 0.18 + index * 0.05,
        type: 'spring',
        damping: 16,
        stiffness: 300,
      }}
    >
      {special && <span className="dr-rays" aria-hidden="true" />}
      <span className="dr-day">Day {reward.day}</span>
      <div className="dr-ico" aria-hidden="true">
        {reward.item ? (
          <ItemArt item={reward.item} className="dr-item-art" />
        ) : reward.coins > 0 ? (
          <span className="game-coin dr-coin-lg" />
        ) : (
          <IconGift className="dr-item-art" />
        )}
      </div>
      <div className="dr-reward">
        <RewardBits reward={reward} />
      </div>
      {state === 'claimed' && (
        <span className="dr-stamp" aria-hidden="true">
          <IconCheck />
        </span>
      )}
      {state === 'locked' && (
        <span className="dr-lock" aria-hidden="true">
          <IconLock />
        </span>
      )}
      {flipped && !reduced && (
        <span className="dr-sparks" aria-hidden="true">
          {SPARKS.map((s, i) => (
            <i key={i} style={{ '--a': `${s.a}deg`, '--d': `${s.d}px` }} />
          ))}
        </span>
      )}
    </motion.div>
  )
}

export default function DailyRewardModal({
  open,
  onClose,
  state,
  balance,
  onClaim,
  onRetry,
  onSkipAnim,
  onAnimDone,
}) {
  const reduced = useReducedMotion()
  const { status, phase, result, error, skew, anim } = state
  const claimed = phase === 'claimed'
  const claiming = phase === 'claiming'
  const granted = claimed ? result?.granted : null
  const playing = anim === 'playing'

  const panelRef = useRef(null)
  const pillRef = useRef(null)
  const [now, setNow] = useState(() => Date.now())

  // ---- Balance shown in the pill ---------------------------------------
  // Before a claim this is just the real balance (opening the popup never
  // changes it). While the celebration plays it counts up from that value as
  // coins land; at the end it is set to the balance the SERVER returned.
  const [shown, setShown] = useState(balance ?? 0)
  const [xpShown, setXpShown] = useState(0)
  const [bump, setBump] = useState(0)
  const [fly, setFly] = useState(null)
  const preRef = useRef(balance ?? 0)
  useEffect(() => {
    if (!claimed && !claiming) {
      setShown(balance ?? 0)
      preRef.current = balance ?? 0
    }
  }, [balance, claimed, claiming])
  useEffect(() => {
    if (claiming) preRef.current = shown
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot on claim start only
  }, [claiming])

  // ---- Celebration timeline (skippable) --------------------------------
  const finalBalance = result?.balance
  const grantedKey = granted ? `${result.streak}:${result.nextClaimAt}` : null
  useEffect(() => {
    if (!granted) return undefined
    const finish = () => {
      // The final figures are the server's, whatever the animation showed.
      if (finalBalance != null) setShown(finalBalance)
      setXpShown(granted.xp || 0)
      setFly(null)
    }
    playSfx('chime')
    if (isNative) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    else navigator.vibrate?.(40)

    if (!playing) {
      finish()
      return undefined
    }

    // Where the coins fly from/to, relative to the panel.
    const panel = panelRef.current?.getBoundingClientRect()
    const tile = panelRef.current
      ?.querySelector(`[data-testid="daily-tile-${result.todayIndex}"]`)
      ?.getBoundingClientRect()
    const pill = pillRef.current?.getBoundingClientRect()
    const timers = []
    if (panel && tile && pill) {
      const from = {
        x: tile.left + tile.width / 2 - panel.left,
        y: tile.top + tile.height / 2 - panel.top,
      }
      const to = {
        x: pill.left + pill.width / 2 - panel.left,
        y: pill.top + pill.height / 2 - panel.top,
      }
      setFly({ from, to })
    }
    const parts = splitCoins(granted.coins, FLY_COINS)
    let landed = 0
    let xpLanded = 0
    parts.forEach((part, i) => {
      timers.push(
        setTimeout(
          () => {
            landed += part
            xpLanded = Math.round(((granted.xp || 0) * (i + 1)) / parts.length)
            setShown(preRef.current + landed)
            setXpShown(xpLanded)
            setBump((b) => b + 1)
            playSfx('tick')
          },
          FLY_START_MS + i * FLY_STEP_MS + FLY_TRAVEL_MS
        )
      )
    })
    timers.push(
      setTimeout(
        () => {
          finish()
          onAnimDone?.()
        },
        FLY_START_MS + parts.length * FLY_STEP_MS + FLY_TRAVEL_MS + 350
      )
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per claim
  }, [grantedKey])
  // Skip (tap) or any other end of the animation: jump to the final state.
  useEffect(() => {
    if (granted && anim === 'done') {
      if (finalBalance != null) setShown(finalBalance)
      setXpShown(granted.xp || 0)
      setFly(null)
    }
  }, [anim, granted, finalBalance])

  // ---- Countdown + Esc --------------------------------------------------
  const waitUntil =
    status && !status.claimable && status.nextClaimAt
      ? Date.parse(status.nextClaimAt)
      : null
  useEffect(() => {
    if (!open || !waitUntil) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open, waitUntil])
  const remaining = waitUntil ? waitUntil - (now + skew) : 0
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const rewards = useMemo(() => status?.rewards || [], [status])
  const today = status?.todayIndex
  const ready = Boolean(status)
  const loading = !ready && phase !== 'error'
  const canClaim = ready && status.claimable && !claimed

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dr-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Daily Reward"
            className="dr-panel"
            data-testid="daily-reward-modal"
            initial={
              reduced ? { opacity: 0 } : { scale: 0.8, opacity: 0, y: 24 }
            }
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.92, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0.15 }
                : { type: 'spring', damping: 13, stiffness: 280, mass: 0.8 }
            }
            onClick={(e) => {
              e.stopPropagation()
              if (playing) onSkipAnim?.() // tap anywhere skips the celebration
            }}
          >
            <div className="dr-banner">
              <span className="dr-banner-text">Daily Reward</span>
            </div>
            <button
              type="button"
              className="game-close-btn dr-x"
              aria-label="Close"
              onClick={onClose}
            >
              <IconClose />
            </button>

            <div className="dr-head">
              <span className="dr-streak" data-testid="daily-streak">
                <span className="dr-flame" aria-hidden="true">
                  <i className="dr-flame-a" />
                  <i className="dr-flame-b" />
                </span>
                {ready ? `${status.streak}-day streak` : 'Daily streak'}
              </span>
              <div className="dr-pills">
                {granted?.xp > 0 && (
                  <span className="dr-pill dr-pill-xp" data-testid="daily-xp">
                    +{xpShown} XP
                  </span>
                )}
                <span
                  ref={pillRef}
                  className="dr-pill"
                  data-testid="daily-balance"
                  aria-label={`${shown} Fahhcoin`}
                >
                  <motion.span
                    key={bump}
                    className="dr-pill-in"
                    initial={bump && !reduced ? { scale: 1.25 } : false}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 8, stiffness: 400 }}
                  >
                    {formatCoins(shown)}
                    <span className="game-coin" aria-hidden="true" />
                  </motion.span>
                </span>
              </div>
            </div>

            {loading && (
              <div className="dr-state" role="status">
                Loading your reward…
              </div>
            )}
            {phase === 'error' && !ready && (
              <div className="dr-state dr-error" role="alert">
                <p>{error || 'Could not load your daily reward.'}</p>
                <GameButton variant="neutral" size="sm" onClick={onRetry}>
                  Try again
                </GameButton>
              </div>
            )}

            {ready && (
              <div className="dr-grid">
                {rewards.slice(0, 6).map((r, i) => (
                  <Tile
                    key={r.day}
                    reward={r}
                    index={i}
                    state={tileState(status, r.day)}
                    flipped={claimed && r.day === today}
                    reduced={reduced}
                  />
                ))}
                {rewards[6] && (
                  <Tile
                    reward={rewards[6]}
                    index={6}
                    state={tileState(status, 7)}
                    flipped={claimed && today === 7}
                    reduced={reduced}
                  />
                )}
              </div>
            )}

            {/* coins flying tile -> balance pill */}
            {fly && playing && !reduced && (
              <div className="dr-fly" aria-hidden="true">
                {Array.from({
                  length: Math.min(FLY_COINS, granted.coins || 1),
                }).map((_, i) => {
                  const { from, to } = fly
                  const mx = (from.x + to.x) / 2 + (i % 2 ? 40 : -40)
                  const my = Math.min(from.y, to.y) - 60
                  return (
                    <motion.span
                      key={i}
                      className="game-coin dr-fly-coin"
                      initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.4 }}
                      animate={{
                        x: [from.x, mx, to.x],
                        y: [from.y, my, to.y],
                        opacity: [0, 1, 1, 0],
                        scale: [0.4, 1.2, 0.8],
                      }}
                      transition={{
                        delay: FLY_START_MS / 1000 + (i * FLY_STEP_MS) / 1000,
                        duration: FLY_TRAVEL_MS / 1000,
                        times: [0, 0.45, 1],
                        ease: 'easeInOut',
                      }}
                    />
                  )
                })}
                {granted.coins > 0 && (
                  <motion.span
                    className="dr-float"
                    initial={{ opacity: 0, x: fly.to.x, y: fly.to.y + 16 }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      y: [fly.to.y + 16, fly.to.y + 40, fly.to.y + 70],
                    }}
                    transition={{
                      delay: (FLY_START_MS + FLY_TRAVEL_MS) / 1000,
                      duration: 1.1,
                    }}
                  >
                    +{formatCoins(granted.coins)}
                  </motion.span>
                )}
              </div>
            )}

            {granted?.item && (
              <motion.div
                className="dr-reveal"
                data-testid="daily-item-reveal"
                initial={
                  reduced ? false : { scale: 0.4, opacity: 0, rotate: -6 }
                }
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{
                  delay: reduced ? 0 : 1.6,
                  type: 'spring',
                  damping: 10,
                  stiffness: 260,
                }}
              >
                <ItemArt item={granted.item} className="dr-reveal-art" />
                <span>
                  <small>New item unlocked</small>
                  <strong>{granted.item.name}</strong>
                </span>
              </motion.div>
            )}
            {granted && !granted.item && (
              <motion.div
                className="dr-got"
                data-testid="daily-granted"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.5 }}
              >
                You got <RewardBits reward={granted} />
              </motion.div>
            )}
            {granted?.item && (
              <span className="dr-sr" data-testid="daily-granted">
                You got {granted.item.name}
              </span>
            )}

            {ready && error && !claimed && (
              <p
                className="dr-inline-error"
                role="alert"
                data-testid="daily-error"
              >
                {error}
              </p>
            )}

            {canClaim && (
              <GameButton
                size="lg"
                fullWidth
                className="dr-claim"
                loading={claiming}
                onClick={onClaim}
              >
                {error ? 'Try again' : 'Claim'}
              </GameButton>
            )}
            {ready && !canClaim && !claimed && (
              <GameButton
                size="lg"
                fullWidth
                className="dr-claim"
                disabled
                data-testid="daily-claim-disabled"
              >
                Claim
              </GameButton>
            )}
            {ready && !canClaim && (
              <div className="dr-wait" data-testid="daily-wait">
                <span className="dr-wait-label">Come back in 24h</span>
                {waitUntil && (
                  <span className="dr-timer" data-testid="daily-countdown">
                    {formatCountdown(remaining)}
                  </span>
                )}
              </div>
            )}
            {playing && <p className="dr-skip">Tap to skip</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
