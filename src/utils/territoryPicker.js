// Which territory did the player tap? Pure geometry (no Leaflet, no React) so it
// is unit-tested (territoryPicker.test.js) and shared by app and web.
//
// Rules:
//  - exact hit = the tap is inside the territory's outer ring and NOT inside
//    one of its holes (a hole is someone else's ground, not this territory's);
//  - the innermost territory wins = the smallest area among the hits;
//  - phone-friendly: a SMALL territory (a few tens of px on screen) also counts
//    when the tap lands within PAD_PX of its edge - a fingertip is not a pixel;
//  - tapping the same spot again cycles outward through everything stacked there.
import { polygonAreaSqMeters } from './territoryGame'

export const TAP_PAD_PX = 12 // forgiving radius around a small territory
export const SMALL_TERRITORY_PX = 44 // smaller than this on screen = padded
export const SAME_SPOT_PX = 12 // "same spot" for cycling
export const CYCLE_WINDOW_MS = 6000 // ...within this long

const M_PER_DEG_LAT = 111_320
const EDGE_EPS_M = 0.05 // boundary counts as inside

// Ground metres per screen pixel at a zoom/latitude (Web Mercator, 256px tiles).
export function metersPerPixel(lat, zoom) {
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom)
}

function project(p, refLat) {
  return {
    x: p.lng * M_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180),
    y: p.lat * M_PER_DEG_LAT,
  }
}

function distToSegmentM(p, a, b) {
  const refLat = p.lat
  const P = project(p, refLat)
  const A = project(a, refLat)
  const B = project(b, refLat)
  const dx = B.x - A.x
  const dy = B.y - A.y
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy))
}

// Even-odd ray cast on one ring of {lat, lng} (no boundary handling).
function inRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng
    const yi = ring[i].lat
    const xj = ring[j].lng
    const yj = ring[j].lat
    if (
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

export function distanceToRingM(p, ring) {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(best, distToSegmentM(p, ring[j], ring[i]))
  }
  return best
}

// Inside the outer ring (edge counts) and not inside a hole (a hole's own edge
// still belongs to the territory).
export function containsPoint(p, outer, holes = []) {
  if (!outer || outer.length < 3) return false
  const onOuter = distanceToRingM(p, outer) <= EDGE_EPS_M
  if (!onOuter && !inRing(p, outer)) return false
  for (const h of holes) {
    if (h.length < 3) continue
    if (inRing(p, h) && distanceToRingM(p, h) > EDGE_EPS_M) return false
  }
  return true
}

// Precompute once per territory list (bbox + area) - the click handler then only
// does cheap bbox rejects before any ring maths.
export function buildPickIndex(territories) {
  const out = []
  for (const t of territories || []) {
    const outer = t.points
    if (!outer || outer.length < 3) continue
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity
    for (const p of outer) {
      minLat = Math.min(minLat, p.lat)
      maxLat = Math.max(maxLat, p.lat)
      minLng = Math.min(minLng, p.lng)
      maxLng = Math.max(maxLng, p.lng)
    }
    const area = t.area > 0 ? t.area : polygonAreaSqMeters(outer)
    out.push({
      t,
      outer,
      holes: t.holes || [],
      area,
      bbox: { minLat, maxLat, minLng, maxLng },
    })
  }
  return out
}

function bboxInside(a, b) {
  return (
    a.minLat >= b.minLat &&
    a.maxLat <= b.maxLat &&
    a.minLng >= b.minLng &&
    a.maxLng <= b.maxLng
  )
}

// All territories the tap picks, innermost (smallest) first. `mpp` = ground
// metres per screen pixel (metersPerPixel) so padding/"small" scale with zoom.
export function pickTerritories(point, index, { mpp = 0 } = {}) {
  const padM = mpp * TAP_PAD_PX
  const smallM = mpp * SMALL_TERRITORY_PX
  const padLat = padM / M_PER_DEG_LAT
  const padLng = padM / (M_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180))
  const exact = []
  const near = []
  for (const e of index) {
    const b = e.bbox
    const small =
      mpp > 0 &&
      Math.max(
        (b.maxLat - b.minLat) * M_PER_DEG_LAT,
        (b.maxLng - b.minLng) *
          M_PER_DEG_LAT *
          Math.cos((point.lat * Math.PI) / 180)
      ) < smallM
    const pad = small ? padM : 0
    const pLat = small ? padLat : 0
    const pLng = small ? padLng : 0
    if (
      point.lat < b.minLat - pLat ||
      point.lat > b.maxLat + pLat ||
      point.lng < b.minLng - pLng ||
      point.lng > b.maxLng + pLng
    ) {
      continue
    }
    if (containsPoint(point, e.outer, e.holes)) {
      exact.push({
        territory: e.t,
        area: e.area,
        exact: true,
        small,
        bbox: b,
      })
      continue
    }
    if (pad > 0) {
      let d = distanceToRingM(point, e.outer)
      for (const h of e.holes) d = Math.min(d, distanceToRingM(point, h))
      if (d <= pad) {
        near.push({
          territory: e.t,
          area: e.area,
          exact: false,
          small,
          d,
          bbox: b,
        })
      }
    }
  }
  const byArea = (a, b) =>
    a.area - b.area ||
    String(a.territory.id).localeCompare(String(b.territory.id))
  exact.sort(byArea)
  near.sort((a, b) => a.d - b.d || byArea(a, b))
  // A near miss only outranks the smallest exact hit when it is smaller than it
  // AND either that exact hit is a big territory, or the near miss sits INSIDE
  // it (a nested territory). A tap inside a small, finger-sized territory is
  // otherwise trusted over an unrelated neighbour.
  const best = exact[0]
  const first = near.filter(
    (n) =>
      !best ||
      (n.area < best.area && (!best.small || bboxInside(n.bbox, best.bbox)))
  )
  const rest = near.filter((n) => !first.includes(n))
  return [...first, ...exact, ...rest].map((h) => ({
    territory: h.territory,
    exact: h.exact,
  }))
}

// Which of the stacked hits to open. First tap = innermost; tapping the SAME
// spot again (same stack, within SAME_SPOT_PX, within CYCLE_WINDOW_MS) walks
// outward, wrapping back to the innermost. `prev` is what this returned last.
export function choosePick(hits, prev, { x, y, now }) {
  if (hits.length === 0) return { hit: null, state: null }
  const ids = hits.map((h) => h.territory.id).join('|')
  let index = 0
  if (
    prev &&
    prev.ids === ids &&
    now - prev.time <= CYCLE_WINDOW_MS &&
    Math.hypot(x - prev.x, y - prev.y) <= SAME_SPOT_PX
  ) {
    index = (prev.index + 1) % hits.length
  }
  return { hit: hits[index], state: { ids, index, x, y, time: now } }
}
