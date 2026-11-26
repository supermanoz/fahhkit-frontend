/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { GameModal, GameActions } from '../game/ui/GameModal'
import GameButton from './ui/GameButton'
import {
  calculatePaceMinPerKm,
  formatDistance,
  formatDuration,
  formatPace,
} from '../utils/run'
import { isTerritoryMode } from '../utils/postRun'
import { LATE_TERRITORY_COPY, MAX_SUBMISSION_AGE_DAYS } from '../utils/runLate'
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
            Your run is saved on this phone and will upload by itself when
            you&apos;re back online.
          </p>
          <p
            className="game-end-run-summary"
            data-testid="offline-saved-deadline"
          >
            It has to reach the server within {MAX_SUBMISSION_AGE_DAYS} days of
            the run.
          </p>
          {/* Territory only exists for a Conquer run - Training, PvP and Club
              War never show it, and only Conquer has the 48 h limit. */}
          <p className="offline-saved-pending">
            {isTerritoryMode(s.mode)
              ? 'XP · Coins · Territory: '
              : 'XP · Coins: '}
            <b>pending</b>
          </p>
          {isTerritoryMode(s.mode) && (
            <p
              className="game-end-run-summary"
              data-testid="offline-saved-late-warning"
            >
              {LATE_TERRITORY_COPY.queuedWarning}
            </p>
          )}
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
