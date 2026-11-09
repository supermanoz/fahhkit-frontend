/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { motion } from 'framer-motion'
import { IconClose, IconCrown } from './GameIcons'
import { parseSeasonDateTime } from '../utils/seasonCountdown'
import './SeasonBanner.css'

// Opened by tapping the season banner slide (see SeasonBanner.jsx). Shows
// only what the backend actually exposes about the season (seasonNumber,
// status, start/end) plus static flavor text - no prize amounts, since
// SeasonMedalRewardProperties (the only rank-reward config that exists) is
// server-side-only config with no endpoint, not something this modal can
// honestly show a figure for. No "Season Prize" placeholder existed in this
// codebase before this component, so there's nothing stale to remove here.
export default function SeasonPrizeModal({ season, onClose }) {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  })
  const startLabel = formatOrNull(season?.startDate, dateFormatter)
  const endLabel = formatOrNull(season?.endDate, dateFormatter)

  return (
    <motion.div
      className="season-prize-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="season-prize-card"
        role="dialog"
        aria-modal="true"
        aria-label="Season prize details"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="game-close-btn season-prize-close"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>

        <div className="season-prize-header">
          <IconCrown aria-hidden="true" />
          <h2>Reclaiming the Crown</h2>
          {season?.seasonNumber != null && (
            <p className="season-prize-subtitle">
              Season {season.seasonNumber}
            </p>
          )}
        </div>

        <p className="season-prize-body">
          Climb the Leaderboard before the season closes - top racers and clubs
          walk away with exclusive season-end rewards once the crown is decided.
        </p>

        {(startLabel || endLabel) && (
          <dl className="season-prize-dates">
            {startLabel && (
              <div>
                <dt>Started</dt>
                <dd>{startLabel}</dd>
              </div>
            )}
            {endLabel && (
              <div>
                <dt>Ends</dt>
                <dd>{endLabel}</dd>
              </div>
            )}
          </dl>
        )}
      </motion.div>
    </motion.div>
  )
}

function formatOrNull(value, formatter) {
  const ms = parseSeasonDateTime(value)
  if (ms == null) return null
  return formatter.format(new Date(ms))
}
