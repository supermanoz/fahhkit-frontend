// Map/geometry helpers for the Territory Run game. Territory data itself
// comes from the backend now (see api/territory.js) — this file only holds
// display math (area/perimeter formatting, GeoJSON-to-Leaflet conversion,
// owner colors) and the live in-progress-loop preview math shown while a
// GPS run is still being tracked, before it's ever submitted.
import polygonClipping from 'polygon-clipping'
import { haversineDistance } from './run'

// Naxal, Kathmandu — matches the address already shown on the Contact page,
// so the default map view lines up with where the club actually runs.
export const DEFAULT_CENTER = { lat: 27.7166, lng: 85.3247 }

// Mirrors TerritoryLoopProperties' defaults on the backend (closureThresholdMeters,
// minEnclosedAreaSqMeters, minPoints) — these are client-side hints only, shown
// while a run is in progress so a loop that's obviously too small doesn't
// surprise the runner later. The server's own values are the ones that actually
// decide whether a run turns into territory.
export const LOOP_MIN_POINTS = 10
export const LOOP_MIN_AREA_SQ_METERS = 2000
export const LOOP_CLOSURE_THRESHOLD_METERS = 25

// Radius around the player that findParcelsNear queries for territory to
// show on the map. The view itself isn't fenced to this (see
// ZoomRangeLimiter in TerritoryMap.jsx) — panning further out just shows an
// empty map past this radius until the player moves and it re-queries.
export const VIEW_RADIUS_METERS = 15000

export function boundsForRadius(center, radiusMeters) {
  const dLat = radiusMeters / 111320
  const dLng = radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180))
  return [
    [center.lat - dLat, center.lng - dLng],
    [center.lat + dLat, center.lng + dLng],
  ]
}

// Gold ties the player's ground to the same "gold = you" language as the
// HUD coin/avatar/menu button (see style.md). Keep in sync with the
// pulse/glow colors in TerritoryMap.css.
export const PLAYER_COLOR = '#E0A537'

// Other players get a deterministic color from this earthy, Clash-of-Clans
// style palette (hashed from their userId) so the same person reads as the
// same color across the map/leaderboard without the server needing to
// assign or store one.
const OTHER_OWNER_COLORS = [
  '#4E7A3A',
  '#B5651D',
  '#5C7A8A',
  '#8B5A9E',
  '#C4553D',
  '#3D7A6E',
]

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function colorForOwner(ownerId) {
  if (!ownerId) return OTHER_OWNER_COLORS[0]
  return OTHER_OWNER_COLORS[hashString(ownerId) % OTHER_OWNER_COLORS.length]
}

function findEquippedAsset(equippedItems, category, field) {
  return (equippedItems || []).find(
    (i) => i.equipped && i.storeItem?.category === category
  )?.storeItem?.[field]
}

// Converts a backend TerritoryParcelResponse (GeoJSON-style rings of
// [lng, lat] pairs — see TerritoryServiceImpl#toRingCoordinates) into the
// {lat, lng} point-array shape TerritoryMap already renders. Interior rings
// (holes) are dropped — this game's map view doesn't render donut parcels,
// same simplification the old client-only model made.
//
// ownerEquippedItems carries the parcel owner's equipped cosmetics
// (TERRITORY_SHADE/TERRITORY_EMOJI) straight from the API - using those
// instead of always falling back to the generic per-owner hash color/badge
// is what lets someone else's bought customization actually show up on the
// map. Falls back to the existing hashed color/default badge emoji when the
// owner has nothing equipped in that category.
export function toDisplayParcel(parcel, currentUserId) {
  const exteriorRing = parcel.geometry?.[0] || []
  const isMine = Boolean(currentUserId) && parcel.ownerId === currentUserId
  const equippedShade = findEquippedAsset(
    parcel.ownerEquippedItems,
    'TERRITORY_SHADE',
    'colorValue'
  )
  const equippedEmojiUrl = findEquippedAsset(
    parcel.ownerEquippedItems,
    'TERRITORY_EMOJI',
    'assetUrl'
  )
  return {
    id: parcel.id,
    ownerId: parcel.ownerId,
    ownerName: parcel.ownerName,
    color: isMine
      ? PLAYER_COLOR
      : equippedShade || colorForOwner(parcel.ownerId),
    emojiUrl: equippedEmojiUrl || null,
    points: exteriorRing.map(([lng, lat]) => ({ lat, lng })),
    area: parcel.areaSqMeters || 0,
  }
}

// Initial compass bearing (0-360, 0 = north, clockwise) from a to b - used
// to point the player marker's heading cone in the direction of travel
// (course over ground from consecutive GPS fixes), Google Maps
// navigation-view style, rather than needing a device compass sensor.
export function bearingBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// Eases a heading toward a new reading by `factor` instead of snapping
// straight to it, so one still-slightly-noisy GPS fix doesn't jerk the
// player marker/map rotation - shortest-path across the 0/360 wraparound
// (e.g. 350 -> 10 eases through 0, a 20deg turn, not the long way through
// 180).
export function smoothAngle(current, target, factor = 0.35) {
  const diff = ((target - current + 540) % 360) - 180
  return (current + diff * factor + 360) % 360
}

