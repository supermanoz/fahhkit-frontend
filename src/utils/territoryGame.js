// Map/geometry helpers for the Territory Run game. Territory data itself
// comes from the backend now (see api/territory.js) — this file only holds
// display math (area/perimeter formatting, GeoJSON-to-Leaflet conversion,
// owner colors) and the live in-progress-loop preview math shown while a
// GPS run is still being tracked, before it's ever submitted.
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
export const LOOP_MIN_AREA_SQ_METERS = 100
export const LOOP_CLOSURE_THRESHOLD_METERS = 25

// Radius around the player that findParcelsNear queries for territory to
// show on the map. The view itself isn't fenced to this (see
// ZoomRangeLimiter in TerritoryMap.jsx) — panning further out just shows an
// empty map past this radius until the player moves and it re-queries.
export const VIEW_RADIUS_METERS = 2000

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

// Converts a backend TerritoryParcelResponse (GeoJSON-style rings of
// [lng, lat] pairs — see TerritoryServiceImpl#toRingCoordinates) into the
// {lat, lng} point-array shape TerritoryMap already renders. Interior rings
// (holes) are dropped — this game's map view doesn't render donut parcels,
// same simplification the old client-only model made.
export function toDisplayParcel(parcel, currentUserId) {
  const exteriorRing = parcel.geometry?.[0] || []
  const isMine = Boolean(currentUserId) && parcel.ownerId === currentUserId
  return {
    id: parcel.id,
    ownerId: parcel.ownerId,
    ownerName: parcel.ownerName,
    color: isMine ? PLAYER_COLOR : colorForOwner(parcel.ownerId),
    points: exteriorRing.map(([lng, lat]) => ({ lat, lng })),
    area: parcel.areaSqMeters || 0,
  }
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

export function loopPerimeterMeters(points) {
  if (!points || points.length < 2) return 0
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(points[i], points[i + 1])
  }
  total += haversineDistance(points[points.length - 1], points[0])
  return total
}

export function formatArea(sqMeters) {
  if (!sqMeters) return '0 m²'
  if (sqMeters >= 10000) {
    const km = sqMeters / 1_000_000
    return `${km.toFixed(km < 1 ? 3 : 2)} km`
  }
  return `${Math.round(sqMeters).toLocaleString()} m²`
}
