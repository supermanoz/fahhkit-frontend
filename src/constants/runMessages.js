// Player-facing wording for runs that did not count, in one place. Rules:
//   * say WHY in plain words, never accuse ("looked like a vehicle" is a
//     guess; "speed stayed above running pace" is what was measured);
//   * a GPS-quality or environment problem is never worded as cheating and
//     always ends with a way to try again;
//   * a real fraud decision (the server's CHEAT_DETECTED, or a sustained
//     over-speed warning that ran out) says what was measured, and that a weak
//     signal can cause it.
export const OVER_SPEED_HINT =
  'If you were on foot, a weak GPS signal can cause this - try again somewhere with a clear view of the sky.'

// Live warning (a countdown is running).
export const OVER_SPEED_WARNING_TITLE = 'Moving faster than running pace'
export const OVER_SPEED_WARNING_COPY =
  "Your speed is above running pace. Slow down or this run won't count."
// Short label on the in-run status pill while the warning is up.
export const OVER_SPEED_STATUS_LABEL = 'Too fast'
// The warning ran out: the run is thrown away.
export const OVER_SPEED_DISCARDED_TITLE = 'Run not counted: speed too high'
export const OVER_SPEED_DISCARDED_COPY = `Your speed stayed above running pace for too long, so this run didn't count - no XP, no territory. ${OVER_SPEED_HINT}`
// Notification bodies (app in the background).
export const OVER_SPEED_NOTIFICATION_BODY =
  "Your speed is above running pace. Slow down or this run won't count."
export const OVER_SPEED_DISCARD_NOTIFICATION_BODY =
  "Your speed stayed above running pace for too long, so that run didn't count. Try again on foot."

// Server decided (RunProcessingOutcome CHEAT_DETECTED / PvP CHEAT_DETECTED).
export const SERVER_REJECTED_TITLE = 'Run not counted'
export const SERVER_REJECTED_COPY = `The speed recorded for this run was above running pace for too long, so it didn't count. ${OVER_SPEED_HINT}`
export const SERVER_REJECTED_TERRITORY_COPY = `The speed recorded for this run was above running pace for too long, so it didn't count for territory. ${OVER_SPEED_HINT}`

// A client-side summary: part of the run was over running pace.
export const PARTLY_FAST_TITLE = 'Part of this run was too fast'

// GPS quality / environment (never a fraud message).
export const NO_FIX_TITLE = "Couldn't find your location"
export const NO_FIX_COPY =
  "No GPS location came through, so this run wasn't counted. Check that location is on, then try again outdoors."
export const WEAK_GPS_TITLE = 'GPS signal was weak'
export const WEAK_GPS_COPY =
  "Your location wasn't precise enough to measure this run, so it wasn't counted. Try again in the open, away from tall buildings, with precise location on."
