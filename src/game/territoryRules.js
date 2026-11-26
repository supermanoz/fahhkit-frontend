// The ONE place the client's territory-capture rules live. The backend is the
// source of truth - every value and algorithm here mirrors it, so the client's
// "closed / not closed / area / valid" answer for a track is the answer the
// server will give for the same track. Do not tighten or loosen anything here
// on the client's own initiative: change the server first, then this file
// (the shared fixtures in territoryFixtures.json - run by territoryRules.test.js
// here and TerritoryRuleFixturesTest on the backend - fail if the two drift).
//
// Backend references (fahhkit, feature/territory-game):
//   TerritoryLoopProperties            territory.loop.*      closure / min area / simplify / min points
//   TerritoryAntiCheatProperties       territory.anticheat.* segment + sustained speed
//   RunServiceImpl#MAX_ACCEPTABLE_ACCURACY_METERS (hardcoded, 20 m)
//   TerritoryProcessingServiceImpl     teleport filter -> sustained speed -> loop build
//   TerritoryLoopBuilderServiceImpl    closure check, sub-loop rescue, simplify, repair, area
//   TerritoryGeometryOps#haversineMeters (R = 6 371 000 m)
//
// Remote values: initTerritoryRules() loads the server's own constants (proposed
// endpoint GET /v1/territory/rules, see docs/territory-rules-backend-ask.md),
// caches them, and falls back to DEFAULT_TERRITORY_RULES when the call fails.
import polygonClipping from 'polygon-clipping'

export const DEFAULT_TERRITORY_RULES = Object.freeze({
  // territory.loop.closure-threshold-meters
  closureThresholdMeters: 25,
  // territory.loop.min-enclosed-area-sq-meters
  minEnclosedAreaSqMeters: 2000,
  // territory.loop.simplify-tolerance-meters
  simplifyToleranceMeters: 3,
  // territory.loop.min-points (also the minimum span of a rescued sub-loop)
  minPoints: 10,
  // RunServiceImpl.MAX_ACCEPTABLE_ACCURACY_METERS (hardcoded server-side)
  maxAcceptableAccuracyMeters: 20,
  // territory.anticheat.max-segment-speed-meters-per-second
  maxSegmentSpeedMetersPerSecond: 20,
  // territory.anticheat.max-sustained-speed-meters-per-second
  maxSustainedSpeedMetersPerSecond: 12,
  // territory.anticheat.max-sustained-speed-violation-ratio
  maxSustainedSpeedViolationRatio: 0.3,
  // territory.anticheat.max-consecutive-violation-seconds
  maxConsecutiveViolationSeconds: 5,
})

const STORAGE_KEY = 'territory.rules.v1'
let active = DEFAULT_TERRITORY_RULES
const listeners = new Set()

function sanitize(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(DEFAULT_TERRITORY_RULES)) {
    const v = raw[key]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[key] = v
  }
  return out
}

export function getTerritoryRules() {
  return active
}

// Accepts a (possibly partial) rules object from the server; unknown or
// invalid fields are ignored, missing ones keep the built-in value.
export function setTerritoryRules(remote) {
  active = Object.freeze({ ...DEFAULT_TERRITORY_RULES, ...sanitize(remote) })
  listeners.forEach((fn) => fn(active))
  return active
}

export function resetTerritoryRules() {
  return setTerritoryRules(null)
}

export function subscribeTerritoryRules(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Startup: apply the last cached server values immediately, then refresh from
// the server. Any failure keeps whatever is active (cache, else built-ins).
export async function initTerritoryRules(fetcher) {
  try {
    const cached = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY))
    if (cached) setTerritoryRules(cached)
  } catch {
    /* no cache */
  }
  try {
    const remote = await fetcher()
    const clean = sanitize(remote)
    if (Object.keys(clean).length) {
      setTerritoryRules(clean)
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(clean))
      } catch {
        /* storage full / blocked */
      }
    }
  } catch {
    /* endpoint missing or offline: keep current rules */
  }
  return active
}

// --- geometry (same formulas as the server) --------------------------------

const EARTH_RADIUS_METERS = 6_371_000
const METERS_PER_DEGREE = 111_320

// TerritoryGeometryOps#haversineMeters (atan2 form, R = 6 371 000).
export function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// Planar metres around an origin latitude, exactly like the loop builder's
// reprojectCoordinates (lng * cos(originLat) * 111 320, lat * 111 320).
function toPlanar(points, origin) {
  const lngScale = Math.cos((origin.lat * Math.PI) / 180) * METERS_PER_DEGREE
  return points.map((p) => [p.lng * lngScale, p.lat * METERS_PER_DEGREE])
}

