/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { motion } from 'framer-motion'
import { IconClose, IconMegaphone } from './GameIcons'
import { resolveFileUrl, toClubRoleWords } from '../api/client'

// News/announcement broadcasts, front and center the moment the game opens
// (see GamePage's broadcastQueue) instead of waiting for the player to find
// them in the Mail tab - a title-bar dialog in the middle of the screen,
// same shape as a mobile game's "Events" popup (banner image, title, body,
// one big action button) rather than a small bottom-anchored toast.
export default function BroadcastPrompt({ broadcast, hasMore, onDismiss }) {
  return (
    <motion.div
      className="broadcast-prompt-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="broadcast-prompt"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="broadcast-prompt-title"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      >
        <div className="broadcast-prompt-titlebar">
          <IconMegaphone aria-hidden="true" />
          <span>Announcement</span>
          <button
            type="button"
            className="broadcast-prompt-close"
            onClick={onDismiss}
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className="broadcast-prompt-content">
          {broadcast.imageUrl && (
            <img
              className="broadcast-prompt-image"
              src={resolveFileUrl(broadcast.imageUrl)}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <h3 id="broadcast-prompt-title" className="broadcast-prompt-title">
            {toClubRoleWords(broadcast.title)}
          </h3>
          {/* Every broadcast comes from the Game Mechanics admin tool - the
              underlying mail carries whichever staff account published it,
              but that's an implementation detail, not something a player
              needs to see. */}
          <p className="broadcast-prompt-meta">Admin</p>
          {broadcast.body && (
            <p className="broadcast-prompt-body">
              {toClubRoleWords(broadcast.body)}
            </p>
          )}
          <button
            type="button"
            className="game-btn game-btn-green broadcast-prompt-action"
            onClick={onDismiss}
          >
            {hasMore ? 'Next' : 'Got it'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
