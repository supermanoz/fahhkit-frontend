// Client-only "Territory Run" game state. There's no backend support for
// this yet (no territory/club/coin endpoints exist), so everything here
// lives in localStorage on this device — it's a real, playable loop, just
// not synced anywhere.
import { haversineDistance } from './run'

const STORAGE_KEY = 'fahhkit_territory_game_v1'

// Naxal, Kathmandu — matches the address already shown on the Contact page,
// so the default map view lines up with where the club actually runs.
export const DEFAULT_CENTER = { lat: 27.7166, lng: 85.3247 }

export const MIN_LOOP_POINTS = 3
export const MIN_LOOP_PERIMETER_METERS = 80

// How far from the player the map lets you look — a fenced-in patch of
// world instead of the whole city, the way Pokémon GO keeps you tethered
// close to your own position rather than free-panning the map.
export const VIEW_RADIUS_METERS = 400

export function boundsForRadius(center, radiusMeters) {
  const dLat = radiusMeters / 111320
  const dLng = radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180))
  return [
    [center.lat - dLat, center.lng - dLng],
    [center.lat + dLat, center.lng + dLng],
  ]
}

// Distinct from the site's UI chrome palette (brand orange) on purpose, so
// territory fills never get mistaken for a button or banner.
export const PLAYER_COLOR = '#2E86AB'
const RIVAL_COLORS = ['#6A4C93', '#C1666B', '#1B998B']
const RIVAL_NAMES = ['Aashish', 'Prakriti', 'Sudip']

// Small fixed offsets (in degrees, roughly tens of meters at this latitude)
// around a center point, turned into a lopsided loop rather than a perfect
// circle so it reads as a hand-run route, not a drawn shape.
const RIVAL_SHAPES = [
  [
    [0.0009, -0.0016],
    [0.0016, -0.0006],
    [0.0012, 0.0006],
    [0.0002, 0.0009],
    [-0.0006, 0.0002],
    [-0.0004, -0.001],
  ],
  [
    [-0.0014, 0.0011],
    [-0.0006, 0.0018],
    [0.0004, 0.0014],
    [0.0006, 0.0004],
    [-0.0004, -0.0002],
  ],
  [
    [0.0004, 0.0022],
    [0.0014, 0.0026],
    [0.0018, 0.0016],
    [0.001, 0.0009],
    [0.0002, 0.0014],
  ],
]

function seedRivalTerritories() {
  return RIVAL_SHAPES.map((shape, i) => {
    const points = shape.map(([dLat, dLng]) => ({
      lat: DEFAULT_CENTER.lat + dLat,
      lng: DEFAULT_CENTER.lng + dLng,
    }))
    return {
      id: `rival-${i}`,
      ownerId: 'rival',
      ownerName: RIVAL_NAMES[i],
      color: RIVAL_COLORS[i],
      points,
      area: polygonAreaSqMeters(points),
      claimedAt: new Date().toISOString(),
    }
  })
}

function defaultState() {
  return {
    territories: seedRivalTerritories(),
    coinBalance: 0,
  }
}

export function loadGameState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.territories)) return defaultState()
    return parsed
  } catch {
    return defaultState()
  }
}

export function saveGameState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full/unavailable — the run just won't persist past this page load.
  }
}

// Shoelace formula on a local equirectangular projection (meters, scaled by
// cos(latitude)) — accurate enough for loops a few hundred meters across,
// which is the entire range this game deals in.
export function polygonAreaSqMeters(points) {
  if (!points || points.length < 3) return 0
  const R = 6371000
  const refLat = (points[0].lat * Math.PI) / 180
  const xy = points.map((p) => [
    ((p.lng * Math.PI) / 180) * R * Math.cos(refLat),
    ((p.lat * Math.PI) / 180) * R,
  ])
  let sum = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i]
    const [x2, y2] = xy[(i + 1) % xy.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum / 2)
}

export function loopPerimeterMeters(points) {
  if (!points || points.length < 2) return 0
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(points[i], points[i + 1])
  }
  total += haversineDistance(points[points.length - 1], points[0])
  return total
}