// Douglas-Peucker, endpoints kept - the server uses JTS
// TopologyPreservingSimplifier with the same tolerance, which is Douglas-
// Peucker plus a "never create a crossing" guard (differs only on tracks
// whose simplification would self-intersect).
function simplifyLine(pts, tolerance) {
  const n = pts.length
  if (n < 3) return pts
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack = [[0, n - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let maxD = -1
    let idx = -1
    const [x1, y1] = pts[s]
    const [x2, y2] = pts[e]
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i]
      let d
      if (len2 === 0) {
        d = Math.hypot(px - x1, py - y1)
      } else {
        const t = Math.max(
          0,
          Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)
        )
        d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
      }
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > tolerance) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

function ringArea(ring) {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(sum / 2)
}

function ringLength(ring) {
  let len = 0
  for (let i = 0; i < ring.length - 1; i++) {
    len += Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1])
  }
  return len
}

// --- the server's per-run filters ------------------------------------------

function tMillis(p) {
  const t = p.timestamp ?? p.recordedAt ?? p.t
  return typeof t === 'number' ? t : null
}

// RunServiceImpl: points with a reported accuracy worse than 20 m never reach
// the server's trace (no accuracy = kept).
export function filterAccuracy(points, rules = active) {
  return points.filter(
    (p) => p.accuracy == null || p.accuracy <= rules.maxAcceptableAccuracyMeters
  )
}

function segmentSpeed(from, to) {
  const a = tMillis(from)
  const b = tMillis(to)
  const seconds = a == null || b == null ? 0 : (b - a) / 1000
  // simultaneous / out-of-order timestamps: a violation, never a divide
  if (seconds <= 0)
    return { metersPerSecond: Infinity, elapsedSeconds: seconds }
  return {
    metersPerSecond: haversineMeters(from, to) / seconds,
    elapsedSeconds: seconds,
  }
}

// TerritoryAntiCheatValidator#filterTeleportingPoints: drop points whose
// implied speed from the last RETAINED point exceeds the segment limit.
export function filterTeleportingPoints(points, rules = active) {
  if (points.length === 0) return points
  const accepted = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = accepted[accepted.length - 1]
    if (
      segmentSpeed(prev, points[i]).metersPerSecond <=
      rules.maxSegmentSpeedMetersPerSecond
    ) {
      accepted.push(points[i])
    }
  }
  return accepted
}

// TerritoryAntiCheatValidator#isSustainedSpeedPlausible.
export function isSustainedSpeedPlausible(
  points,
  avgPaceMinutesPerKm = null,
  rules = active
) {
  if (avgPaceMinutesPerKm != null) {
    if (
      1000 / (avgPaceMinutesPerKm * 60) >
      rules.maxSustainedSpeedMetersPerSecond
    )
      return false
  }
  if (points.length < 2) return true
  const segments = points.length - 1
  let violations = 0
  let streak = 0
  for (let i = 1; i < points.length; i++) {
    const seg = segmentSpeed(points[i - 1], points[i])
    if (seg.metersPerSecond > rules.maxSustainedSpeedMetersPerSecond) {
      violations += 1
      if (seg.elapsedSeconds <= 0) return false
      streak += seg.elapsedSeconds
      if (streak >= rules.maxConsecutiveViolationSeconds) return false
    } else {
      streak = 0
    }
  }
  return violations / segments <= rules.maxSustainedSpeedViolationRatio
}

// --- loop builder (TerritoryLoopBuilderServiceImpl) -------------------------

export const LoopRejection = Object.freeze({
  NOT_ENOUGH_POINTS: 'NOT_ENOUGH_POINTS',
  LOOP_NOT_CLOSED: 'LOOP_NOT_CLOSED',
  AREA_TOO_SMALL: 'AREA_TOO_SMALL',
  INVALID_GEOMETRY_AFTER_REPAIR: 'INVALID_GEOMETRY_AFTER_REPAIR',
})

function rejected(reason) {
  return { ok: false, reason }
}

function buildFromRange(ordered, start, end, closureGapMeters, rules) {
  const range = ordered.slice(start, end + 1)
  const planar = toPlanar(range, range[0])
  const simplified = simplifyLine(planar, rules.simplifyToleranceMeters)
  const ring = [...simplified, simplified[0]]
  // JTS createPolygon throws for a ring of fewer than 4 coordinates
  if (ring.length < 4)
    return rejected(LoopRejection.INVALID_GEOMETRY_AFTER_REPAIR)

  // repairIfInvalid + largestPolygon: a self-crossing ring is split at its
  // crossings (polygon-clipping, like JTS buffer(0)) and only the largest
  // lobe is kept.
  let parts
  try {
    parts = polygonClipping.union([[ring]])
  } catch {
    return rejected(LoopRejection.INVALID_GEOMETRY_AFTER_REPAIR)
  }
  let best = null
  let bestArea = -1
  for (const poly of parts) {
    const [outer, ...holes] = poly
    const area = ringArea(outer) - holes.reduce((s, h) => s + ringArea(h), 0)
    if (area > bestArea) {
      bestArea = area
      best = poly
    }
  }
  if (!best || !(bestArea > 0)) {
    return rejected(LoopRejection.INVALID_GEOMETRY_AFTER_REPAIR)
  }
  const perimeterMeters = best.reduce((s, r) => s + ringLength(r), 0)
  if (bestArea < rules.minEnclosedAreaSqMeters) {
    return rejected(LoopRejection.AREA_TOO_SMALL)
  }
  return {
    ok: true,
    reason: null,
    areaSqMeters: bestArea,
    perimeterMeters,
    closureGapMeters,
    range: [start, end],
    // planar ring (metres) for previews that want the exact polygon the
    // server would store, converted back to lat/lng:
    ring: best[0].map(([x, y]) => ({
      lat: y / METERS_PER_DEGREE,
      lng: x / (Math.cos((range[0].lat * Math.PI) / 180) * METERS_PER_DEGREE),
    })),
  }
}

