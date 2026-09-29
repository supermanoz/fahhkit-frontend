/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import HeroSprite from './HeroSprite'
import './IdleNudge.css'

// Rotated so a player who idles a lot doesn't get the exact same line every
// time. `action` decides what the big button does: "run" starts a territory
// run, "battle" opens the Race (PvP) tab.
const NUDGE_LINES = [
  {
    shout: 'Come on…',
    line: "Don't you wanna run? Fk it, let's do it! 🏃",
    cta: "Fk it, let's go!",
    action: 'run',
  },
  {
    shout: 'Hellooo? 👀',
    line: 'That territory isn’t gonna claim itself. Fk it, let’s go!',
    cta: "Fk it, let's go!",
    action: 'run',
  },
  {
    shout: 'Legs asleep?',
    line: 'One loop. Just one. Fk it, let’s do it! 🔥',
    cta: "Fk it, let's go!",
    action: 'run',
  },
  {
    shout: "Let's battle! ⚔️",
    line: 'Someone out there thinks they’re faster than you. Prove them wrong.',
    cta: 'Find a rival',
    action: 'battle',
  },
  {
    shout: 'Fight me! 🥊',
    line: 'Race a real runner, winner takes the coins. Fk it, let’s battle!',
    cta: "Let's battle!",
    action: 'battle',
  },
  {
    shout: 'Bored? ⚡',
    line: 'Nothing cures boredom like smoking a rival over 1 km. Let’s battle!',
    cta: "Let's battle!",
    action: 'battle',
  },
]

// Pops up when the player's been sitting on the map doing nothing (see the
// idle timer in GamePage) - a centered card over a dark scrim, same as the
// game's other pop-ups (ChallengePrompt, the confirm/buy cards), with Blaze
// leaning over the top of the speech bubble instead of standing beside it.
// Tapping the scrim dismisses it, same as everywhere else in the game.
export default function IdleNudge({ onRun, onBattle, onDismiss, character }) {
  const { shout, line, cta, action } = useMemo(
    () => NUDGE_LINES[Math.floor(Math.random() * NUDGE_LINES.length)],
    []
  )

  return (
    <motion.div
      className="idle-nudge-backdrop"
      onClick={onDismiss}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="idle-nudge"
        role="dialog"
        aria-label="Time to run?"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 40, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 380, damping: 20 }}
      >
        <motion.div
          className="idle-nudge-character"
          initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 14,
            delay: 0.1,
          }}
        >
          {character || <HeroSprite size={148} />}
        </motion.div>

        <div className="idle-nudge-bubble">
          <p className="idle-nudge-shout">{shout}</p>
          <p className="idle-nudge-line">{line}</p>
          <div className="idle-nudge-actions">
            <button
              type="button"
              className={`idle-nudge-go ${action === 'battle' ? 'is-battle' : ''}`}
              onClick={action === 'battle' ? onBattle : onRun}
            >
              {cta}
            </button>
            <button
              type="button"
              className="idle-nudge-later"
              onClick={onDismiss}
            >
              Not now
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
