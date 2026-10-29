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
export function createRun(data) {
  return postJson('/v1/run', data)
}

export function deleteRun(id) {
  return deleteJson(`/v1/run/${id}`)
}