// For each possible loop start, the farthest point that still closes within
// the threshold (planar distance) is that start's widest candidate;
// candidates are tried widest-first until one builds a valid territory.
function findClosingSubRange(ordered, rules) {
  const n = ordered.length
  const minSpan = rules.minPoints
  const planar = toPlanar(ordered, ordered[0])
  const thresholdSq = rules.closureThresholdMeters ** 2
  const candidates = []
  for (let i = 0; i <= n - minSpan; i++) {
    for (let j = n - 1; j >= i + minSpan - 1; j--) {
      const dx = planar[i][0] - planar[j][0]
      const dy = planar[i][1] - planar[j][1]
      if (dx * dx + dy * dy <= thresholdSq) {
        candidates.push([i, j])
        break
      }
    }
  }
  candidates.sort((a, b) => b[1] - b[0] - (a[1] - a[0])) // stable, widest first
  for (const [start, end] of candidates) {
    const gap = haversineMeters(ordered[start], ordered[end])
    const result = buildFromRange(ordered, start, end, gap, rules)
    if (result.ok) return result
  }
  return null
}

// TerritoryLoopBuilderService#build. `points` are the trace the server will
// actually see (already accuracy/teleport filtered - see evaluateTrack).
export function buildLoop(points, rules = active) {
  if (!points || points.length < rules.minPoints) {
    return rejected(LoopRejection.NOT_ENOUGH_POINTS)
  }
  const first = points[0]
  const last = points[points.length - 1]
  const gap = haversineMeters(first, last)
  if (gap <= rules.closureThresholdMeters) {
    return buildFromRange(points, 0, points.length - 1, gap, rules)
  }
  return (
    findClosingSubRange(points, rules) ||
    rejected(LoopRejection.LOOP_NOT_CLOSED)
  )
}

// The whole server pipeline for a Conquer run, in the server's order:
// teleport filter -> sustained-speed check -> loop build. `points` carry
// lat/lng and a ms `timestamp` (the tracker's own shape).
export function evaluateTrack(
  points,
  { avgPaceMinutesPerKm = null, rules = active } = {}
) {
  const kept = filterTeleportingPoints(
    filterAccuracy(points || [], rules),
    rules
  )
  if (!isSustainedSpeedPlausible(kept, avgPaceMinutesPerKm, rules)) {
    return { outcome: 'CHEAT_DETECTED', keptPoints: kept.length }
  }
  const loop = buildLoop(kept, rules)
  return loop.ok
    ? { outcome: 'CLOSED', keptPoints: kept.length, ...loop }
    : { outcome: loop.reason, keptPoints: kept.length }
}

// --- consumers' helpers ------------------------------------------------------

// True when the server would answer LOOP_NOT_CLOSED: the track neither ends
// within the closure distance of its start nor contains a sub-loop that does
// (and clears the minimum area). Fewer than 2 points = nothing to close yet.
// A loop that closes but is too small / too few points is NOT "open" - see
// loopTooThin.
export function isLoopOpen(points, rules = active) {
  if (!points || points.length < 2) return true
  const kept = filterTeleportingPoints(filterAccuracy(points, rules), rules)
  if (kept.length < 2) return true
  if (
    haversineMeters(kept[0], kept[kept.length - 1]) <=
    rules.closureThresholdMeters
  ) {
    return false
  }
  return buildLoop(kept, rules).reason === LoopRejection.LOOP_NOT_CLOSED
}

// Closed (or closable) but the server would still refuse it for size.
export function loopTooThin(points, rules = active) {
  const result = evaluateTrack(points, { rules })
  return (
    result.outcome === LoopRejection.NOT_ENOUGH_POINTS ||
    result.outcome === LoopRejection.AREA_TOO_SMALL
  )
}

// User-facing copy built from the live thresholds - never hardcode these
// numbers in a message.
export function closureHint(rules = active) {
  return `Finish within ${Math.round(rules.closureThresholdMeters)} m of where you started.`
}

export function minAreaHint(rules = active) {
  return `Territory needs at least ${Math.round(rules.minEnclosedAreaSqMeters).toLocaleString('en-US')} m² inside the loop.`
}
