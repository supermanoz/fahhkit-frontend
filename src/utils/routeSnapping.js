// Snaps one drawn segment to real roads via the free public OSRM demo
// server - no API key, but it's a shared demo instance (no uptime
// guarantee) whose public profile support can be limited to driving-only,
// so this tries a pedestrian profile first and falls back to driving
// before giving up. Isolated here so swapping providers later (Mapbox
// Directions, a self-hosted OSRM, etc.) never touches the drawing logic
// in GamePage.jsx - only this one function would change.
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1'
const PROFILES = ['foot', 'driving']

async function requestRoute(profile, from, to) {
  const url =
    `${OSRM_BASE_URL}/${profile}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson`
  const res = await fetch(url)
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

// Returns { points, snapped }. `points` always includes `from`/`to` and
// never drops a tap - `snapped: false` means neither profile returned a
// route after retrying (off the mapped network, OSRM unreachable/rate-
// limited, etc.) and the caller got a straight line between the two taps
// instead. Logs every failure so a run of straight segments is
// diagnosable from the console rather than silently looking like a bug
// in the line-drawing itself.
export async function snapSegment(from, to) {
  for (const profile of PROFILES) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const points = await requestRoute(profile, from, to)
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
