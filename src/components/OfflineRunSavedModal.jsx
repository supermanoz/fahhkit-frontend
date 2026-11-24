/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { GameModal, GameActions } from '../game/ui/GameModal'
import GameButton from './ui/GameButton'
import {
  calculatePaceMinPerKm,
  formatDistance,
  formatDuration,
  formatPace,
} from '../utils/run'
import './OfflineRuns.css'

// Shown right after a run ends with no connection (or the upload could not
// reach the server): the run is safely on the phone and uploads by itself.
// XP / coins / territory are PENDING - no numbers are invented here.
export default function OfflineRunSavedModal({ run, onClose }) {
  const s = run?.summary
  return (
    <GameModal
      open={Boolean(run)}
      onClose={onClose}
      tone="info"
      title="Run saved"
      overlayClassName="game-end-run-overlay"
    >
      {s && (
        <>
          <div
            className="offline-saved-stats"
            data-testid="offline-saved-stats"
          >
            <span>
              <b>{formatDistance(s.distance)}</b>
              <i>Distance</i>
            </span>
            <span>
              <b>{formatPace(calculatePaceMinPerKm(s.distance, s.duration))}</b>
              <i>Pace</i>
            </span>
            <span>
              <b>{formatDuration(s.duration)}</b>
              <i>Time</i>
            </span>
          </div>
          <p
            className="offline-saved-status"
            data-testid="offline-saved-status"
          >
            <span className="offline-saved-dot" aria-hidden="true" />
            Waiting for internet to submit
          </p>
          <p className="game-end-run-summary">
            Turn on Wi-Fi or mobile data to submit your run and get
            XP/territory.
          </p>
          <p className="offline-saved-pending">
            XP · Coins · Territory: <b>pending</b>
          </p>
        </>
      )}
      <GameActions>
        <GameButton onClick={onClose} data-testid="offline-saved-ok">
          Got it
        </GameButton>
      </GameActions>
    </GameModal>
  )
}
