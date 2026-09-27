import { getJson, postJson } from './client'

// Club backend (ClubController + ClubTreasuryController in the FahhKit
// backend repo): create, browse/search, join, leave, plus the roster,
// leader/co-leader tooling and the shared Fahhcoin treasury.

// Server-side cap (ClubProperties.maxMembers) - not exposed by any endpoint,
// so mirrored here for the "12 / 50 members" display. Keep in sync.
export const CLUB_MAX_MEMBERS = 50

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

// Leader/co-leader edits their own club's description (the server works
// out which club from the caller's membership). Returns the updated club.
export function updateClubDescription(description) {
  return postJson('/v1/club/description', { description })
}

// null if the logged-in athlete isn't in a club.
export function getMyClub() {
  return getJson('/v1/club/mine')
}

// Any club's public details (name, description, leader, member count) -
// open to every player, not just members.
export function getClubById(clubId) {
  return getJson(`/v1/club/${clubId}`)
}

export function requestToJoinClub(clubId) {
  return postJson(`/v1/club/${clubId}/join-request`, {})
}

export function leaveClub(clubId) {
  return postJson(`/v1/club/${clubId}/leave`, {})
}

// Case-insensitive "name contains" lookup, unlike findClubs' exact-field
// search - what a type-ahead actually wants.
export function searchClubsByName(name) {
  return getJson(`/v1/club/search?name=${encodeURIComponent(name)}`)
}

// Sends the target player a CLUB_INVITE mail - they accept or decline it
// from their inbox.
export function inviteToClub(clubId, targetUserId, message) {
  return postJson(`/v1/club/${clubId}/invite`, { targetUserId, message })
}

// Members with their role (LEADER / CO_LEADER / MEMBER) and join date,
// oldest first. One page covers a full club (CLUB_MAX_MEMBERS).
export function getClubRoster(clubId) {
  return postJson(`/v1/club/${clubId}/roster/find`, {
    pageNumber: 1,
    noOfRecords: CLUB_MAX_MEMBERS,
  })
}

// Leader/co-leader only - pending requests to join the caller's own club.
export function findPendingJoinRequests() {
  return postJson('/v1/club/join-request/find', {
    pageNumber: 1,
    noOfRecords: 50,
  })
}

export function reviewJoinRequest(requestId, accept) {
  return postJson(`/v1/club/join-request/${requestId}/review`, { accept })
}

// Leader, or co-leader on a plain member.
export function kickClubMember(clubId, targetUserId) {
  return postJson(`/v1/club/${clubId}/kick`, { targetUserId })
}

// Leader only for the three below. Transferring makes the old leader a
// co-leader.
export function promoteClubMember(clubId, targetUserId) {
  return postJson(`/v1/club/${clubId}/promote`, { targetUserId })
}

export function demoteClubMember(clubId, targetUserId) {
  return postJson(`/v1/club/${clubId}/demote`, { targetUserId })
}

export function transferClubLeadership(clubId, targetUserId) {
  return postJson(`/v1/club/${clubId}/transfer-leadership`, { targetUserId })
}

// The caller's own club's shared Fahhcoin balance.
export function getClubTreasury() {
  return getJson('/v1/club/treasury')
}

// Moves Fahhcoin from the caller's balance into their club's treasury.
export function donateToClubTreasury(amount) {
  return postJson('/v1/club/treasury/donate', { amount })
}
