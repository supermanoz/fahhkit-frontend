import { getJson, postJson } from './client'

// Club backend (see origin/feature/territory-game in the FahhKit backend
// repo, ClubController). MVP surface only - create, browse/search, join,
// leave. Leader/co-leader tooling (review join requests, roster, kick,
// promote/demote, transfer leadership) exists server-side but has no
// frontend yet.

export function createClub(name, description) {
  return postJson('/v1/club/save', { name, description })
}

export function findClubs(pageNumber = 1, noOfRecords = 20, searchText = '') {
  return postJson('/v1/club/find', {
    pageNumber,
    noOfRecords,
    search: searchText ? [{ field: 'name', value: searchText }] : undefined,
  })
}

// null if the logged-in athlete isn't in a club.
export function getMyClub() {
  return getJson('/v1/club/mine')
}

export function requestToJoinClub(clubId) {
  return postJson(`/v1/club/${clubId}/join-request`, {})
}

export function leaveClub(clubId) {
  return postJson(`/v1/club/${clubId}/leave`, {})
}
