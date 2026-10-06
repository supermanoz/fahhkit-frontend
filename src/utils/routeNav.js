import { haversineDistance } from './run'
import { bearingBetween } from './territoryGame'

// Turn-by-turn guidance for "run this route": where the runner is relative
// to a saved route's point list, and which way to go next - Google Maps nav
// style, but computed entirely client-side off the same GPS fixes used for
// the run itself (the route is already just a flat list of {lat,lng}).

// Past this far off the line, there's no useful "next point" to steer
// toward - the cartoon arrow would just be pointing at noise.
const OFF_ROUTE_METERS = 60
// How far ahead along the route to aim the arrow, so it reflects the
// upcoming bend rather than the exact (noisy) nearest point.
const LOOKAHEAD_METERS = 18
// Closer than this to the route's last point counts as having arrived.
const ARRIVAL_METERS = 15

function normalizeAngle(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

// Index of the route point closest to `from`.
function nearestIndex(points, from) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(from, points[i])
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return { index: best, distance: bestDist }
}

// Walks forward from `fromIndex` accumulating distance until it passes
// `lookaheadMeters`, returning that point (or the route's last point if it
// runs out first, flagged via `isEnd`).
function pointAhead(points, fromIndex, lookaheadMeters) {
  let covered = 0
  for (let i = fromIndex; i < points.length - 1; i++) {
    covered += haversineDistance(points[i], points[i + 1])
    if (covered >= lookaheadMeters) {
      return { point: points[i + 1], isEnd: false }
    }
  }
  return { point: points[points.length - 1], isEnd: true }
}

function remainingDistance(points, fromIndex) {
  let total = 0
  for (let i = fromIndex; i < points.length - 1; i++) {
    total += haversineDistance(points[i], points[i + 1])
  }
  return total
}

// Classifies a relative angle (-180..180, 0 = straight ahead) into a cue
// the UI can key its arrow rotation/label/icon off.
function classify(angle) {
  const abs = Math.abs(angle)
  if (abs < 18) return 'straight'
  if (abs < 55) return angle > 0 ? 'slight-right' : 'slight-left'
  if (abs < 130) return angle > 0 ? 'right' : 'left'
  return angle > 0 ? 'sharp-right' : 'sharp-left'
}

// Returns null when there isn't enough to work with yet (no fix, or a
// route too short to have a "next" point); otherwise:
// { angle, cue, offRoute, arrived, distanceToTarget, distanceRemaining }
export function getRouteGuidance(routePoints, playerLocation, playerHeading) {
  if (!routePoints || routePoints.length < 2 || !playerLocation) return null

  const { index, distance: offsetMeters } = nearestIndex(
    routePoints,
    playerLocation
  )
  const offRoute = offsetMeters > OFF_ROUTE_METERS

  const distanceRemaining = remainingDistance(routePoints, index)
  // The whole rest of the route, not just a short lookahead stretch - the
  // actual "line to destination" Google Maps draws while driving/walking,
  // starting from wherever the runner really is (not the nearest route
  // point, which can sit a few meters off to the side of them).
  const remainingPoints = [playerLocation, ...routePoints.slice(index)]

  if (distanceRemaining <= ARRIVAL_METERS) {
    return {
      angle: 0,
      cue: 'arrived',
      offRoute: false,
      arrived: true,
      distanceToTarget: 0,
      distanceRemaining,
      remainingPoints,
    }
  }

  const { point: target } = pointAhead(routePoints, index, LOOKAHEAD_METERS)
  const bearingToTarget = bearingBetween(playerLocation, target)
  const angle = normalizeAngle(bearingToTarget - (playerHeading || 0))

  return {
    angle,
    cue: offRoute ? 'off-route' : classify(angle),
    offRoute,
    arrived: false,
    // The near-term point being steered toward, for the turn arrow's angle.
    target,
    // The full remaining path to the route's end, for the map line - shrinks
    // as the runner progresses instead of staying a fixed short segment.
    remainingPoints,
    distanceToTarget: haversineDistance(playerLocation, target),
    distanceRemaining,
  }
}
