// Run-level simulation for the fraud / vehicle rules. Replays a synthetic
// phone feed through the SAME front door the live tracker uses
// (hooks/useRunTracker.js): fixes worse than MAX_ACCEPTABLE_ACCURACY_METERS
// are dropped, at most one fix per MIN_POINT_INTERVAL_MS is kept, then the
// vehicle detector decides. Also mirrors the backend's sustained-speed check
// (TerritoryAntiCheatValidator + TerritoryAntiCheatProperties as of
// origin/feature/territory-game) so a scenario reports BOTH verdicts.
import { createVehicleDetector, VehicleState } from '../utils/vehicleDetection'
import { MAX_ACCEPTABLE_ACCURACY_METERS, haversineDistance } from '../utils/run'
import { createDistanceFilter } from '../utils/distanceFilter'
import { isGpsWobble, MAX_CONSECUTIVE_WOBBLE_DROPS } from '../utils/gpsQuality'

export const MIN_POINT_INTERVAL_MS = 2500 // same constant as useRunTracker.js
const M_LAT = 111_320
const M_LNG = 98_300 // at ~27.7N
const T0 = 1_700_000_000_000

export function rng(seed) {
  let s = seed >>> 0
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const gauss = () => {
    const u = Math.max(next(), 1e-9)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
  }
  return { next, gauss }
}

// Raw 1 Hz phone feed. legs: {seconds, speed, bearing?, accuracy?|[min,max],
// steps?: Hz (clean footstrikes the peak detector sees; omit = no motion
// sensor data at all), wobble?: accelerometer wobble in m/s^2 (body motion),
// noSpeed?: chip gives no speed, speedNoise?: chip speed noise (default 0.3 m/s), silent?: true (no fixes, time passes)}.
// Position error is an AR(1) process (GPS error drifts, it is not white
// noise) with sigma = accuracy / 1.5 per axis (accuracy is a 68 % radius).
export function feed(legs, { seed = 1, rho = 0.7, defaultAccuracy = 8 } = {}) {
  const r = rng(seed)
  const fixes = []
  let t = T0
  let n = 0
  let e = 0
  let ex = 0
  let ey = 0
  for (const leg of legs) {
    const bearing = ((leg.bearing ?? 0) * Math.PI) / 180
    for (let s = 0; s < leg.seconds; s += 1) {
      t += 1000
      n += Math.cos(bearing) * leg.speed
      e += Math.sin(bearing) * leg.speed
      if (leg.silent) continue
      const acc = Array.isArray(leg.accuracy)
        ? leg.accuracy[0] + r.next() * (leg.accuracy[1] - leg.accuracy[0])
        : (leg.accuracy ?? defaultAccuracy)
      const sigma = acc / 1.5
      const k = Math.sqrt(1 - rho * rho)
      ex = rho * ex + k * sigma * r.gauss()
      ey = rho * ey + k * sigma * r.gauss()
      fixes.push({
        lat: 27.7172 + (n + ey) / M_LAT,
        lng: 85.324 + (e + ex) / M_LNG,
        timestamp: t,
        accuracy: acc,
        // The chip's own speed: noisy truth (what Android/iOS report).
        speedMps: leg.noSpeed
          ? null
          : Math.max(0, leg.speed + (leg.speedNoise ?? 0.3) * r.gauss()),
        steps: leg.steps,
        wobble: leg.wobble ?? 0,
        pause: leg.pause === true,
      })
    }
  }
  return fixes
}

// A leg-level teleport: one fix `meters` away, back on the path next fix.
export function spike(fixes, at, meters = 600) {
  return fixes.map((f, i) =>
    i === at ? { ...f, lng: f.lng + meters / M_LNG } : f
  )
}
// Position jumps `meters` and STAYS there (mock-location hop).
export function hop(fixes, at, meters = 600) {
  return fixes.map((f, i) =>
    i >= at ? { ...f, lng: f.lng + meters / M_LNG } : f
  )
}

// Backend mirror -----------------------------------------------------------
const SERVER = {
  maxSegment: 20,
  maxSustained: 12,
  ratio: 0.3,
  maxConsecutive: 5,
}
function seg(a, b) {
  const s = (b.timestamp - a.timestamp) / 1000
  if (s <= 0) return { v: Infinity, s }
  return { v: haversineDistance(a, b) / s, s }
}
export function serverVerdict(points, avgPaceMinKm = null) {
  if (!points.length) return { rejected: false }
  const kept = [points[0]]
  for (let i = 1; i < points.length; i += 1) {
    if (seg(kept[kept.length - 1], points[i]).v <= SERVER.maxSegment)
      kept.push(points[i])
  }
  if (avgPaceMinKm != null && 1000 / (avgPaceMinKm * 60) > SERVER.maxSustained)
    return { rejected: true, why: 'avg pace' }
  let viol = 0
  let streak = 0
  for (let i = 1; i < kept.length; i += 1) {
    const { v, s } = seg(kept[i - 1], kept[i])
    if (v > SERVER.maxSustained) {
      viol += 1
      streak += s
      if (streak >= SERVER.maxConsecutive)
        return { rejected: true, why: 'consecutive' }
    } else streak = 0
  }
  const segs = Math.max(1, kept.length - 1)
  return viol / segs > SERVER.ratio
    ? { rejected: true, why: 'ratio' }
    : { rejected: false }
}

