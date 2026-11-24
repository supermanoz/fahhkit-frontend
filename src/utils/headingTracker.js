import { haversineDistance } from './run'
import { bearingBetween } from './territoryGame'

// Direction-of-travel for the heading-up map. Pure (no DOM, no timers): the
// caller feeds GPS fixes (and, on a phone, the compass) and calls tick() on
// its own clock, so every rule below is unit-testable.
//
// Source of truth is the RUNNER'S MOVEMENT. In order of preference:
//   1. the GPS course (fix.heading) once the chip reports one and the speed
//      is above courseMinSpeedMps
//   2. the bearing over the last ~10-15 m of travel
//   3. only while walking slowly with neither of the above (the first steps
//      of a walk): the phone compass, if the caller has one
// and it is deliberately calm: accuracy-weighted smoothing, a dead-band, a
// confirmation time for hard turns, a rate limit, and a hold while stopped.
// Every number is here so it can be tuned in one place.
export const HEADING_CONFIG = {
  // A fix worse than this is ignored completely.
  maxAccuracyM: 30,
  // A fix at least this good counts fully; worse ones count less (down to
  // minWeight at maxAccuracyM) in the smoothing below.
  goodAccuracyM: 8,
  minWeight: 0.25,
  // Trust the chip's own course above this speed (walking pace is ~1.0-1.5).
  courseMinSpeedMps: 0.7,
  // "Moving" starts at this speed and ends below moveStopSpeedMps
  // (hysteresis, so a slow walker does not flicker between the two).
  moveStartSpeedMps: 0.6,
  moveStopSpeedMps: 0.4,
  // When the device reports no speed, speed is the net movement over about
  // this long, minus this share of the two fixes' accuracy (it prefers to hold
  // when unsure, but a steady walk must still register).
  derivedSpeedWindowMs: 8000,
  derivedNoiseShare: 0.25,
  // Travel bearing = from the older to the newer end of the last ~10-15 m of
  // path. Each end is the (accuracy-weighted) average of the fixes there, so
  // a few metres of jitter on single fixes cancels out. The window needs at
  // least travelMinDistM of reach before any bearing is given.
  travelMinDistM: 10,
  travelWindowM: 15,
  // Share of the window's fixes averaged at each end.
  travelEndShare: 0.4,
  // Keep history this long / this many fixes (fixes arrive ~1 per second).
  historyMaxAgeMs: 40000,
  historyMax: 40,
  // Exponential smoothing weight per accepted candidate (circular), scaled
  // by the fix's accuracy weight.
  smoothingAlpha: 0.5,
  // The applied heading only moves once the smoothed heading is this far
  // from it: small zigzags never rotate the map.
  deadBandDeg: 10,
  // A change this big (U-turn, hard corner) must be seen consistently ...
  confirmTurnDeg: 70,
  // ... for this long ...
  confirmMs: 1200,
  // ... with candidates staying within this of each other.
  confirmToleranceDeg: 35,
  // Phone compass: only used in the slow-start case above, only if this
  // fresh, and it counts for this fraction of a GPS candidate (it is noisy
  // and the phone may be in a pocket).
  compassMaxAgeMs: 2500,
  compassWeight: 0.4,
  // The output chases the target no faster than this...
  maxRateDegPerSec: 60,
  // ...and is emitted at most this often.
  minUpdateIntervalMs: 500,
}

// Used ONLY while the hidden debug switch is on (utils/mapDebug.js): so a slow
// walk already counts as moving and rotates the map. Never applied normally.
export const TEST_HEADING_OVERRIDES = {
  moveStartSpeedMps: 0.15,
  moveStopSpeedMps: 0.08,
  courseMinSpeedMps: 0.2,
  derivedSpeedWindowMs: 4000,
  derivedNoiseShare: 0.1,
  travelMinDistM: 4,
  travelWindowM: 8,
  deadBandDeg: 6,
}

const wrap360 = (d) => ((d % 360) + 360) % 360
// Signed shortest arc from a to b, in (-180, 180].
export function angleDiff(a, b) {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return d === -180 ? 180 : d
}

