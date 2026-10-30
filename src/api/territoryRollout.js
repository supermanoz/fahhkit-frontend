import { getJson, postJson } from './client'

// Admin/moderator only (see TerritoryRolloutController in the FahhKit
// backend) - which cities currently have Territory Run's territory-capture
// enabled. Already wired up end-to-end in GameMechanicsPage.jsx.

export function getEnabledCities() {
  return getJson('/v1/territory-rollout/city/enabled')
}

export function setCityRolloutEnabled(cityId, enabled) {
  return postJson('/v1/territory-rollout/city/toggle', { cityId, enabled })
}

// Every imported city (not just enabled ones), paginated and name-searchable
// - each row carries its own `enabled` flag, so a moderator can find any
// city by name and toggle it on/off without already knowing its numeric id.
export function findTerritoryCities(
  pageNumber = 1,
  noOfRecords = 20,
  searchText = ''
) {
  return postJson('/v1/territory-rollout/city/list', {
    pageNumber,
    noOfRecords,
    search: searchText ? [{ field: 'name', value: searchText }] : undefined,
  })
}

// --- Player-facing request - real, implemented server-side (see
// CityRolloutRequestController) as of commit 47bb044. There is NO passive
// "check my status" endpoint - only this mutating request call, which
// resolves the nearest city server-side (the client only ever sends raw
// lat/lng, never a city id - nothing stores exact GPS, only the resolved
// city, which is the "coarse area" requirement) and either:
//   - succeeds with { cityId, cityName, countryName, requestCount } if the
//     city isn't rolled out yet (idempotent - calling it again for the
//     same city just returns the same shape, doesn't double-count), or
//   - throws ApiError with code ALREADY_ROLLED_OUT if it already is.
// Because there's no side-effect-free way to ask "is my area rolled out"
// in advance, this is deliberately only ever called from an explicit
// player action (the Settings row, or the "Request Rollout" button on a
// TERRITORY_NOT_ROLLED_OUT run result) - never from a background
// location-watching effect, which would silently submit a demand signal
// for every area a player passes through. -->

export function requestRollout(lat, lng) {
  return postJson('/v1/rollout-request', { lat, lng })
}

// Admin/moderator (POST /v1/territory-rollout/request/list, part of the
// existing moderator-only TerritoryRolloutController) - areas sorted by
// unique request count, highest first. Each row also carries
// lastRequestedAt and rolledOut (true once a moderator has since enabled
// that city - the request's been fulfilled).
export function findRolloutRequestSummary(pageNumber = 1, noOfRecords = 20) {
  return postJson('/v1/territory-rollout/request/list', {
    pageNumber,
    noOfRecords,
  })
}
