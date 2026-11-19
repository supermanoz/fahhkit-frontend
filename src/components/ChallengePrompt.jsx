/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { motion, useReducedMotion } from 'framer-motion'
import { IconInfo } from './GameIcons'
import { getPvpModeByMeters } from '../api/pvp'
import { playerName } from '../utils/playerName'
import GameButton from '../game/ui/GameButton'
import Avatar from '../game/ui/Avatar'
import { Coin, VsBadge } from './pvp/PvpParts'
import './PvpPanel.css'

// Incoming PvP challenge: a call-to-arms card that drops in over the map
// whenever someone challenges the player (socket push or the usePvp poll)
// and stays until they Accept, Decline, or put it off with "Decide later".
export default function ChallengePrompt({
  challenge,
  busy,
  error,
  onAccept,
  onDecline,
  onLater,
}) {
  const reduceMotion = useReducedMotion()
  const distance =
    getPvpModeByMeters(challenge.distanceMeters)?.label ||
    `${challenge.distanceMeters} m`
  const rival = playerName(null, challenge.challengerName) || 'A runner'

  return (
    <motion.div
      className="challenge-prompt-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="challenge-prompt pvp-incoming"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="challenge-prompt-title"
        {...(reduceMotion
          ? {}
          : {
              initial: { y: -50, scale: 0.9, opacity: 0 },
              animate: { y: 0, scale: 1, opacity: 1 },
              exit: { y: -30, scale: 0.95, opacity: 0 },
              transition: { type: 'spring', stiffness: 380, damping: 24 },
            })}
      >
        <p className="pvp-incoming-kicker">Race challenge</p>
        <div className="pvp-incoming-duel" aria-hidden="true">
          <Avatar name={rival} size={56} ring="#4da3ff" />
          <VsBadge small />
          <Avatar name="You" size={56} ring="#6fdc82" />
        </div>
        <h3 id="challenge-prompt-title" className="pvp-incoming-title">
          {rival} wants to race you
        </h3>
        <div className="pvp-incoming-terms">
          <span className="pvp-incoming-term">
            <span className="pvp-incoming-label">Distance</span>
            <span className="pvp-incoming-value">{distance}</span>
          </span>
          <span className="pvp-incoming-term">
            <span className="pvp-incoming-label">You stake</span>
            <span className="pvp-incoming-value">
              <Coin /> {challenge.stakeAmount}
            </span>
          </span>
          <span className="pvp-incoming-term">
            <span className="pvp-incoming-label">Winner takes</span>
            <span className="pvp-incoming-value is-gold">
              <Coin /> {challenge.stakeAmount * 2}
            </span>
          </span>
        </div>
        <p className="pvp-incoming-note">
          <IconInfo /> Your coins lock in once you accept.
        </p>

        <div className="pvp-incoming-actions">
          <GameButton
            variant="success"
            size="lg"
            className="g-full-width"
            onClick={onAccept}
            loading={busy === 'accept'}
            disabled={Boolean(busy)}
          >
            Accept
          </GameButton>
          <GameButton
            variant="danger"
            size="lg"
            className="g-full-width"
            onClick={onDecline}
            loading={busy === 'decline'}
            disabled={Boolean(busy)}
          >
            Decline
          </GameButton>
        </div>
        {error && (
          <p className="pvp-incoming-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="pvp-incoming-later"
          onClick={onLater}
          disabled={Boolean(busy)}
        >
          Decide later
        </button>
      </motion.div>
    </motion.div>
  )
}