// Speed of a fix in m/s: the device's own value when it has one, otherwise the
// net movement over cfg.derivedSpeedWindowMs minus the position noise. `history`
// holds the earlier fixes ({lat, lng, t, accuracy}, newest last, may include
// `fix` itself). Shared by the heading tracker and the run-view state machine
// (utils/runView.js) so both read the same speed.
export function estimateSpeed(fix, history, cfg = HEADING_CONFIG) {
  if (Number.isFinite(fix.speed) && fix.speed >= 0) {
    return { speed: fix.speed, source: 'device' }
  }
  let ref = null
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (
      history[i].t < fix.t &&
      fix.t - history[i].t >= cfg.derivedSpeedWindowMs
    ) {
      ref = history[i]
      break
    }
  }
  if (!ref) return { speed: 0, source: 'derived' }
  const dt = (fix.t - ref.t) / 1000
  const noise =
    cfg.derivedNoiseShare * ((ref.accuracy ?? 5) + (fix.accuracy ?? 5))
  const net = Math.max(0, haversineDistance(ref, fix) - noise)
  return { speed: net / dt, source: 'derived' }
}

export function createHeadingTracker(overrides = {}) {
  const cfg = { ...HEADING_CONFIG, ...overrides }
  let history = []
  let smoothed = null // filter state
  let target = null // dead-banded heading the output chases
  let output = null // what the map actually shows (rate limited)
  let pending = null // a big turn waiting to be confirmed
  let lastEmitAt = null
  let lastEmitted = null
  let lastTickAt = null
  let moving = false
  let compass = null // { deg, t }
  let fixCount = 0
  let dbg = { state: 'waiting', reason: 'no GPS fix yet' }

  const weightOf = (accuracy) =>
    accuracy == null || accuracy <= cfg.goodAccuracyM
      ? 1
      : Math.max(cfg.minWeight, cfg.goodAccuracyM / accuracy)

  const speedOf = (fix) => estimateSpeed(fix, history, cfg)

  function travelBearing(latest) {
    // The fixes within the last travelWindowM (straight-line) of the latest.
    let start = history.length - 1
    let reach = 0
    for (let i = history.length - 2; i >= 0; i -= 1) {
      const d = haversineDistance(history[i], latest)
      if (d > cfg.travelWindowM) break
      start = i
      reach = Math.max(reach, d)
    }
    if (reach < cfg.travelMinDistM) {
      // Not enough path inside the window yet: reach back to the first fix
      // that is far enough instead (a short, slower window).
      for (let i = history.length - 2; i >= 0; i -= 1) {
        if (haversineDistance(history[i], latest) >= cfg.travelMinDistM) {
          start = i
          reach = cfg.travelMinDistM
          break
        }
      }
      if (reach < cfg.travelMinDistM) return null
    }
    const win = history.slice(start)
    const k = Math.max(2, Math.floor(win.length * cfg.travelEndShare))
    const centre = (pts) => {
      let w = 0
      let lat = 0
      let lng = 0
      for (const p of pts) {
        const wt = weightOf(p.accuracy)
        w += wt
        lat += p.lat * wt
        lng += p.lng * wt
      }
      return { lat: lat / w, lng: lng / w }
    }
    const from = centre(win.slice(0, k))
    const to = centre(win.slice(-k))
    if (haversineDistance(from, to) < cfg.travelMinDistM * 0.5) return null
    return bearingBetween(from, to)
  }

  function accept(candidate, weight, now) {
    if (target === null) {
      smoothed = candidate
      target = candidate
      output = candidate
      return
    }
    if (Math.abs(angleDiff(target, candidate)) >= cfg.confirmTurnDeg) {
      if (
        !pending ||
        Math.abs(angleDiff(pending.heading, candidate)) >
          cfg.confirmToleranceDeg
      ) {
        pending = { heading: candidate, since: now }
        return
      }
      if (now - pending.since < cfg.confirmMs) return
      // Confirmed: it really is a new direction.
      smoothed = candidate
      pending = null
    } else {
      pending = null
      smoothed = wrap360(
        smoothed + angleDiff(smoothed, candidate) * cfg.smoothingAlpha * weight
      )
    }
    if (Math.abs(angleDiff(target, smoothed)) >= cfg.deadBandDeg) {
      target = smoothed
    }
  }

  return {
    // fix: { lat, lng, accuracy?, speed?, heading?, t (ms) }
    pushFix(fix) {
      if (
        !fix ||
        !Number.isFinite(fix.lat) ||
        !Number.isFinite(fix.lng) ||
        !Number.isFinite(fix.t)
      )
        return
      fixCount += 1
      if (fix.accuracy != null && fix.accuracy > cfg.maxAccuracyM) {
        dbg = {
          ...dbg,
          state: 'ignored',
          reason: `fix ignored: accuracy ${Math.round(fix.accuracy)} m > ${cfg.maxAccuracyM} m`,
          accuracy: fix.accuracy,
        }
        return
      }
      const point = {
        lat: fix.lat,
        lng: fix.lng,
        t: fix.t,
        accuracy: fix.accuracy ?? null,
      }
      history.push(point)
      history = history
        .filter((p) => fix.t - p.t <= cfg.historyMaxAgeMs)
        .slice(-cfg.historyMax)

      const { speed, source } = speedOf({ ...fix })
      moving = moving
        ? speed >= cfg.moveStopSpeedMps
        : speed >= cfg.moveStartSpeedMps
      const hasCourse =
        Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading <= 360
      dbg = {
        speed,
        speedSource: source,
        accuracy: fix.accuracy ?? null,
        courseRaw: hasCourse ? fix.heading : null,
        travel: null,
        candidate: null,
        candidateFrom: null,
      }
      if (!moving) {
        // Standing: hold. A half-seen turn is forgotten.
        pending = null
        dbg.state = 'held'
        dbg.reason = `stopped (speed ${speed.toFixed(2)} < ${cfg.moveStartSpeedMps} m/s)`
        return
      }
      const w = weightOf(fix.accuracy)
      const travel = travelBearing(point)
      dbg.travel = travel
      let candidate = null
      let weight = w
      if (hasCourse && speed >= cfg.courseMinSpeedMps) {
        candidate = wrap360(fix.heading)
        weight = 1
        dbg.candidateFrom = 'gps-course'
      } else if (travel !== null) {
        candidate = travel
        dbg.candidateFrom = 'travel-bearing'
      } else if (compass && fix.t - compass.t <= cfg.compassMaxAgeMs) {
        candidate = compass.deg
        weight = cfg.compassWeight
        dbg.candidateFrom = 'compass'
      }
      dbg.candidate = candidate
      if (candidate === null) {
        dbg.state = 'locating'
        dbg.reason = `moving, but no direction yet (need ${cfg.travelMinDistM} m of path or a GPS course)`
        return
      }
      accept(candidate, weight, fix.t)
      dbg.state = pending ? 'turning' : 'active'
      dbg.reason = pending
        ? 'hard turn: confirming it is real'
        : `following ${dbg.candidateFrom}`
    },

    // The phone compass (degrees clockwise from north, already true/magnetic
    // as the platform gives it). Never drives anything on its own.
    pushCompass(deg, t) {
      if (Number.isFinite(deg) && Number.isFinite(t)) {
        compass = { deg: wrap360(deg), t }
      }
    },

    // Call on the caller's own clock (~2x/s). Returns the new heading in
    // [0,360) when the map should move, otherwise null.
    tick(now) {
      // Time since the previous tick (not the last emission): after a quiet
      // spell the first step must not be a big catch-up jump.
      const sinceTick = lastTickAt === null ? 0 : now - lastTickAt
      if (lastEmitAt === null || now - lastEmitAt >= cfg.minUpdateIntervalMs) {
        lastTickAt = now
      }
      if (output === null || target === null) return null
      if (lastEmitAt !== null && now - lastEmitAt < cfg.minUpdateIntervalMs)
        return null
      // First lock: hand the map its starting heading.
      if (lastEmitted === null) {
        lastEmitAt = now
        lastEmitted = output
        return output
      }
      const remaining = angleDiff(output, target)
      if (Math.abs(remaining) < 0.5) return null
      const dt = Math.min(
        sinceTick > 0 ? sinceTick : cfg.minUpdateIntervalMs,
        cfg.minUpdateIntervalMs * 2
      )
      const maxStep = (cfg.maxRateDegPerSec * dt) / 1000
      output = wrap360(
        output + Math.max(-maxStep, Math.min(maxStep, remaining))
      )
      lastEmitAt = now
      lastEmitted = output
      return output
    },

    // The heading currently shown (null until the first confirmed one).
    current() {
      return lastEmitted ?? output
    },
    // Everything the debug panel shows (read-only snapshot).
    debug() {
      return {
        ...dbg,
        fixes: fixCount,
        smoothed,
        target,
        output: lastEmitted ?? output,
        compass: compass ? compass.deg : null,
        moving,
      }
    },
    reset() {
      history = []
      smoothed = target = output = pending = null
      lastEmitAt = lastEmitted = null
      moving = false
      compass = null
      fixCount = 0
      dbg = { state: 'waiting', reason: 'no GPS fix yet' }
    },
  }
}
