/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { IconClose } from './GameIcons'
import { ChestIcon } from './DailyChest'
import { isNative } from '../utils/geo'
import { playSfx } from '../utils/gameSound'
import { formatCoins } from '../utils/format'
import { splitCoins } from '../utils/dailyRewardState'
import './DailyRewardModal.css' // shared popup tokens (panel, banner, close)
import './WelcomeBonusModal.css'
import GameButton from './ui/GameButton'

const OPEN_AT_MS = 650 // chest wobbles shut, then opens
const FLY_START_MS = 850
const FLY_STEP_MS = 90
const FLY_TRAVEL_MS = 700
const FLY_COINS = 10
const CONFETTI = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  x: ((i % 12) - 5.5) * 20 + ((i * 7) % 9),
  d: (i % 8) * 0.05,
  h: [48, 8, 140, 200, 280, 25][i % 6],
}))

// Where the coins land: the HUD Fahhcoin icon (purely visual - the header
// balance already includes the bonus and is never touched here).
function hudCoinRect() {
  return document
    .querySelector('.game-hud .game-hud-icon-coin')
    ?.getBoundingClientRect()
}

export default function WelcomeBonusModal({
  open,
  amount,
  name,
  ack, // 'idle' | 'sending' | 'failed'
  error,
  onContinue, // "Let's Run": acknowledge, then close
  onDismiss, // X / backdrop / Esc
}) {
  const reduced = useReducedMotion()
  const panelRef = useRef(null)
  const chestRef = useRef(null)
  const timers = useRef([])
  const [stage, setStage] = useState('closed') // closed -> open
  const [count, setCount] = useState(0)
  const [fly, setFly] = useState(null)
  const [done, setDone] = useState(false)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const finish = () => {
    clearTimers()
    setStage('open')
    setCount(amount)
    setFly(null)
    setDone(true)
  }

  // The celebration. Tap anywhere skips to the end; reduced motion = static.
  useEffect(() => {
    if (!open) return undefined
    setDone(false)
    if (reduced) {
      setStage('open')
      setCount(amount)
      setDone(true)
      return undefined
    }
    setStage('closed')
    setCount(0)
    const at = (ms, fn) => timers.current.push(setTimeout(fn, ms))
    at(OPEN_AT_MS, () => {
      setStage('open')
      playSfx('chime')
      if (isNative)
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      else navigator.vibrate?.(40)
    })
    at(FLY_START_MS - 100, () => {
      const panel = panelRef.current?.getBoundingClientRect()
      const chest = chestRef.current?.getBoundingClientRect()
      const hud = hudCoinRect()
      if (panel && chest) {
        const from = {
          x: chest.left + chest.width / 2 - panel.left,
          y: chest.top + chest.height / 2 - panel.top,
        }
        const to = hud
          ? {
              x: hud.left + hud.width / 2 - panel.left,
              y: hud.top + hud.height / 2 - panel.top,
            }
          : { x: panel.width - 30, y: -30 }
        setFly({ from, to })
      }
    })
    let total = 0
    const parts = splitCoins(amount, FLY_COINS)
    parts.forEach((part, i) => {
      at(FLY_START_MS + i * FLY_STEP_MS, () => {
        total += part
        setCount(total)
        playSfx('tick')
      })
    })
    at(FLY_START_MS + parts.length * FLY_STEP_MS + FLY_TRAVEL_MS + 250, finish)
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per showing
  }, [open, amount, reduced])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onDismiss()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  const title = `Welcome, ${name || 'Runner'}!`
  const sending = ack === 'sending'
  const coinsOut = Math.min(FLY_COINS, Math.max(1, amount))

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dr-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.2 }}
          onClick={onDismiss}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="dr-panel wb-panel"
            data-testid="welcome-bonus-modal"
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
              if (!done) finish() // tap anywhere skips the animation
            }}
          >
            <div className="dr-banner wb-banner">
              <span className="dr-banner-text wb-title">{title}</span>
            </div>
            <button
              type="button"
              className="game-close-btn dr-x"
              aria-label="Close"
              onClick={onDismiss}
            >
              <IconClose />
            </button>

            <div className="wb-stage" ref={chestRef}>
              <motion.div
                key={stage}
                initial={
                  reduced || stage === 'closed' ? false : { scale: 0.85 }
                }
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 8, stiffness: 320 }}
              >
                <ChestIcon
                  mode={stage === 'open' ? 'claimable' : 'closed'}
                  size={124}
                />
              </motion.div>
              {stage === 'open' && !reduced && (
                <div className="wb-confetti" aria-hidden="true">
                  {CONFETTI.map((c) => (
                    <i
                      key={c.id}
                      style={{
                        '--x': `${c.x}px`,
                        '--d': `${c.d}s`,
                        '--h': c.h,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="wb-amount" data-testid="welcome-bonus-amount">
              <span className="wb-plus dr-outline">+{formatCoins(count)}</span>
              <span className="game-coin wb-coin" aria-hidden="true" />
              <span className="wb-unit dr-outline">Fahhcoins</span>
            </div>
            <p className="wb-line">
              Use them for heroes, trails and more in the Shop.
            </p>

            {fly && !done && !reduced && (
              <div className="dr-fly" aria-hidden="true">
                {Array.from({ length: coinsOut }).map((_, i) => {
                  const { from, to } = fly
                  const mx = (from.x + to.x) / 2 + (i % 2 ? 50 : -50)
                  const my = Math.min(from.y, to.y) - 40
                  return (
                    <motion.span
                      key={i}
                      className="game-coin dr-fly-coin"
                      initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.4 }}
                      animate={{
                        x: [from.x, mx, to.x],
                        y: [from.y, my, to.y],
                        opacity: [0, 1, 1, 0],
                        scale: [0.4, 1.2, 0.7],
                      }}
                      transition={{
                        delay: (FLY_START_MS + i * FLY_STEP_MS) / 1000 - 0.75,
                        duration: FLY_TRAVEL_MS / 1000,
                        times: [0, 0.45, 1],
                        ease: 'easeInOut',
                      }}
                    />
                  )
                })}
              </div>
            )}

            {ack === 'failed' && error && (
              <p
                className="dr-inline-error"
                role="alert"
                data-testid="welcome-bonus-error"
              >
                {error}
              </p>
            )}
            <GameButton
              size="lg"
              fullWidth
              className="dr-claim"
              data-testid="welcome-bonus-continue"
              loading={sending}
              onClick={onContinue}
            >
              {ack === 'failed' ? 'Try again' : "Let's Run"}
            </GameButton>
            {!done && <p className="dr-skip">Tap to skip</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
