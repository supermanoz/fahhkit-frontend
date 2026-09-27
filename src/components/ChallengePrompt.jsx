/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { motion } from 'framer-motion'
import { IconSwords } from './GameIcons'
import { getPvpModeByMeters } from '../api/pvp'
import { playerName } from '../utils/playerName'

// Incoming PvP challenge: a call-to-arms card that drops in over the map
// whenever someone challenges the player (socket push or the usePvp poll)
// and stays until they Accept, Decline, or put it off with "Later".
export default function ChallengePrompt({
  challenge,
  busy,
  error,
  onAccept,
  onDecline,
  onLater,
}) {
  const distance =
    getPvpModeByMeters(challenge.distanceMeters)?.label ||
    `${challenge.distanceMeters} m`

  return (
    <motion.div
      className="challenge-prompt-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="challenge-prompt"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="challenge-prompt-title"
        initial={{ y: -60, scale: 0.85, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: -40, scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      >
        <span className="challenge-prompt-emblem" aria-hidden="true">
          <IconSwords />
        </span>
        <p className="challenge-prompt-kicker">Race challenge!</p>
        <h3 id="challenge-prompt-title" className="challenge-prompt-title">
          {playerName(null, challenge.challengerName) || 'A runner'} wants to
          race you
        </h3>
        <div className="challenge-prompt-terms">
          <span className="challenge-prompt-term">
            <span className="challenge-prompt-term-label">Distance</span>
            <span className="challenge-prompt-term-value">{distance}</span>
          </span>
          <span className="challenge-prompt-term">
            <span className="challenge-prompt-term-label">Stake</span>
            <span className="challenge-prompt-term-value">
              <span className="game-coin" aria-hidden="true" />
              {challenge.stakeAmount}
            </span>
          </span>
        </div>
        <p className="challenge-prompt-note">
          Winner takes the whole pot. Stakes lock in once you accept.
        </p>

        <div className="challenge-prompt-actions">
          <button
            type="button"
            className="game-btn game-btn-red"
            onClick={onDecline}
            disabled={Boolean(busy)}
          >
            {busy === 'decline' ? '…' : 'Decline'}
          </button>
          <button
            type="button"
            className="game-btn game-btn-green"
            onClick={onAccept}
            disabled={Boolean(busy)}
          >
            {busy === 'accept' ? '…' : 'Accept'}
          </button>
        </div>
        {error && (
          <p className="game-controls-hint game-controls-hint-error">{error}</p>
        )}
        <button
          type="button"
          className="challenge-prompt-later"
          onClick={onLater}
          disabled={Boolean(busy)}
        >
          Decide later
        </button>
      </motion.div>
    </motion.div>
  )
}
