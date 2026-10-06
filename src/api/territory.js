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

// Ranked within the given city only (not globally) - omit cityId to let the
// backend resolve it from the caller's own last-known GPS fix.
export function getTopIndividualsLocal(limit = 20, cityId) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cityId != null) params.set('cityId', String(cityId))
  return getJson(`/v1/leaderboard/individual/top/local?${params.toString()}`)
}

// Ranked within the given country only (every city in it pooled together) -
// omit countryId to let the backend resolve it from the caller's own
// last-known GPS fix.
export function getTopClubsNational(limit = 20, countryId) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (countryId != null) params.set('countryId', String(countryId))
  return getJson(`/v1/leaderboard/club/top/national?${params.toString()}`)
}
