import { getJson, postJson, deleteJson } from './client'

export function getRuns(pageNumber = 1, noOfRecords = 500) {
  return postJson('/v1/run/find', { pageNumber, noOfRecords })
}

export function getRun(id) {
  return getJson(`/v1/run/${id}`)
}

// `data` may include the vehicle-detection telemetry useRunTracker's stop()
// attaches to a finished run (segments/vehicleExcludedMeters/
// vehicleSuspiciousRatio/maxSpeedMps/avgSpeedMps/stepCount/disputes) - sent
// as extra fields on the existing create payload, not a separate call. The
// backend re-validates the raw points independently either way (see
// TerritoryAntiCheatValidator) - these fields are for moderator audit, not
// the security boundary itself. See SESSION_NOTES.md's anti-cheat entry for
// the exact backend fields this expects.
//
// `data.clientRunId` is the run's idempotency key (same id -> the server
// returns the run it already created). The matching `Idempotency-Key` header is
// opt-in (VITE_IDEMPOTENCY_HEADER=true): a new request header must be on the
// backend's CORS allow-list first or every submit would fail its preflight.
const SEND_IDEMPOTENCY_HEADER =
  import.meta.env.VITE_IDEMPOTENCY_HEADER === 'true'

export function createRun(data) {
  return postJson(
    '/v1/run',
    data,
    SEND_IDEMPOTENCY_HEADER && data?.clientRunId
      ? { 'Idempotency-Key': data.clientRunId }
      : {}
  )
}

export function deleteRun(id) {
  return deleteJson(`/v1/run/${id}`)
}

// Score/result of a run once the server has processed it. For a PvP run the
// answer carries `pvpResult` (my race time, whether the rival has finished,
// won/lost) and is final for MY side as soon as it is READY.
export function getRunScore(id) {
  return getJson(`/v1/run/${id}/score-breakdown`)
}
