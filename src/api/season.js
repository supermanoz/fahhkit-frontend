import { getJson } from './client'

// Wired to the real GET /v1/season/current (SeasonController ->
// SeasonServiceImpl#getCurrentSeason). Returns
// { seasonNumber, status, startDate, endDate, lengthDays, daysRemaining }.
//
// Two known gaps against the ideal ISO-8601-UTC shape, both handled on the
// read side in utils/seasonCountdown.js rather than here:
//  - startDate/endDate are naive LocalDateTime strings (no "Z"/offset) that
//    are actually Asia/Kathmandu wall-clock time (application.properties:
//    spring.jackson.time-zone=Asia/Kathmandu doesn't add a zone to a
//    LocalDateTime's own JSON, it just picks which wall clock the naive
//    value is on) - parseSeasonDateTime() assumes the fixed +5:45 offset
//    for any value that doesn't already carry a zone.
//  - there's no serverTime field and CorsConfig doesn't expose the `Date`
//    response header, so the client can't correct for its own clock being
//    wrong. computeClockOffsetMs() returns 0 (no correction) until the
//    backend adds a serverTime (ISO-8601 UTC) field to SeasonResponse -
//    the moment it appears in this payload, the countdown picks it up
//    automatically.
export function getCurrentSeason() {
  return getJson('/v1/season/current')
}
