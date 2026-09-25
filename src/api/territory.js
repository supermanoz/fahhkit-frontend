import { getJson, postJson } from './client'

// Territory Run backend (see origin/feature/territory-game in the FahhKit
// backend repo). Territories aren't claimed directly — they're a side
// effect of completing a GPS run via createRun() in ./runs.js (no eventId),
// processed asynchronously server-side. These calls only ever read state
// the server has already computed.

export function getTerritoryProfile() {
  return getJson('/v1/territory/profile')
}

// Another player's public game profile (e.g. viewed from the leaderboard) - same shape as
// getTerritoryProfile() except fahhcoinBalance is always null (a wallet balance is private).
export function getTerritoryProfileByUserId(userId) {
  return getJson(`/v1/territory/profile/${userId}`)
}

export function findMyParcels(pageNumber = 1, noOfRecords = 100) {
  return postJson('/v1/territory/parcel/find', { pageNumber, noOfRecords })
}

// No pagination on this one server-side — it's a bounding-box lookup
// (default 500m radius, capped at 2000m), not a paged list.
export function findParcelsNear(lat, lng, radiusMeters) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  if (radiusMeters) params.set('radiusMeters', String(radiusMeters))
  return getJson(`/v1/territory/parcel/near?${params.toString()}`)
}

// Already filtered server-side to events involving the logged-in user
// (as new or previous owner) and sorted newest-first.
export function findMyTerritoryEvents(pageNumber = 1, noOfRecords = 20) {
  return postJson('/v1/territory/event/find', { pageNumber, noOfRecords })
}

export function findIndividualLeaderboard(pageNumber = 1, noOfRecords = 20) {
  return postJson('/v1/leaderboard/individual/find', {
    pageNumber,
    noOfRecords,
  })
}

export function findClubLeaderboard(pageNumber = 1, noOfRecords = 20) {
  return postJson('/v1/leaderboard/club/find', {
    pageNumber,
    noOfRecords,
  })
}

// Current season's top clubs as a plain list (no paging).
export function getTopClubs(limit = 10) {
  return getJson(`/v1/leaderboard/club/top?limit=${limit}`)
}
