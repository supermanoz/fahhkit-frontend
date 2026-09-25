import { getJson, postJson } from './client'

// Head-to-head run races (see PvpDiscoveryController, PvpQueueController and
// RunChallengeController in the FahhKit backend). There's no "create
// challenge" endpoint - challenges only come from the matchmaking queue or a
// direct challenge to a nearby player, and they only resolve through
// createRun({ challengeId }) or the server's expiry job.

// Mirrors run-challenge.* in the backend's application.properties.
export const PVP_MODES = [
  { id: 'FIVE_HUNDRED_M', label: '500 m', meters: 500, queueStake: 10 },
  { id: 'ONE_KM', label: '1 km', meters: 1000, queueStake: 20 },
  { id: 'FIVE_KM', label: '5 km', meters: 5000, queueStake: 50 },
]

export function getPvpMode(id) {
  return PVP_MODES.find((m) => m.id === id) || null
}

export function getPvpModeByMeters(meters) {
  return PVP_MODES.find((m) => m.meters === meters) || null
}

export function pingPvpLocation(lat, lng) {
  return postJson('/v1/pvp/discovery/location/ping', { lat, lng })
}

// No GET for this flag server-side, so the client keeps its own copy.
export function setPvpDiscoverable(enabled) {
  return postJson('/v1/pvp/discovery/toggle', { enabled })
}

export function findNearbyPlayers(radiusMeters) {
  const query = radiusMeters ? `?radiusMeters=${radiusMeters}` : ''
  return getJson(`/v1/pvp/discovery/nearby${query}`)
}

export function sendDirectChallenge(opponentUserId, mode, stakeAmount) {
  return postJson('/v1/pvp/discovery/challenge', {
    opponentUserId,
    mode,
    stakeAmount,
  })
}

export function joinPvpQueue(mode) {
  return postJson('/v1/pvp/queue/join', { mode })
}

export function leavePvpQueue() {
  return postJson('/v1/pvp/queue/leave', {})
}

// null when the player has never queued.
export function getPvpQueueStatus() {
  return getJson('/v1/pvp/queue/status')
}

export function findMyChallenges(pageNumber = 1, noOfRecords = 20) {
  return postJson('/v1/run-challenge/find', { pageNumber, noOfRecords })
}

export function getChallenge(id) {
  return getJson(`/v1/run-challenge/${id}`)
}

export function reviewChallenge(id, accept) {
  return postJson(`/v1/run-challenge/${id}/review`, { accept })
}

export function cancelChallenge(id) {
  return postJson(`/v1/run-challenge/${id}/cancel`, {})
}
