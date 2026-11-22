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
// CityRolloutRequestController) as of commit 47bb044. This is a MUTATING
// call - it resolves the nearest city server-side (the client only ever
// sends raw lat/lng, never a city id - nothing stores exact GPS, only the
// resolved city, which is the "coarse area" requirement) and either:
//   - succeeds with { cityId, cityName, countryName, requestCount } if the
//     city isn't rolled out yet (idempotent - calling it again for the
//     same city just returns the same shape, doesn't double-count), or
//   - throws ApiError with code ALREADY_ROLLED_OUT if it already is.
// Only ever called from an explicit player action (the Settings row/chip,
// the "Request Rollout" button on a TERRITORY_NOT_ROLLED_OUT run result, or
// the GameRolloutModal's primary button) - never from a background
// location-watching effect, which would silently submit a demand signal
// for every area a player passes through.

export function requestRollout(lat, lng) {
  return postJson('/v1/rollout-request', { lat, lng })
}

// The backend has no error `code` field on ApiError (see api/client.js) -
// only this humanized message string (TerritoryRolloutErrorCode.
// ALREADY_ROLLED_OUT's description) makes it through, so matching on it is
// the only way to tell "already rolled out" apart from any other failure.
// Shared here so GamePage.jsx's reactive handler and useRolloutStatus.js's
// proactive one stay in sync instead of each hardcoding their own copy.
export const ALREADY_ROLLED_OUT_MESSAGE =
  'The game is already rolled out in your city.'

// --- Passive status check - read-only, side-effect free (no request row is
// created), implemented server-side in CityRolloutRequestController
// (GET /v1/rollout-request/status, backend commit 66e740b on
// feature/territory-game). useRolloutStatus.js calls it on the first usable GPS
// fix (and again after moving > 1 km / returning from the background) to decide
// silently vs. "show the Request Rollout popup" vs. "already requested" chip.
//
//   GET /v1/rollout-request/status?lat={lat}&lng={lng}
//   Auth: logged-in player (same as POST /v1/rollout-request).
//   200 body (GeneralResponse<CityRolloutStatusResponse>):
//     {
//       rolledOut: boolean,        // a rolled-out city's centre is within the
//                                  // server's match radius (15 km) of lat/lng -
//                                  // the SAME rule the run gate uses
//       alreadyRequested: boolean, // this player already asked for the nearest city
//       cityId: number|null,       // the rolled-out city, else the nearest city
//       cityName: string|null,
//       countryName: string|null,
//       requestCount: number       // 0 when rolledOut
//     }
//   An unresolvable location is NOT an error: it comes back as rolledOut:false
//   with null city fields and requestCount 0 ("not rolled out", like the run
//   gate). The client treats that like any other "not rolled out" answer.
export function getRolloutStatus(lat, lng) {
  const query = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  return getJson(`/v1/rollout-request/status?${query}`)
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
