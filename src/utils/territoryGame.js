// Client-only "Territory Run" game state. There's no backend support for
// this yet (no territory/club/coin endpoints exist), so everything here
// lives in localStorage on this device — it's a real, playable loop, just
// not synced anywhere.
import polygonClipping from 'polygon-clipping'
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

// Gold ties the player's ground to the same "gold = you" language as the
// HUD coin/avatar/menu button (see style.md); rivals get an earthy,
// Clash-of-Clans-style variety instead so parcels stay easy to tell apart
// at a glance. Keep in sync with the pulse/glow colors in TerritoryMap.css.
export const PLAYER_COLOR = '#E0A537'
const RIVAL_COLORS = ['#4E7A3A', '#B5651D', '#5C7A8A']
const RIVAL_NAMES = ['Aashish', 'Prakriti', 'Sudip']

// Small fixed offsets (in degrees, roughly tens of meters at this latitude)
// around a center point, turned into a lopsided loop rather than a perfect
// circle so it reads as a hand-run route, not a drawn shape. Territories
// never overlap on the board (see evaluateClaim), so these three are laid
// out in their own clear patch of ground - the middle one used to dip into
// both neighbors' loops (a leftover from when these were eyeballed without
// checking each other), shifted south here to clear both while keeping its
// exact shape and area.
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
    [-0.0029, 0.0011],
    [-0.0021, 0.0018],
    [-0.0011, 0.0014],
    [-0.0009, 0.0004],
    [-0.0019, -0.0002],
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
  const territories = RIVAL_SHAPES.map((shape, i) => {
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
  // Belt-and-suspenders: these hand-picked offsets are laid out to already
  // clear each other, but resolving overlaps here too means a future edit
  // to RIVAL_SHAPES can't accidentally reintroduce one.
  return resolveOverlaps(territories)
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
    // Re-resolve on every load, not just at seed time — heals a device
    // whose localStorage already has overlapping parcels saved from before
    // this existed. A no-op once the state is already clean.
    return { ...parsed, territories: resolveOverlaps(parsed.territories) }
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

// Converts our {lat,lng} loop into the [x,y] ring shape polygon-clipping
// expects (a GeoJSON-style Polygon is Ring[], and a Ring is Position[]) —
// using [lng, lat] order doesn't matter here since the library treats them
// as opaque x/y, but it's the GeoJSON convention.
function toGeom(points) {
  return [points.map((p) => [p.lng, p.lat])]
}

function ringToPoints(ring) {
  // polygon-clipping always returns closed rings (first === last point);
  // drop the repeated closing vertex to match this game's point-array shape.
  return ring.slice(0, -1).map(([lng, lat]) => ({ lat, lng }))
}

// polygon-clipping's boolean ops return a MultiPolygon (Polygon[], each
// itself Ring[] with the outer boundary first and any holes after). This
// game's data model only ever holds one simple ring per territory, so on
// the rare shape that splits or gets a hole, keep just the biggest outer
// ring and drop the rest — an acceptable simplification for a run/loop
// game where that split is a genuine edge case, not the common path.
function largestRing(multiPolygon) {
  let best = null
  let bestArea = -1
  for (const polygon of multiPolygon) {
    const points = ringToPoints(polygon[0])
    const area = polygonAreaSqMeters(points)
    if (area > bestArea) {
      bestArea = area
      best = points
    }
  }
  return best
}

// True if the two loops share any ground at all — full containment,
// partial clipping, and edge-touching all count. Backed by polygon-clipping
// (a well-tested implementation of the Martinez-Rueda-Feito algorithm)
// rather than a hand-rolled segment-intersection check, since getting this
// wrong on a concave, hand-drawn loop is exactly the kind of edge case a
// from-scratch implementation tends to miss.
export function polygonsOverlap(a, b) {
  const hit = polygonClipping.intersection(toGeom(a), toGeom(b))
  // A shared edge/vertex with no real interior overlap can come back as a
  // sliver of near-zero area — 1 sq cm is well below anything meaningful
  // at this game's scale, so it doesn't count as "sharing ground".
  return hit.some(
    (polygon) => polygonAreaSqMeters(ringToPoints(polygon[0])) > 0.0001
  )
}

// Merges two overlapping (or touching) simple polygons into one outer
// boundary — used when a new run touches ground the player already owns.
export function unionPolygons(a, b) {
  const result = polygonClipping.union(toGeom(a), toGeom(b))
  return largestRing(result) || a
}

// Removes whatever ground `cutter` covers from `subject`, so the two never
// visually overlap — used both to keep the hand-placed rival seed shapes
// from overlapping each other (see resolveOverlaps) and, live, to crop
// whichever side of a claim loses a disputed patch of ground to the other
// (see evaluateClaim). Returns null if `cutter` swallows `subject` whole.
export function subtractPolygon(subject, cutter) {
  const result = polygonClipping.difference(toGeom(subject), toGeom(cutter))
  return largestRing(result)
}

// Enforces "territories never overlap on the board" for a whole parcel
// list: sorts by area so the bigger parcel always keeps the disputed
// ground, and clips (or, if fully swallowed, drops) every smaller one that
// overlaps it. Only needed to self-heal the hand-placed rival seed shapes
// (and any older saved game state) — live claims already resolve their own
// overlaps through evaluateClaim below.
export function resolveOverlaps(territories) {
  const ordered = [...territories].sort((a, b) => b.area - a.area)
  const kept = []
  for (const territory of ordered) {
    let points = territory.points
    for (const bigger of kept) {
      if (!points || !polygonsOverlap(points, bigger.points)) continue
      points = subtractPolygon(points, bigger.points)
    }
    if (!points || points.length < 3) continue
    kept.push({ ...territory, points, area: polygonAreaSqMeters(points) })
  }
  return kept
}

// The single source of truth for whether a drawn loop can be claimed, and
// what it actually ends up claiming:
//  - touching ground you already hold merges it into one bigger parcel
//    (see unionPolygons)
//  - fully swallowing a rival's parcel (every one of its points falls
//    inside the loop) conquers it outright — the rival parcel is removed
//  - clipping only *part* of a rival's parcel is allowed (you can run
//    around a rival's territory), and whoever has more ground keeps the
//    disputed patch: if the loop is bigger, the rival's parcel is cropped
//    down to exclude it; if the rival is bigger, the loop itself is cropped
//    down to exclude the rival's ground before it's ever claimed
//  - anything not touching existing ground claims cleanly
// Returns `{ ok: false, reason: 'engulfed' }` only in the edge case where
// the loop ends up with nothing left to claim (it sat entirely inside one
// bigger rival parcel).
export function evaluateClaim(loopPoints, territories) {
  const merges = []
  const conquers = []
  const shrinkTargets = []
  const loopArea = polygonAreaSqMeters(loopPoints)
  let claimShape = loopPoints

  // Pass 1: resolve merges and full conquers, and crop the loop itself
  // down against every rival parcel bigger than it — bigger ground always
  // wins the disputed patch, decided once against the run's own total area
  // rather than the shrinking claim shape, so processing order can't change
  // the outcome.
  for (const t of territories) {
    if (!polygonsOverlap(loopPoints, t.points)) continue
    if (t.ownerId === 'player') {
      merges.push(t)
      continue
    }
    const rivalFullyInsideLoop = t.points.every((p) =>
      pointInPolygon(p, loopPoints)
    )
    if (rivalFullyInsideLoop) {
      conquers.push(t)
      continue
    }
    if (loopArea <= t.area) {
      claimShape = claimShape && subtractPolygon(claimShape, t.points)
    } else {
      shrinkTargets.push(t)
    }
  }

  if (!claimShape) {
    return { ok: false, reason: 'engulfed' }
  }

  // Pass 2: every smaller rival parcel this loop touched loses whatever
  // sliver the FINAL claim shape (after pass 1's crops) actually covers —
  // using the shape the player ends up with, not the raw drawn loop, so a
  // patch already ceded to a bigger rival in pass 1 can't also be carved
  // out of a smaller one here.
  const shrinks = []
  for (const t of shrinkTargets) {
    if (!polygonsOverlap(claimShape, t.points)) continue
    const shrunkPoints = subtractPolygon(t.points, claimShape)
    if (shrunkPoints) {
      shrinks.push({
        territory: t,
        points: shrunkPoints,
        area: polygonAreaSqMeters(shrunkPoints),
      })
    } else {
      conquers.push(t)
    }
  }

  return { ok: true, claimShape, conquers, merges, shrinks }
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
