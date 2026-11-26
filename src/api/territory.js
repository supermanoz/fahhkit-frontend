import { getJson, postJson } from './client'

// Territory Run backend (see origin/feature/territory-game in the FahhKit
// backend repo). Territories aren't claimed directly — they're a side
// effect of completing a GPS run via createRun() in ./runs.js (no eventId),
// processed asynchronously server-side. These calls only ever read state
// the server has already computed.

// A brand-new account has 0 XP and may come back with null level/xp - treat
// that as level 1 / 0 XP (a real value) so every level/XP display, which
// hides itself on a null level, still renders at 0%.
function withLevelDefaults(profile) {
  if (!profile) return profile
  return { ...profile, level: profile.level ?? 1, xp: profile.xp ?? 0 }
}

export function getTerritoryProfile() {
  return getJson('/v1/territory/profile').then(withLevelDefaults)
}

// Another player's public game profile (e.g. viewed from the leaderboard) - same shape as
// getTerritoryProfile() except fahhcoinBalance is always null (a wallet balance is private).
export function getTerritoryProfileByUserId(userId) {
  return getJson(`/v1/territory/profile/${userId}`).then(withLevelDefaults)
}

// The server's own territory rule constants (closure distance, minimum area,
// minimum points, speed limits...) so the client never drifts from them. Not
// built server-side yet (see docs/territory-rules-backend-ask.md): until it
// is, this 404s and src/game/territoryRules.js keeps its built-in defaults.
export function fetchTerritoryRules() {
  return getJson('/v1/territory/rules')
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
