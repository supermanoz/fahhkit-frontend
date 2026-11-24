/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import GameButton from './ui/GameButton'
import { formatDistance, formatDuration, formatRunDate } from '../utils/run'
import { RUN_STATUS } from '../utils/runOutbox'
import './OfflineRuns.css'

const LABEL = {
  [RUN_STATUS.WAITING]: 'Waiting for internet',
  [RUN_STATUS.UPLOADING]: 'Uploading…',
  [RUN_STATUS.DONE]: 'Done',
  [RUN_STATUS.FAILED]: 'Failed',
}

// Runs recorded on this phone and their upload status (Me tab). Failed runs
// can be retried or deleted; waiting/uploading runs can't be deleted (they are
// the only copy). Done runs stay a day, then disappear on their own.
export default function PendingRunsList({ runs, onRetry, onDelete }) {
  if (!runs || runs.length === 0) return null
  return (
    <section className="game-me-section" data-testid="pending-runs">
      <p className="game-menu-section-title">Pending runs</p>
      <ul className="pending-runs-list">
        {runs.map((r) => (
          <li
            key={r.clientRunId}
            className={`pending-run is-${r.status}`}
            data-status={r.status}
          >
            <div className="pending-run-main">
              <span className="pending-run-title">
                {formatDistance(r.summary.distance)} ·{' '}
                {formatDuration(r.summary.duration)}
              </span>
              <span className="pending-run-date">
                {formatRunDate(r.summary.startedAt)}
              </span>
              <span className={`pending-run-chip is-${r.status}`}>
                {LABEL[r.status]}
              </span>
              {r.status === RUN_STATUS.FAILED && r.error?.message && (
                <span className="pending-run-error">{r.error.message}</span>
              )}
            </div>
            {r.status === RUN_STATUS.FAILED && (
              <div className="pending-run-actions">
                <GameButton
                  size="sm"
                  variant="neutral"
                  onClick={() => onRetry(r.clientRunId)}
                >
                  Retry
                </GameButton>
                <GameButton
                  size="sm"
                  variant="danger"
                  onClick={() => onDelete(r.clientRunId)}
                >
                  Delete
                </GameButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
