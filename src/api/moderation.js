import { getJson, postJson } from './client'

// Anti-cheat review queue (FraudFlagController in the FahhKit backend) and
// the moderator-only run inspector it needs to review a flag against. Every
// endpoint here is gated server-side to ADMIN/MODERATOR (fks.moderator.auth
// in the backend's SecurityConfig - not just a frontend role check), except
// the actual lock/unlock action which is ADMIN only - see lockUser below.

// status omitted = every flag regardless of status. Page (.content/.totalPages).
export function findFraudFlags(status, pageNumber = 1, noOfRecords = 20) {
  const query = status ? `?status=${status}` : ''
  return postJson(`/v1/fraud-flag/find${query}`, { pageNumber, noOfRecords })
}

export function getFraudFlagsForUser(userId) {
  return getJson(`/v1/fraud-flag/user/${userId}`)
}

// Manually raise a flag against a player (runId optional - omit for a
// general flag not tied to one run).
export function createFraudFlag(userId, reason, runId) {
  return postJson('/v1/fraud-flag', { userId, runId, reason })
}

export function reviewFraudFlag(flagId, status, note) {
  return postJson(`/v1/fraud-flag/${flagId}/review`, { status, note })
}

// A player's runs, moderator's-eye view (includes outcome/flagged/score -
// fields a player's own run history call doesn't expose). Page.
export function findModeratorRuns(userId, pageNumber = 1, noOfRecords = 20) {
  return postJson(`/v1/moderator/run/user/${userId}`, {
    pageNumber,
    noOfRecords,
  })
}

// Full detail for one run: the run itself, its score breakdown, every GPS
// point (lat/lng/accuracy/elevation/speed/recordedAt - enough to plot the
// route and spot speed spikes), and any flags tied to it.
export function getModeratorRunDetail(runId) {
  return getJson(`/v1/moderator/run/${runId}`)
}

// ADMIN only server-side (MODERATOR can view/review flags but not ban) -
// the backend will 403 a MODERATOR caller even if the frontend didn't hide
// the button, but hide it anyway (see isAdmin in api/client.js).
export function lockUser(userId, reason) {
  return postJson('/v1/user/lock', { userId, reason })
}

export function unlockUser(userId, reason) {
  return postJson('/v1/user/unlock', { userId, reason })
}
