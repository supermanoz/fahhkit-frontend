// Late uploads. A run recorded offline is uploaded when the phone is back
// online. Backend rule (territory.late-max-age-hours, default 48): a
// territory run uploaded 48 h or more after it ended still earns XP and its
// pace/effort score but never claims or takes territory (outcome
// LATE_NO_TERRITORY). Older than run.max-submission-age-days (14) is refused
// outright (RUN_TOO_OLD).
export const LATE_TERRITORY_HOURS = 48
export const MAX_SUBMISSION_AGE_DAYS = 14

const HOUR_MS = 3600 * 1000

export function runAgeHours(endedAt, now = Date.now()) {
  const t = new Date(endedAt).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (now - t) / HOUR_MS)
}

// Would a territory run that ended at `endedAt` be too late for territory if
// it were uploaded `now`?
export function isLateForTerritory(endedAt, now = Date.now()) {
  return runAgeHours(endedAt, now) >= LATE_TERRITORY_HOURS
}

// Hours left before a queued territory run stops being able to claim
// territory; 0 once it is already too late.
export function hoursLeftForTerritory(endedAt, now = Date.now()) {
  return Math.max(0, LATE_TERRITORY_HOURS - runAgeHours(endedAt, now))
}

export const LATE_TERRITORY_COPY = Object.freeze({
  title: 'Uploaded too late for territory ⏰',
  message: `This run was uploaded more than ${LATE_TERRITORY_HOURS} hours after it ended, so it earns XP and score but can't claim territory. Upload offline runs within ${LATE_TERRITORY_HOURS} hours to keep the land.`,
  queuedWarning: `Upload within ${LATE_TERRITORY_HOURS} hours of the run or it won't claim territory.`,
})

// Upload deadline for a queued run: the server refuses a run older than
// run.max-submission-age-days (RUN_TOO_OLD).
export const expiresAtMs = (endedAt) =>
  new Date(endedAt).getTime() + MAX_SUBMISSION_AGE_DAYS * 24 * HOUR_MS

export function daysLeftToUpload(endedAt, now = Date.now()) {
  const t = expiresAtMs(endedAt)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.ceil((t - now) / (24 * HOUR_MS)))
}