// Standard ray-casting point-in-polygon test on {lat,lng} points - used to
// detect the player physically stepping into a claimed parcel while moving
// around the map, not just tapping one.
export function pointInPolygon(point, polygonPoints) {
  let inside = false
  for (
    let i = 0, j = polygonPoints.length - 1;
    i < polygonPoints.length;
    j = i++
  ) {
    const xi = polygonPoints[i].lng
    const yi = polygonPoints[i].lat
    const xj = polygonPoints[j].lng
    const yj = polygonPoints[j].lat
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

// Shoelace formula on a local equirectangular projection (meters, scaled by
// cos(latitude)) — accurate enough for loops a few hundred meters across,
// which is the entire range this game deals in. Used only for the live
// in-progress loop preview; the backend recomputes this properly (with
// simplification/reprojection) once a run is submitted.
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

function centroidOf(points) {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length
  return { lat, lng }
}

// The backend stores one TerritoryParcel row per claimed loop, so a player
// who's run two adjacent loops holds two separate parcels that happen to
// share an edge. Presented as-is (map polygons, the Me tab's "My
// Territories" list) that seam/split reads as two territories where it's
// really one connected patch of ground. This merges a same-owner parcel
// list into its geometric union: parcels that actually touch/overlap fuse
// into a single shape, while separate (non-touching) clusters the owner
// holds elsewhere stay distinct - polygon-clipping's union does that
// automatically, no adjacency check needed up front. Used by both
// TerritoryMap.jsx's per-owner rendering and GamePage.jsx's "My
// Territories" list so the two always agree on what counts as one
// territory. sourceIds tracks which original parcel ids fed into each
// merged shape, so a highlight/focus targeting one specific original
// parcel still resolves to whichever merged shape now contains it.
export function mergeTouchingParcels(parcels) {
  if (parcels.length <= 1) {
    return parcels.map((p) => ({ ...p, sourceIds: [p.id] }))
  }
  let unioned
  try {
    unioned = polygonClipping.union(
      ...parcels.map((p) => [p.points.map((pt) => [pt.lat, pt.lng])])
    )
  } catch {
    // Malformed/self-intersecting loop (bad GPS data) - fall back to
    // treating these parcels as unmerged rather than losing them entirely.
    unioned = parcels.map((p) => [p.points.map((pt) => [pt.lat, pt.lng])])
  }
  return unioned.map((polygon, i) => {
    const points = polygon[0].map(([lat, lng]) => ({ lat, lng }))
    // A parcel's own centroid always lands inside whichever output cluster
    // it fed into, disjoint clusters for the same owner included.
    const sourceIds = parcels
      .filter((p) => pointInPolygon(centroidOf(p.points), points))
      .map((p) => p.id)
    return {
      id: `merged-${i}`,
      points,
      area: polygonAreaSqMeters(points),
      sourceIds,
    }
  })
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

// Always km² (never raw m²) so area reads consistently everywhere it's shown. Precision scales
// with magnitude so a just-claimed small parcel (LOOP_MIN_AREA_SQ_METERS = 2000 m² = 0.002 km²)
// still shows a nonzero number instead of rounding away to "0.00 km²".
export function formatArea(sqMeters) {
  if (!sqMeters) return '0 km²'
  const km = sqMeters / 1_000_000
  const decimals = km < 0.01 ? 4 : km < 1 ? 3 : 2
  return `${km.toFixed(decimals)} km²`
}

// Mirrors the backend's level curve (TerritoryXpServiceImpl.levelForXp /
// territory.xp.level-curve-base, defaulting to 100): level(xp) = 1 +
// floor(sqrt(xp / LEVEL_CURVE_BASE)), so cumulative XP to reach level L is
// LEVEL_CURVE_BASE * (L - 1)^2. There's no API field for "XP to next level",
// so this inverts that same formula client-side to drive the XP progress
// bar. Keep in sync if the server-side base ever changes.
const LEVEL_CURVE_BASE = 100

export function xpFloorForLevel(level) {
  return LEVEL_CURVE_BASE * (level - 1) ** 2
}

// How far into the current level a player's XP sits, as both raw numbers
// (for a "1,234 / 2,000 XP" style label) and a 0-1 fill fraction for a bar.
export function levelProgress(level, xp) {
  const floor = xpFloorForLevel(level)
  const ceiling = xpFloorForLevel(level + 1)
  const span = Math.max(1, ceiling - floor)
  const into = Math.max(0, (xp || 0) - floor)
  return { into, span, pct: Math.min(1, into / span) }
}
