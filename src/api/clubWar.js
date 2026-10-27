import { getJson, postJson } from './client'

// Club wars (ClubWarController in the FahhKit backend). Flow:
//   1. The leader queues a squad (10/20/30/40/50 active members) - the entry
//      fee comes out of the club treasury right away (refunded on cancel, or
//      if nobody's matched within 48h).
//   2. Matched against the queued club with the closest trophy count -> the
//      war is PREPARING for 24h: each squad member locks in a Hero they own.
//   3. BATTLE for 24h: each squad member submits one run (createRun with
//      clubWarId), with their locked-in Hero equipped.
//   4. COMPLETED: team score = sum of runs' pace + effort points. Winner
//      gains trophies; its squad members who ran get XP + Fahhcoin.

// Mirrors ClubWarProperties server-side (not exposed by any endpoint) -
// keep in sync.
export const CLUB_WAR_SQUAD_SIZES = [10, 20, 30, 40, 50]
export const CLUB_WAR_ENTRY_FEE = {
  10: 500,
  20: 1000,
  30: 1500,
  40: 2000,
  50: 2500,
}
export const CLUB_WAR_PREP_HOURS = 24
export const CLUB_WAR_BATTLE_HOURS = 24
export const CLUB_WAR_MAX_QUEUE_HOURS = 48
export const CLUB_WAR_REWARDS = {
  // Trophy changes aren't mirrored here: the server assigns them
  // (ClubWarProperties - win gain, favourite/underdog loss) and can retune
  // them without a frontend release, so the UI just says "system-assigned".
  winXp: 500,
  winCoins: 200,
}

// Leader only. The squad size is memberUserIds.length.
export function queueClubWar(memberUserIds) {
  return postJson('/v1/club-war/queue', { memberUserIds })
}

// Leader only - cancels a still-WAITING queue entry and refunds the fee.
export function cancelClubWarQueue() {
  return postJson('/v1/club-war/queue/cancel', {})
}

// The caller's club's WAITING queue entry, or null.
export function getClubWarQueueStatus() {
  return getJson('/v1/club-war/queue/status')
}

// The caller's club's PREPARING/BATTLE war, or null.
export function getActiveClubWar() {
  return getJson('/v1/club-war/active')
}

export function getClubWar(warId) {
  return getJson(`/v1/club-war/${warId}`)
}

// Both squads. The opponent's locked-in heroes are hidden while PREPARING.
export function getClubWarRoster(warId) {
  return getJson(`/v1/club-war/${warId}/roster`)
}

// Squad members only, during PREPARING - storeItemId of an owned HERO.
export function lockInClubWarHero(warId, storeItemId) {
  return postJson(`/v1/club-war/${warId}/lock-hero`, { storeItemId })
}

// Past (COMPLETED) wars the caller's club fought, most recent first - a
// Page (.content/.totalPages), 1-indexed. myParticipants/opponentParticipants
// are null on this list call (see getClubWarHistoryDetail for those).
export function getClubWarHistory(pageNumber = 1, noOfRecords = 10) {
  return postJson('/v1/club-war/history', { pageNumber, noOfRecords })
}

// Same shape as one item of getClubWarHistory, but with
// myParticipants/opponentParticipants populated - each squad member's run
// outcome and contributed score for that specific war.
export function getClubWarHistoryDetail(warId) {
  return getJson(`/v1/club-war/history/${warId}`)
}