// Ray-casting point-in-polygon — lat/lng used directly rather than
// projected, which is fine at the scale (a few hundred meters) this game
// operates at.
export function pointInPolygon(point, polygonPoints) {
  let inside = false
  for (
    let i = 0, j = polygonPoints.length - 1;
    i < polygonPoints.length;
    j = i++
  ) {
    const pi = polygonPoints[i]
    const pj = polygonPoints[j]
    const intersects =
      pi.lat > point.lat !== pj.lat > point.lat &&
      point.lng <
        ((pj.lng - pi.lng) * (point.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lng
    if (intersects) inside = !inside
  }
  return inside
}

function segmentsIntersect(p1, p2, p3, p4) {
  const orientation = (a, b, c) => {
    const val =
      (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
    if (Math.abs(val) < 1e-15) return 0
    return val > 0 ? 1 : 2
  }
  const onSegment = (a, b, c) =>
    Math.min(a.lng, c.lng) <= b.lng &&
    b.lng <= Math.max(a.lng, c.lng) &&
    Math.min(a.lat, c.lat) <= b.lat &&
    b.lat <= Math.max(a.lat, c.lat)

  const o1 = orientation(p1, p2, p3)
  const o2 = orientation(p1, p2, p4)
  const o3 = orientation(p3, p4, p1)
  const o4 = orientation(p3, p4, p2)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1, p3, p2)) return true
  if (o2 === 0 && onSegment(p1, p4, p2)) return true
  if (o3 === 0 && onSegment(p3, p1, p4)) return true
  if (o4 === 0 && onSegment(p3, p2, p4)) return true
  return false
}

// True if the two loops share any ground at all — either one contains a
// vertex of the other, or their edges actually cross. Covers full
// containment, partial clipping, and edge-touching cases, which is enough
// to reason about for the hand-drawn, non-self-intersecting loops this game
// produces (there's no backend geometry engine to defer to — the FahhKit
// API has no territory/polygon logic at all yet — so this client-side check
// is the only thing standing between claims and overlapping parcels).
export function polygonsOverlap(a, b) {
  if (a.some((p) => pointInPolygon(p, b))) return true
  if (b.some((p) => pointInPolygon(p, a))) return true
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]
      const b2 = b[(j + 1) % b.length]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

// The single source of truth for whether a drawn loop can be claimed —
// enforces that territories never overlap on the board:
//  - touching ground you already hold merges it into one bigger parcel
//    (see unionPolygons) instead of refusing the claim
//  - touching a rival's ground is only allowed when the loop fully
//    swallows it (every one of the rival's points falls inside the loop),
//    which counts as conquering it outright; a partial clip is refused
//  - anything not touching existing ground claims cleanly
export function evaluateClaim(loopPoints, territories) {
  const conquers = []
  const merges = []
  for (const t of territories) {
    if (!polygonsOverlap(loopPoints, t.points)) continue
    if (t.ownerId === 'player') {
      merges.push(t)
      continue
    }
    const fullyEnclosed = t.points.every((p) => pointInPolygon(p, loopPoints))
    if (!fullyEnclosed) {
      return { ok: false, reason: 'partial', blocker: t }
    }
    conquers.push(t)
  }
  return { ok: true, conquers, merges }
}

function pointKey(p) {
  return `${p.lat.toFixed(9)}:${p.lng.toFixed(9)}`
}

// Andrew's monotone chain — used only as a last-resort fallback if the
// boundary-stitching union below can't close a clean ring (degenerate
// touching cases). Overclaims a little (fills any concave notch between
// the two shapes) but is always a valid simple polygon, so the game never
// breaks on an edge case it hasn't been tested against.
function convexHull(points) {
  const pts = [...points].sort((a, b) => a.lng - b.lng || a.lat - b.lat)
  const cross = (o, a, b) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng)
  const lower = []
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

// Proper (bounded) segment intersection, returning the point plus how far
// along each segment it falls (0-1) so callers can order multiple
// intersections along the same edge.
function segmentIntersectionPoint(p1, p2, p3, p4) {
  const d1x = p2.lng - p1.lng
  const d1y = p2.lat - p1.lat
  const d2x = p4.lng - p3.lng
  const d2y = p4.lat - p3.lat
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-15) return null
  const t = ((p3.lng - p1.lng) * d2y - (p3.lat - p1.lat) * d2x) / denom
  const u = ((p3.lng - p1.lng) * d1y - (p3.lat - p1.lat) * d1x) / denom
  const eps = 1e-9
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null
  return { lat: p1.lat + t * d1y, lng: p1.lng + t * d1x, t }
}

