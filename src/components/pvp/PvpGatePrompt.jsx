/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { motion, useReducedMotion } from 'framer-motion'
import { IconCrosshairs, IconInfo, IconMap } from '../GameIcons'
import GameButton from '../../game/ui/GameButton'

// The two popups in front of PvP (no clouds yet - they come after, on
// success): "Turn on Visibility" and, if location permission is off,
// "Location is off". Game popup style, same as the other dialogs.
//
// The "what others see" line is what the backend actually returns to a nearby
// search (NearbyPlayerResponse): full name, photo, level and the distance from
// the searcher, within the searcher's radius (2 km by default). It does NOT
// include coordinates, but exact distances are shown, so the copy does not
// promise your location is hidden.
export const VISIBILITY_SEES =
  'While it is on, runners within about 2 km can see your name, photo, level and how far away you are.'

export default function PvpGatePrompt({
  variant = 'visibility',
  busy = false,
  error = null,
  canOpenSettings = false,
  onTurnOn,
  onNotNow,
  onOpenSettings,
}) {
  const reduceMotion = useReducedMotion()
  const isLocation = variant === 'location'
  return (
    <motion.div
      className="game-confirm-overlay pvp-gate-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={busy ? undefined : onNotNow}
    >
      <motion.div
        className="pvp-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pvp-gate-title"
        onClick={(e) => e.stopPropagation()}
        {...(reduceMotion
          ? {}
          : {
              initial: { opacity: 0, scale: 0.92, y: 10 },
              animate: { opacity: 1, scale: 1, y: 0 },
              exit: { opacity: 0, scale: 0.95 },
              transition: { type: 'spring', stiffness: 420, damping: 28 },
            })}
      >
        <span className="pvp-gate-icon" aria-hidden="true">
          {isLocation ? <IconMap /> : <IconCrosshairs />}
        </span>
        <h2 id="pvp-gate-title" className="pvp-gate-title">
          {isLocation ? 'Location is off' : 'Turn on Visibility'}
        </h2>
        {isLocation ? (
          <p className="pvp-gate-body">
            PvP needs your location to find runners near you. Turn location on
            for Run Conquest, then come back.
          </p>
        ) : (
          <>
            <p className="pvp-gate-body">
              PvP lets runners challenge each other nearby. Turn on Visibility
              so rivals can find you.
            </p>
            <p className="pvp-gate-info">
              <IconInfo />
              <span>{VISIBILITY_SEES}</span>
            </p>
            <p className="pvp-gate-fine">
              You can turn it off anytime in Settings.
            </p>
          </>
        )}
        {error && (
          <p className="pvp-gate-error" role="alert">
            {error}
          </p>
        )}
        <div className="pvp-gate-actions">
          {isLocation ? (
            canOpenSettings ? (
              <GameButton
                variant="success"
                size="lg"
                className="g-full-width"
                onClick={onOpenSettings}
              >
                Open Settings
              </GameButton>
            ) : null
          ) : (
            <GameButton
              variant="success"
              size="lg"
              className="g-full-width"
              onClick={onTurnOn}
              loading={busy}
            >
              {error ? 'Try again' : 'Turn On'}
            </GameButton>
          )}
          <GameButton
            variant="secondary"
            size="lg"
            className="g-full-width"
            onClick={onNotNow}
            disabled={busy}
          >
            {isLocation && !canOpenSettings ? 'OK' : 'Not Now'}
          </GameButton>
        </div>
      </motion.div>
    </motion.div>
  )
}
