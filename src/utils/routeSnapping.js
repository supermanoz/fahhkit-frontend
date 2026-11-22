// Snaps one drawn segment to real roads through the configured routing
// provider (config/mapProvider.js: VITE_ROUTING_PROVIDER / VITE_ROUTING_URL /
// VITE_ROUTING_API_KEY - defaults to the free public OSRM demo, no key). The
// demo is a shared instance (no uptime guarantee) whose public profile
// support can be limited to driving-only, so this tries a pedestrian profile
// first and falls back to driving before giving up. Swapping providers never
// touches the drawing logic in GamePage.jsx.
//
// Routing is best-effort: if it is disabled, slow, down or rate-limited the
// caller still gets the raw segment (a straight line between the two taps) and
// `snapped: false`, so the player can always keep drawing.
import { mapConfig, withApiKey } from '../config/mapProvider'

const PROFILES = ['foot', 'driving']
// A dead provider must not freeze drawing: give up on one request after this.
const REQUEST_TIMEOUT_MS = 8000

async function requestRoute(profile, from, to, routing) {
  const url = withApiKey(
    `${routing.baseUrl}/${profile}/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`,
    routing.apiKey,
    routing.apiKeyParam
  )
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    throw new Error(`OSRM ${profile} HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data?.code !== 'Ok') {
    throw new Error(`OSRM ${profile} returned ${data?.code || 'no code'}`)
  }
  const coords = data?.routes?.[0]?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error(`OSRM ${profile} returned no usable geometry`)
  }
  return coords.map(([lng, lat]) => ({ lat, lng }))
}

// Returns { points, snapped, disabled? }. `points` always includes `from`/`to`
// and never drops a tap - `disabled: true` means snapping is switched off by
// config (VITE_ROUTING_PROVIDER=none), not that it failed; `snapped: false`
// means neither profile returned a
// route after retrying (off the mapped network, OSRM unreachable/rate-
// limited, etc.) and the caller got a straight line between the two taps
// instead. Logs every failure so a run of straight segments is
// diagnosable from the console rather than silently looking like a bug
// in the line-drawing itself.
export async function snapSegment(from, to, routing = mapConfig.routing) {
  if (!routing.enabled) {
    return { points: [from, to], snapped: false, disabled: true }
  }
  for (const profile of PROFILES) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const points = await requestRoute(profile, from, to, routing)
        return { points, snapped: true }
      } catch (err) {
        console.warn(
          `[routeSnapping] ${profile} attempt ${attempt} failed:`,
          err?.message || err
        )
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }
    }
  }
  console.warn(
    '[routeSnapping] falling back to a straight line - every profile/retry failed for',
    from,
    '->',
    to
  )
  return { points: [from, to], snapped: false }
}
