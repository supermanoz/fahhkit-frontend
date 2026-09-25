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
// idle timer in GamePage). The character is Blaze's run-cycle sprite by
// default; pass `character` (any node, e.g. an <img>) to swap in other art.
export default function IdleNudge({ onRun, onBattle, onDismiss, character }) {
  const { shout, line, cta, action } = useMemo(
    () => NUDGE_LINES[Math.floor(Math.random() * NUDGE_LINES.length)],
    []
  )

  return (
    <motion.div
      className="idle-nudge"
      role="dialog"
      aria-label="Time to run?"
      initial={{ opacity: 0, y: 80, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 60, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 380, damping: 20 }}
    >
      <motion.div
        className="idle-nudge-character"
        initial={{ x: -60, rotate: -8 }}
        animate={{ x: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 }}
      >
        {character || <HeroSprite size={128} />}
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
  )
}
