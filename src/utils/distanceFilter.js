// Counted-distance filter for a live run: turns noisy GPS fixes into the
// distance the run is credited with. Pure - no React/DOM - so it is unit-tested
// and simulated directly (see distanceFilter.test.js / fraudSim.test.js).
//
// WHY: the distance between two imprecise fixes is mostly GPS wobble. Summing
// raw hops credits a phone lying still with hundreds of metres, and inflates a
// real walk several times over. This is DISTANCE ACCURACY only: the vehicle /
// fraud detector (utils/vehicleDetection.js) still sees every raw fix and
// judges speed from them, untouched. The raw points also stay as they are for
// the route display and the upload; only the credited length changes.
//
// HOW (per fix, after the tracker's own 20 m accuracy gate):
//   STATIONARY  an anchor holds. A fix adds nothing unless it is beyond
//               max(1.5 x its accuracy, 8 m) from the anchor AND consistent
//               with real movement (device speed >= 0.6 m/s, or 3+ fixes in a
//               row beyond that radius in a consistent direction while the
//               chip does not say "still"). Footstep sensor: no steps for 10 s
//               plus low speed holds the anchor regardless. Not confirmed =
//               drift (anchor stays, nudged slowly towards the mean).
//   MOVING      each fix adds its own increment (see estimate()); 3 fixes in a
//               row at ~0 speed (or all inside the radius when the chip gives
//               no speed) go back to STATIONARY.
//   On confirming movement the increments held since the anchor are credited,
//   so nothing is lost at the start of a walk.
//   estimate(): fixes worse than GOOD accuracy use the chip's own (Doppler)
//   speed x dt, which wobble cannot inflate; precise fixes (or no chip speed)
//   use the chord between lightly smoothed positions, decimated to a minimum
//   vertex spacing so tiny zigzags do not add length. Every increment is
//   capped at maxSpeed x dt.
import { haversineDistance } from './run'
import { validDeviceSpeed } from './vehicleDetection'
import { GAP_SECONDS } from '../constants/antiCheat'

export const DISTANCE_FILTER_CONFIG = Object.freeze({
  // Fixes worse than this never count at all (the tracker's own gate, 20 m,
  // already runs first; this keeps the filter correct when fed raw data).
  dropAccuracyM: 30,
  // A fix must be this far from the anchor to count as movement:
  // max(anchorAccuracyFactor x its accuracy, anchorMinRadiusM).
  anchorAccuracyFactor: 1.5,
  anchorMinRadiusM: 8,
  // Chip speed at/above this = moving. Below stillSpeedMs the chip says "not
  // moving": sustained displacement alone is then not believed.
  movingSpeedMs: 0.6,
  stillSpeedMs: 0.3,
  // A chip speed at/above movingSpeedMs must hold for this many fixes in a
  // row (the newest included) to confirm movement: one noisy Doppler reading
  // must not start counting.
  movingConfirmFixes: 2,
  // Consecutive fixes beyond the radius, in a consistent direction (all
  // bearings from the anchor within this tolerance of the first), that
  // confirm movement when the chip gives no (or a low) speed.
  sustainedFixes: 3,
  sustainedBearingToleranceDeg: 60,
  // While drifting, the anchor moves this fraction of the way to each fix
  // that is inside the radius (0 = never moves).
  anchorDriftPull: 0.1,
  // Fastest credited speed for a running mode (m/s). An increment above
  // maxSpeedMs x dt is capped - a GPS jump never credits more than that.
  maxSpeedMs: 8,
  // Footsteps: this long with no step AND speed below stepQuietMaxSpeedMs =
  // stationary (in either state). Skipped - never a failure - without a
  // working sensor, and while the accelerometer shows body motion (steps the
  // peak detector missed, e.g. an armband): see secondsSinceStep().
  stepQuietSeconds: 10,
  stepQuietMaxSpeedMs: 0.6,
  // A fix worse than this (either end of a hop) is credited from the chip's own
  // speed x dt when the chip gives a valid one: Doppler is good to ~0.3 m/s and
  // position wobble cannot inflate it.
  dopplerAboveAccuracyM: 3,
  // Position smoothing (EMA weight of the newest fix; the lighter weight is
  // used for imprecise fixes) and the minimum spacing between counted vertices
  // of the smoothed path (grows with the fix's accuracy: tiny zigzags and
  // wobble smaller than the uncertainty must not add length).
  smoothingAlpha: 0.5,
  smoothingAlphaPoor: 0.25,
  vertexMinM: 5,
  vertexAccuracyFactor: 0.8,
  // Fixes in a row at ~0 speed that end MOVING.
  stopConfirmFixes: 3,
  // Longer than this between fixes = signal gap: the straight line is used.
  gapSeconds: GAP_SECONDS,
  // Fixes remembered since the anchor (movement-start credit / direction).
  bufferMax: 8,
  // Calibration histogram upper bounds (m); the last bucket is "above".
  histogramBoundsM: Object.freeze([5, 10, 15, 20, 30]),
})

