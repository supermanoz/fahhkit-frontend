/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { motion, useReducedMotion } from 'framer-motion'
import Avatar from '../game/ui/Avatar'
import GameButton from './ui/GameButton'
import {
  IconArea,
  IconCheck,
  IconClose,
  IconCrosshairs,
  IconRunning,
  IconTrophy,
} from './GameIcons'
import './TerritoryPopup.css'

// "Whose ground is this?" card shown when a territory is tapped. Pure view:
// every decision (can the player run it, what is the distance, what happens on
// a press) is made by GamePage and passed in, so behaviour lives in one place.
//
// Layout: header (avatar ring in the territory colour, caption, owner name,
// close) -> stat tiles -> distance row -> actions. Light panel, dark body text
// in the UI font; the display font only for the name and the numbers.
const NEAR_START_METERS = 30 // "you are already at the start"

function Tile({ icon, label, value, testId }) {
  return (
    <div className="tp-tile" data-testid={testId}>
      <span className="tp-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tp-tile-value">{value}</span>
      <span className="tp-tile-label">{label}</span>
    </div>
  )
}

export default function TerritoryPopup({
  status = 'ready', // 'ready' | 'loading' | 'error'
  isMine,
  name,
  avatarSrc,
  color,
  level, // only passed when known (own territory)
  clubTag, // only passed when known
  areaText,
  scoreText,
  startDistanceText, // "267 m", or null when unknown (no GPS)
  startDistanceMeters,
  hasLocation,
  canRun, // the territory has a loop to run at all
  runBlockedReason, // string -> Run button disabled with this reason
  hasVisibleParcels,
  warning, // size/distance warning text (Continue anyway / Cancel)
  onClose,
  onRun,
  onForceRun,
  onCancelWarning,
  onProfile,
  onRetry,
}) {
  const reduced = useReducedMotion()
  const title = isMine ? 'Your Territory' : 'Territory owner'
  const near =
    startDistanceMeters != null && startDistanceMeters <= NEAR_START_METERS

  return (
    <motion.div
      className="game-highlight-toast game-territory-popup tp-card"
      role="dialog"
      aria-label={isMine ? 'Your territory' : `${name}'s territory`}
      data-testid="territory-popup"
      data-status={status}
      style={{ '--tp-accent': color || 'var(--game-gold, #ff7a29)' }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
      transition={
        reduced
          ? { duration: 0.12 }
          : { type: 'spring', damping: 20, stiffness: 320 }
      }
    >
      <div className="game-highlight-toast-header tp-header">
        {status === 'loading' ? (
          <span className="tp-skel tp-skel-avatar" aria-hidden="true" />
        ) : (
          <Avatar
            src={avatarSrc}
            name={name}
            ring={color || 'var(--game-gold)'}
            size={60}
            className="game-highlight-toast-avatar tp-avatar"
            holdUntilLoaded
          />
        )}
        {level != null && status === 'ready' && (
          <span className="tp-level" aria-label={`Level ${level}`}>
            {level}
          </span>
        )}
        <div className="game-highlight-toast-owner tp-owner">
          <p className="game-highlight-toast-owner-label tp-caption">{title}</p>
          {status === 'loading' ? (
            <span className="tp-skel tp-skel-name" aria-hidden="true" />
          ) : (
            <h3>{isMine ? 'You' : name}</h3>
          )}
          {clubTag && status === 'ready' && (
            <span className="tp-club">[{clubTag}]</span>
          )}
        </div>
        <GameButton
          variant="danger"
          size="sm"
          iconOnly
          sound
          aria-label="Close"
          className="game-highlight-toast-close tp-close"
          onClick={onClose}
        >
          <IconClose />
        </GameButton>
      </div>

      {status === 'error' ? (
        <div className="tp-state" role="alert">
          <p>Couldn’t load this territory.</p>
          <GameButton variant="neutral" sound onClick={onRetry}>
            Try again
          </GameButton>
        </div>
      ) : (
        <>
          <div className="game-territory-stats tp-tiles">
            {status === 'loading' ? (
              <>
                <span className="tp-skel tp-skel-tile" aria-hidden="true" />
                <span className="tp-skel tp-skel-tile" aria-hidden="true" />
              </>
            ) : (
              <>
                <Tile
                  testId="tp-area"
                  icon={<IconArea />}
                  label="Area held"
                  value={areaText}
                />
                <Tile
                  testId="tp-score"
                  icon={<IconTrophy />}
                  label="Run score"
                  value={scoreText}
                />
              </>
            )}
          </div>

          {status === 'ready' && !hasVisibleParcels && (
            <p className="tp-hint">
              Nothing of theirs is in view right now — try exploring the map.
            </p>
          )}

          {status === 'ready' && warning && (
            <>
              <p className="tp-hint is-warn" role="alert">
                {warning}
              </p>
              <div className="tp-actions is-row">
                <GameButton variant="neutral" sound onClick={onCancelWarning}>
                  Cancel
                </GameButton>
                <GameButton sound onClick={onForceRun}>
                  Continue anyway
                </GameButton>
              </div>
            </>
          )}

          {status === 'ready' && !warning && (
            <>
              {canRun && (
                <p
                  className={`game-territory-distance tp-distance${near ? ' is-near' : ''}`}
                  data-testid="tp-distance"
                >
                  <span className="tp-distance-icon" aria-hidden="true">
                    {near ? <IconCheck /> : <IconCrosshairs />}
                  </span>
                  <span className="tp-distance-text">
                    {!hasLocation || startDistanceText == null ? (
                      <>
                        <strong>Distance unknown</strong>
                        <span>Turn on location to find the start point.</span>
                      </>
                    ) : near ? (
                      <>
                        <strong>You’re at the start point</strong>
                        <span>Ready when you are.</span>
                      </>
                    ) : (
                      <>
                        <strong>{startDistanceText} away</strong>
                        <span>
                          Your guide will steer you to the start point first
                        </span>
                      </>
                    )}
                  </span>
                </p>
              )}
              <div className="tp-actions">
                {canRun && (
                  <>
                    <GameButton
                      size="lg"
                      fullWidth
                      sound
                      icon={<IconRunning />}
                      disabled={Boolean(runBlockedReason)}
                      className="tp-run"
                      data-testid="tp-run"
                      onClick={onRun}
                    >
                      {isMine ? 'Defend This Territory' : 'Run This Territory'}
                    </GameButton>
                    {runBlockedReason && (
                      <p className="tp-reason" data-testid="tp-reason">
                        {runBlockedReason}
                      </p>
                    )}
                  </>
                )}
                <GameButton
                  variant="neutral"
                  fullWidth
                  sound
                  data-testid="tp-profile"
                  onClick={onProfile}
                >
                  View Profile
                </GameButton>
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  )
}