// Splits `ring`'s edges wherever they cross `otherRing`, inserting the
// crossing points as extra vertices — the first step of boundary-stitching
// two polygons together (Weiler-Atherton style) so the merge follows only
// the outer edge of whichever shape is "outside" at each segment.
function augmentRingWithIntersections(ring, otherRing) {
  const augmented = []
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i]
    const p2 = ring[(i + 1) % ring.length]
    augmented.push(p1)
    const hits = []
    for (let j = 0; j < otherRing.length; j++) {
      const q1 = otherRing[j]
      const q2 = otherRing[(j + 1) % otherRing.length]
      const hit = segmentIntersectionPoint(p1, p2, q1, q2)
      if (hit) hits.push(hit)
    }
    hits.sort((a, b) => a.t - b.t)
    for (const hit of hits) {
      augmented.push({ lat: hit.lat, lng: hit.lng })
    }
  }
  return augmented
}

// Merges two overlapping simple polygons into one outer boundary. There's
// no backend geometry engine to defer to for this (the FahhKit API has no
// territory/polygon logic at all), so this keeps the ring segments of each
// polygon that fall outside the other and stitches them together at their
// crossing points — the standard approach for polygon union.
export function unionPolygons(a, b) {
  if (a.every((p) => pointInPolygon(p, b))) return b
  if (b.every((p) => pointInPolygon(p, a))) return a

  const augA = augmentRingWithIntersections(a, b)
  const augB = augmentRingWithIntersections(b, a)

  function keptSegments(ring, otherRing) {
    const kept = []
    for (let i = 0; i < ring.length; i++) {
      const start = ring[i]
      const end = ring[(i + 1) % ring.length]
      const mid = {
        lat: (start.lat + end.lat) / 2,
        lng: (start.lng + end.lng) / 2,
      }
      if (!pointInPolygon(mid, otherRing)) {
        kept.push([start, end])
      }
    }
    return kept
  }

  const segments = [...keptSegments(augA, b), ...keptSegments(augB, a)]
  if (segments.length === 0) return convexHull([...a, ...b])

  const byStart = new Map()
  for (const seg of segments) {
    const key = pointKey(seg[0])
    if (!byStart.has(key)) byStart.set(key, [])
    byStart.get(key).push(seg)
  }

  const used = new Set()
  const firstKey = pointKey(segments[0][0])
  let current = segments[0]
  const ring = [current[0]]
  used.add(current)

  while (true) {
    ring.push(current[1])
    if (pointKey(current[1]) === firstKey) break
    const candidates = (byStart.get(pointKey(current[1])) || []).filter(
      (s) => !used.has(s)
    )
    if (candidates.length === 0) break
    current = candidates[0]
    used.add(current)
    if (ring.length > a.length + b.length + 4) break // safety valve
  }

  if (
    ring.length >= 4 &&
    pointKey(ring[0]) === pointKey(ring[ring.length - 1])
  ) {
    return ring.slice(0, -1)
  }
  return convexHull([...a, ...b])
}

export function formatArea(sqMeters) {
  if (!sqMeters) return '0 m²'
  if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`
  return `${Math.round(sqMeters).toLocaleString()} m²`
}

// A run-length-independent flat rate per m² claimed, plus a flat bonus per
// rival parcel swallowed in the same loop — simulates the spec's "hold
// territory to earn Fahhcoin" idea as an immediate payout instead of a real
// day-long hold, since there's no backend to track holds.
const MAX_CLAIM_COINS = 300
const CONQUER_BONUS_COINS = 25

export function coinsForClaim(area, conqueredCount = 0) {
  const base = Math.min(MAX_CLAIM_COINS, Math.max(5, Math.round(area / 40)))
  return base + conqueredCount * CONQUER_BONUS_COINS
}