export const FilterState = Object.freeze({
  STATIONARY: 'stationary',
  MOVING: 'moving',
})

const toRad = (d) => (d * Math.PI) / 180
function bearingDeg(a, b) {
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
const angleDiff = (a, b) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

export function createDistanceFilter(overrides = {}) {
  const cfg = { ...DISTANCE_FILTER_CONFIG, ...overrides }
  let state = FilterState.STATIONARY
  let anchor = null // {lat,lng}
  let lastFix = null
  let smoothed = null
  let vertex = null
  let buffer = [] // {fix, est}
  let lowSpeedStreak = 0
  let recent = [] // last fixes while moving (no-speed stop detection)
  let stats = freshStats()

  function freshStats() {
    return {
      fixes: 0,
      rawMeters: 0,
      countedMeters: 0,
      driftDrops: 0,
      accuracyDropped: 0,
      histogram: new Array(cfg.histogramBoundsM.length + 1).fill(0),
    }
  }

  function bucketOf(accuracy) {
    if (accuracy == null) return 0
    const i = cfg.histogramBoundsM.findIndex((b) => accuracy <= b)
    return i === -1 ? cfg.histogramBoundsM.length : i
  }

  // A fix the tracker rejected before it got here (e.g. worse than 20 m):
  // counted only for the accuracy histogram.
  function noteRejectedFix(accuracy) {
    stats.accuracyDropped += 1
    stats.histogram[bucketOf(accuracy)] += 1
  }

  function smooth(fix) {
    const alpha =
      (fix.accuracy ?? 0) > cfg.dopplerAboveAccuracyM
        ? cfg.smoothingAlphaPoor
        : cfg.smoothingAlpha
    smoothed = smoothed
      ? {
          lat: smoothed.lat + alpha * (fix.lat - smoothed.lat),
          lng: smoothed.lng + alpha * (fix.lng - smoothed.lng),
        }
      : { lat: fix.lat, lng: fix.lng }
    if (!vertex) vertex = smoothed
  }

  // Credited length of the hop lastFix -> fix.
  function estimate(prev, fix, dt, speed) {
    const cap = cfg.maxSpeedMs * dt
    const chord = haversineDistance(prev, fix)
    if (dt > cfg.gapSeconds) {
      vertex = smoothed
      return Math.min(chord, cap)
    }
    const accuracy = Math.max(prev.accuracy ?? 0, fix.accuracy ?? 0)
    if (speed != null && accuracy > cfg.dopplerAboveAccuracyM) {
      vertex = smoothed
      return Math.min(speed * dt, cap)
    }
    // Position-based: chord between smoothed vertices, decimated.
    const hop = haversineDistance(vertex, smoothed)
    const minHop = Math.max(cfg.vertexMinM, cfg.vertexAccuracyFactor * accuracy)
    if (hop < minHop) return 0
    vertex = smoothed
    return Math.min(hop, cap)
  }

  function radiusFor(fix) {
    return Math.max(
      cfg.anchorAccuracyFactor * (fix.accuracy ?? 0),
      cfg.anchorMinRadiusM
    )
  }

  function sustained() {
    const n = cfg.sustainedFixes
    if (buffer.length < n) return false
    const tail = buffer.slice(-n)
    const first = bearingDeg(anchor, tail[0].fix)
    return tail.every(
      ({ fix: f }) =>
        haversineDistance(anchor, f) > radiusFor(f) &&
        angleDiff(bearingDeg(anchor, f), first) <=
          cfg.sustainedBearingToleranceDeg
    )
  }

  // fix: {lat, lng, timestamp, accuracy, speed}. ctx.secondsSinceStep: null
  // when there is no usable step sensor, else seconds since the last step.
  // Returns {meters, dropped, state}.
  function process(fix, { secondsSinceStep = null } = {}) {
    if (fix.accuracy != null && fix.accuracy > cfg.dropAccuracyM) {
      noteRejectedFix(fix.accuracy)
      return { meters: 0, dropped: true, state }
    }
    stats.fixes += 1
    stats.histogram[bucketOf(fix.accuracy)] += 1
    const speed = validDeviceSpeed(fix.speed)
    if (!lastFix) {
      anchor = { lat: fix.lat, lng: fix.lng }
      lastFix = fix
      smooth(fix)
      return { meters: 0, dropped: false, state }
    }
    const dt = (fix.timestamp - lastFix.timestamp) / 1000
    if (dt <= 0) return { meters: 0, dropped: true, state }
    stats.rawMeters += haversineDistance(lastFix, fix)
    smooth(fix)
    const est = estimate(lastFix, fix, dt, speed)
    lastFix = fix

    if (state === FilterState.STATIONARY) {
      buffer.push({ fix, est, speed })
      if (buffer.length > cfg.bufferMax) buffer.shift()
      const d = haversineDistance(anchor, fix)
      const quiet =
        secondsSinceStep != null &&
        secondsSinceStep >= cfg.stepQuietSeconds &&
        (speed == null || speed < cfg.stepQuietMaxSpeedMs)
      const chipSaysStill = speed != null && speed < cfg.stillSpeedMs
      let confirmed = false
      if (!quiet && d > radiusFor(fix)) {
        confirmed =
          (speed != null &&
            speed >= cfg.movingSpeedMs &&
            buffer.length >= cfg.movingConfirmFixes &&
            buffer
              .slice(-cfg.movingConfirmFixes)
              .every((b) => b.speed != null && b.speed >= cfg.movingSpeedMs)) ||
          (!chipSaysStill && sustained()) ||
          dt > cfg.gapSeconds
      }
      if (!confirmed) {
        stats.driftDrops += 1
        if (d <= radiusFor(fix)) {
          anchor = {
            lat: anchor.lat + cfg.anchorDriftPull * (fix.lat - anchor.lat),
            lng: anchor.lng + cfg.anchorDriftPull * (fix.lng - anchor.lng),
          }
        }
        return { meters: 0, dropped: true, state }
      }
      // Movement confirmed: credit everything held since the anchor.
      const meters = buffer.reduce((sum, b) => sum + b.est, 0)
      buffer = []
      state = FilterState.MOVING
      anchor = { lat: fix.lat, lng: fix.lng }
      lowSpeedStreak = 0
      recent = [fix]
      stats.countedMeters += meters
      return { meters, dropped: false, state }
    }

    // MOVING
    const quietNow =
      secondsSinceStep != null &&
      secondsSinceStep >= cfg.stepQuietSeconds &&
      (speed == null || speed < cfg.stepQuietMaxSpeedMs)
    recent.push(fix)
    if (recent.length > cfg.stopConfirmFixes) recent.shift()
    let stopped
    if (quietNow) stopped = true
    else if (speed != null) stopped = speed < cfg.stillSpeedMs
    else {
      const c = {
        lat: recent.reduce((s, f) => s + f.lat, 0) / recent.length,
        lng: recent.reduce((s, f) => s + f.lng, 0) / recent.length,
      }
      stopped =
        recent.length >= cfg.stopConfirmFixes &&
        recent.every((f) => haversineDistance(c, f) <= radiusFor(f))
    }
    lowSpeedStreak = stopped ? lowSpeedStreak + 1 : 0
    stats.countedMeters += est
    if (lowSpeedStreak >= cfg.stopConfirmFixes) {
      state = FilterState.STATIONARY
      anchor = { lat: fix.lat, lng: fix.lng }
      buffer = []
      lowSpeedStreak = 0
      vertex = smoothed
    }
    return { meters: est, dropped: false, state }
  }

  // After a pause/resume (or any deliberate break): start fresh from here.
  function rebase(fix) {
    state = FilterState.STATIONARY
    anchor = { lat: fix.lat, lng: fix.lng }
    lastFix = fix
    smoothed = { lat: fix.lat, lng: fix.lng }
    vertex = smoothed
    buffer = []
    recent = []
    lowSpeedStreak = 0
  }

  return {
    process,
    rebase,
    noteRejectedFix,
    getState: () => state,
    // Calibration numbers (dev/debug only): raw path length of the fixes
    // processed vs the length credited, fixes held as drift, and how many
    // fixes fell in each accuracy band.
    getStats: () => ({
      ...stats,
      histogram: [...stats.histogram],
      state,
    }),
  }
}

// Label for each calibration histogram bucket, e.g. ['<=5','<=10',...,'>30'].
export function histogramLabels(
  bounds = DISTANCE_FILTER_CONFIG.histogramBoundsM
) {
  return [...bounds.map((b) => `<=${b}`), `>${bounds[bounds.length - 1]}`]
}