// Run the feed through the live client pipeline.
export function replay(
  fixes,
  {
    motionSensing = true,
    accessibility = false,
    pauseAt = [],
    // false = the pipeline as it was before the distance filter (raw hops).
    distanceFilter = true,
    wobbleGate = true,
    filterConfig = {},
  } = {}
) {
  let det = createVehicleDetector({
    hasMotionSensing: motionSensing,
    accessibilityMode: accessibility,
  })
  const accepted = []
  const states = new Set([VehicleState.RUNNING])
  let distance = 0
  let excluded = 0
  let lastKeptT = -Infinity
  let wobbleDrops = 0
  let rawDistance = 0
  const df = createDistanceFilter({
    maxSpeedMs: accessibility ? 8 * 1.6 : 8,
    ...filterConfig,
  })
  let lastStepT = null
  let firstFlagAt = null
  let discardedAt = null
  let resumePending = false
  fixes.forEach((fix, i) => {
    if (pauseAt.includes(i)) {
      det = createVehicleDetector({
        hasMotionSensing: motionSensing,
        accessibilityMode: accessibility,
      })
      resumePending = true
    }
    // sensors keep reporting between fixes
    if (motionSensing && fix.steps != null) {
      const from = lastStepT ?? fix.timestamp - 1000
      // Accelerometer samples (20 Hz): flat for a smooth ride, wobbling by
      // +-wobble for a body in motion even when no clean step peaks show.
      for (let t = from, k = 0; t < fix.timestamp; t += 50, k += 1)
        det.handleMotionSample(9.81 + (k % 2 ? fix.wobble : -fix.wobble), t)
      if (fix.steps > 0)
        for (let t = from; t < fix.timestamp; t += 1000 / fix.steps)
          det.recordStep(t)
      lastStepT = fix.timestamp
    }
    if (fix.accuracy != null && fix.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS)
      return
    if (fix.timestamp - lastKeptT < MIN_POINT_INTERVAL_MS) return
    const prev = accepted[accepted.length - 1]
    // Same wobble gate as the live tracker (not across a pause/resume gap).
    if (
      prev &&
      !resumePending &&
      wobbleGate &&
      wobbleDrops < MAX_CONSECUTIVE_WOBBLE_DROPS &&
      isGpsWobble(prev, fix)
    ) {
      wobbleDrops += 1
      return
    }
    wobbleDrops = 0
    lastKeptT = fix.timestamp
    accepted.push(fix)
    const dfFix = {
      lat: fix.lat,
      lng: fix.lng,
      timestamp: fix.timestamp,
      accuracy: fix.accuracy,
      speed: fix.speedMps,
    }
    if (!prev) {
      df.process(dfFix)
      return
    }
    if (resumePending) {
      resumePending = false
      det.addGpsPoint(fix) // primes only; the gap itself is an excluded JUMP
      df.rebase(dfFix)
      return
    }
    const out = det.addGpsPoint(fix)
    states.add(out.state)
    if (out.state !== VehicleState.RUNNING && firstFlagAt == null)
      firstFlagAt = Math.round((fix.timestamp - T0) / 1000)
    if (out.state === VehicleState.DISCARDED && discardedAt == null)
      discardedAt = Math.round((fix.timestamp - T0) / 1000)
    if (out.segment) {
      const isJump = out.segment.kind === 'jump'
      // Same as the live tracker: the filter sees every non-jump fix (it
      // keeps its anchor), only a non-excluded one is credited.
      const credited =
        !isJump && distanceFilter
          ? df.process(dfFix, {
              secondsSinceStep: det.secondsSinceStep(fix.timestamp),
            }).meters
          : out.segment.distanceMeters
      if (out.segment.excluded) {
        if (out.segment.kind === 'vehicle') excluded += credited
      } else {
        distance += credited
        rawDistance += out.segment.distanceMeters
      }
    }
    if (out.reclaimMeters > 0) {
      const st = df.getStats()
      const scale =
        distanceFilter && st.rawMeters > 0
          ? Math.min(1, st.countedMeters / st.rawMeters)
          : 1
      const back = Math.min(out.reclaimMeters * scale, distance)
      distance -= back
      excluded += back
    }
  })
  const considered = distance + excluded
  const seconds = accepted.length
    ? (accepted[accepted.length - 1].timestamp - accepted[0].timestamp) / 1000
    : 0
  const avgPace =
    distance > 0 && seconds > 0 ? seconds / 60 / (distance / 1000) : null
  return {
    states,
    flagged:
      states.has(VehicleState.VEHICLE) || states.has(VehicleState.DISCARDED),
    suspect: states.has(VehicleState.SUSPECT),
    discarded: states.has(VehicleState.DISCARDED),
    firstFlagAt,
    discardedAt,
    distance,
    rawDistance,
    filterStats: df.getStats(),
    acceptedCount: accepted.length,
    ratio: considered > 0 ? excluded / considered : 0,
    server: serverVerdict(accepted, avgPace),
  }
}
