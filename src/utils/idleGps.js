// Rules for the always-on "where is the hero" GPS watch in GamePage - the
// one that runs OUTSIDE a tracked run (during a run the run tracker owns GPS
// and the player position comes from its path).
//
// The watch itself keeps high accuracy (the hero position and the rollout
// check need real fixes). What was wasteful is committing every fix to React
// state: each commit re-renders the whole GamePage, and a standing-still phone
// reports a new jittery fix every second. These rules drop fixes that are
// just noise inside the reported accuracy circle.

export const GOOD_FIX_ACCURACY_M = 50
// A fix is always committed after this long even if it hasn't moved, so a
// stationary hero's timestamp (used to reject stale fixes) never goes stale.
const HEARTBEAT_MS = 8000
const HEARTBEAT_MENU_MS = 30000

// Movement threshold below which a fix is indistinguishable from jitter.
export function jitterThresholdMeters(accuracy) {
  const a = Number.isFinite(accuracy) ? accuracy : 0
  return Math.min(Math.max(3, a * 0.3), 8)
}

// prev: last committed fix (or null), movedM: distance prev -> fix,
// elapsedMs: now - last commit, menuOpen: a full menu covers the map.
export function shouldCommitFix({ prev, fix, movedM, elapsedMs, menuOpen }) {
  if (!prev) return true
  const heartbeat = menuOpen ? HEARTBEAT_MENU_MS : HEARTBEAT_MS
  if (elapsedMs >= heartbeat) return true
  const threshold = menuOpen
    ? Math.max(25, jitterThresholdMeters(fix.accuracy))
    : jitterThresholdMeters(fix.accuracy)
  return movedM >= threshold
}

// The ONE rule for the "where is the hero" watch: it runs only when no run is
// being tracked AND the app is in the foreground. It is deliberately NOT a
// rule for run tracking - an active run's GPS belongs to useRunTracker
// (high accuracy, background-capable) and must never depend on app visibility.
export function idleWatchShouldRun({ runTracking, appActive }) {
  return !runTracking && appActive
}
