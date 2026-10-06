import { deleteJson, getJson, postJson } from './client'

// Saved routes (see SavedRouteController in the FahhKit backend) - a named
// polyline a player draws on the map, kept private or shared to their
// current club.

export function createRoute({ name, visibility, points }) {
  return postJson('/v1/saved-route', { name, visibility, points })
}

// Flips PRIVATE <-> CLUB server-side (owner-only) - no target value to pass,
// it's a pure toggle. Going to CLUB fails with NOT_IN_A_CLUB if the owner
// has since left their club. Returns the route with its new visibility.
export function toggleRouteVisibility(id) {
  return postJson(`/v1/saved-route/${id}/toggle-visibility`, {})
}

export function findMyRoutes(pageNumber = 1, noOfRecords = 50) {
  return postJson('/v1/saved-route/find', { pageNumber, noOfRecords })
}

// Every CLUB-visibility route shared by a member of the caller's current
// club - not just the caller's own.
export function findClubRoutes(pageNumber = 1, noOfRecords = 50) {
  return postJson('/v1/saved-route/club/find', { pageNumber, noOfRecords })
}

// Only this one carries the full ordered point list.
export function getRoute(id) {
  return getJson(`/v1/saved-route/${id}`)
}

export function deleteRoute(id) {
  return deleteJson(`/v1/saved-route/${id}`)
}
