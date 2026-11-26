/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import GameButton from './ui/GameButton'
import { formatDistance, formatDuration, formatRunDate } from '../utils/run'
import { RUN_STATUS } from '../utils/runOutbox'
import { isTerritoryMode } from '../utils/postRun'
import {
  LATE_TERRITORY_COPY,
  daysLeftToUpload,
  hoursLeftForTerritory,
  isLateForTerritory,
} from '../utils/runLate'
import './OfflineRuns.css'

const LABEL = {
  [RUN_STATUS.WAITING]: 'Waiting for internet',
  [RUN_STATUS.UPLOADING]: 'Uploading…',
  [RUN_STATUS.DONE]: 'Done',
  [RUN_STATUS.FAILED]: 'Failed',
}

// A queued Conquer run still waiting past the 48 h mark (or close to it): it
// will earn XP and score but not territory.
function lateNote(r, now) {
  if (r.status === RUN_STATUS.DONE || r.status === RUN_STATUS.FAILED)
    return null
  if (!isTerritoryMode(r.summary.mode)) return null
  if (isLateForTerritory(r.summary.endedAt, now))
    return 'Too late for territory - it will still earn XP and score.'
  const left = hoursLeftForTerritory(r.summary.endedAt, now)
  return left <= 12
    ? `${LATE_TERRITORY_COPY.queuedWarning} About ${Math.max(1, Math.ceil(left))} h left.`
    : null
}

// "Uploads must happen within N days" - shown for runs still waiting.
function expiryNote(r, now) {
  if (r.status !== RUN_STATUS.WAITING) return null
  const days = daysLeftToUpload(r.summary.endedAt, now)
  if (days == null) return null
  if (days === 0) return 'Expires today - connect now to keep it.'
  return days <= 3
    ? `Expires in ${days} day${days === 1 ? '' : 's'} - connect to upload it.`
    : null
}

// Runs recorded on this phone and their upload status (Me tab). Failed and
// waiting runs can be exported as GPX and deleted (a waiting run only after a
// confirm - it may be the only copy); uploading runs can't be deleted. Failed
// runs can also be retried. Done runs stay a day, then disappear on their own.
export default function PendingRunsList({
  runs,
  onRetry,
  onDelete,
  onSync,
  onExport,
  now = Date.now(),
}) {
  const [confirmId, setConfirmId] = useState(null)
  const [exportError, setExportError] = useState('')
  if (!runs || runs.length === 0) return null
  const waiting = runs.some((r) => r.status === RUN_STATUS.WAITING)

  async function handleExport(r) {
    setExportError('')
    try {
      await onExport?.(r)
    } catch {
      setExportError("Couldn't export that run. Please try again.")
    }
  }

  return (
    <section className="game-me-section" data-testid="pending-runs">
      <p className="game-menu-section-title">Pending runs</p>
      {waiting && onSync && (
        <GameButton
          size="sm"
          variant="neutral"
          data-testid="pending-sync"
          onClick={onSync}
        >
          Sync now
        </GameButton>
      )}
      {exportError && (
        <p className="pending-run-error" role="alert">
          {exportError}
        </p>
      )}
      <ul className="pending-runs-list">
        {runs.map((r) => {
          const late = lateNote(r, now)
          const expiry = expiryNote(r, now)
          const canExport =
            onExport &&
            (r.status === RUN_STATUS.WAITING || r.status === RUN_STATUS.FAILED)
          const canDelete =
            r.status === RUN_STATUS.FAILED || r.status === RUN_STATUS.WAITING
          const tooOld =
            r.status === RUN_STATUS.FAILED &&
            r.error?.errorCode === 'RUN_TOO_OLD'
          return (
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
                {late && (
                  <span
                    className="pending-run-error"
                    data-testid="pending-run-late"
                  >
                    {late}
                  </span>
                )}
                {expiry && (
                  <span
                    className="pending-run-error"
                    data-testid="pending-run-expiry"
                  >
                    {expiry}
                  </span>
                )}
                {r.status === RUN_STATUS.FAILED && r.error?.message && (
                  <span className="pending-run-error">{r.error.message}</span>
                )}
              </div>
              {confirmId === r.clientRunId ? (
                <div
                  className="pending-run-actions"
                  data-testid="pending-confirm"
                >
                  <span className="pending-run-error">
                    This run hasn&apos;t been saved on the server yet. Delete
                    it?
                  </span>
                  <GameButton
                    size="sm"
                    variant="neutral"
                    onClick={() => setConfirmId(null)}
                  >
                    Keep
                  </GameButton>
                  <GameButton
                    size="sm"
                    variant="danger"
                    data-testid="pending-confirm-delete"
                    onClick={() => {
                      setConfirmId(null)
                      onDelete(r.clientRunId)
                    }}
                  >
                    Delete
                  </GameButton>
                </div>
              ) : (
                <div className="pending-run-actions">
                  {r.status === RUN_STATUS.FAILED && !tooOld && (
                    <GameButton
                      size="sm"
                      variant="neutral"
                      onClick={() => onRetry(r.clientRunId)}
                    >
                      Retry
                    </GameButton>
                  )}
                  {canExport && (
                    <GameButton
                      size="sm"
                      variant="neutral"
                      data-testid="pending-export"
                      onClick={() => handleExport(r)}
                    >
                      Export GPX
                    </GameButton>
                  )}
                  {canDelete && (
                    <GameButton
                      size="sm"
                      variant="danger"
                      data-testid="pending-delete"
                      onClick={() =>
                        r.status === RUN_STATUS.WAITING
                          ? setConfirmId(r.clientRunId)
                          : onDelete(r.clientRunId)
                      }
                    >
                      Delete
                    </GameButton>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
