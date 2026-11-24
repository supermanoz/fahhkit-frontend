import { HEADING_CONFIG, estimateSpeed } from './headingTracker'

// ONE movement state for a tracked run, read by BOTH the hero (run vs idle
// animation) and the map (heading-up vs fixed north-up), so they can never
// disagree.
//   RUN view  : the hero plays the run animation and the map turns with the
//               runner's heading.
//   IDLE view : the hero plays the idle animation and the map stays fixed,
//               north-up (standing, or walking slowly).
// Thresholds are not duplicated: "stopped" is HEADING_CONFIG.moveStopSpeedMps,
// "slow movement" is HEADING_CONFIG.moveStart/Stop (hysteresis), and the run
// threshold is the one the hero's run animation always used (1.0 m/s).
export const RUN_VIEW_CONFIG = {
  runSpeedMps: 1.0, // at/above this the runner counts as running
  stopSpeedMps: HEADING_CONFIG.moveStopSpeedMps, // below this: stopped
  slowStartSpeedMps: HEADING_CONFIG.moveStartSpeedMps,
  enterMs: 2000, // continuous movement at run speed before RUN view
  leaveMs: 3000, // continuous time below the stop speed before IDLE view
  minDwellMs: 2000, // never flip more than once per this
  staleFixMs: 4000, // no fix for this long counts as speed 0
  historyMax: 12,
}

// Only while the hidden debug switch is on (see utils/mapDebug.js): walking
// already counts as running, for testing on foot.
export const TEST_RUN_VIEW_OVERRIDES = {
  runSpeedMps: 0.25,
  stopSpeedMps: 0.08,
  slowStartSpeedMps: 0.15,
}

export function createRunViewMachine(overrides = {}) {
  const cfg = { ...RUN_VIEW_CONFIG, ...overrides }
  let mode = 'idle'
  let since = 0 // device-timeline time the current mode began
  let lastFlipAt = -Infinity
  let reason = 'run not started'
  let speed = 0
  let slow = false // moving at all (hysteresis), for the direction cone
  let aboveSince = null
  let belowSince = null
  let history = []
  let lastFixT = null
  let wallAtFix = null
  let started = false

  // The device timeline: the last fix's time plus the wall time since it, so
  // scripted/offset fix timestamps and real elapsed time agree.
  const clock = (wall) =>
    lastFixT === null ? wall : lastFixT + (wall - wallAtFix)

  function evaluate(now, s) {
    // slow-movement flag (hysteresis)
    slow = slow ? s >= cfg.stopSpeedMps : s >= cfg.slowStartSpeedMps
    if (mode === 'idle') {
      belowSince = null
      if (s >= cfg.runSpeedMps) {
        if (aboveSince === null) aboveSince = now
        if (
          now - aboveSince >= cfg.enterMs &&
          now - lastFlipAt >= cfg.minDwellMs
        ) {
          mode = 'run'
          since = now
          lastFlipAt = now
          aboveSince = null
          reason = `moving at ${s.toFixed(1)} m/s (>= ${cfg.runSpeedMps}) for ${(cfg.enterMs / 1000).toFixed(0)} s`
        }
      } else {
        aboveSince = null
      }
    } else {
      aboveSince = null
      if (s < cfg.stopSpeedMps) {
        if (belowSince === null) belowSince = now
        if (
          now - belowSince >= cfg.leaveMs &&
          now - lastFlipAt >= cfg.minDwellMs
        ) {
          mode = 'idle'
          since = now
          lastFlipAt = now
          belowSince = null
          reason = `below ${cfg.stopSpeedMps} m/s for ${(cfg.leaveMs / 1000).toFixed(0)} s`
        }
      } else {
        belowSince = null
      }
    }
  }

  return {
    // fix: { lat, lng, accuracy?, speed?, t (ms) }; wall = Date.now() (tests
    // pass their own).
    pushFix(fix, wall = Date.now()) {
      if (
        !fix ||
        !Number.isFinite(fix.t) ||
        !Number.isFinite(fix.lat) ||
        !Number.isFinite(fix.lng)
      )
        return
      if (!started) {
        started = true
        since = fix.t
        reason = 'run started - waiting to see movement'
      }
      history.push({
        lat: fix.lat,
        lng: fix.lng,
        t: fix.t,
        accuracy: fix.accuracy ?? null,
      })
      history = history.slice(-cfg.historyMax)
      lastFixT = fix.t
      wallAtFix = wall
      speed = estimateSpeed(fix, history.slice(0, -1)).speed
      evaluate(fix.t, speed)
    },
    // Call ~2x/s on the caller's clock: time-based flips (and a stalled GPS)
    // need a clock even when no fix arrives.
    tick(wall = Date.now()) {
      if (!started) return
      const now = clock(wall)
      const stale = now - lastFixT > cfg.staleFixMs
      evaluate(now, stale ? 0 : speed)
    },
    state(wall = Date.now()) {
      const now = clock(wall)
      return {
        mode,
        slow,
        speed,
        reason,
        since,
        inStateMs: Math.max(0, now - since),
      }
    },
    reset() {
      mode = 'idle'
      since = 0
      lastFlipAt = -Infinity
      reason = 'run not started'
      speed = 0
      slow = false
      aboveSince = belowSince = null
      history = []
      lastFixT = wallAtFix = null
      started = false
    },
  }
}

// The one machine for the run in progress (there is only ever one), replaced
// by startRunView() at every run start. The hook in hooks/useRunView.js feeds
// it; the debug panel reads it.
let current = createRunViewMachine()
export function startRunView(testMode = false) {
  current = createRunViewMachine(testMode ? TEST_RUN_VIEW_OVERRIDES : {})
  return current
}
export const getRunView = () => current
