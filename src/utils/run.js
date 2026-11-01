// Points noisier than this (in meters) are dropped client-side, mirroring the
// backend's MAX_ACCEPTABLE_ACCURACY_METERS so the live distance shown during a
// run matches what actually gets stored.
export const MAX_ACCEPTABLE_ACCURACY_METERS = 20

// A sanity floor, not fraud-proofing - both minimums are enforced
// independently, so a run must clear each one on its own to save.
export const MIN_VALID_RUN_DISTANCE_METERS = 100
export const MIN_VALID_RUN_DURATION_SECONDS = 30

// Pace (time/distance) over a few GPS fixes is meaningless noise — hold off
// showing a live pace until the runner has actually covered some ground.
export const MIN_DISTANCE_FOR_PACE_METERS = 100

const EARTH_RADIUS_METERS = 6371000

export function haversineDistance(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return '--'
  return `${(meters / 1000).toFixed(2)} km`
}

// avgPace is minutes per km (matches RunSummaryResponse/RunDetailResponse.avgPace)
export function formatPace(minutesPerKm) {
  if (!minutesPerKm || !Number.isFinite(minutesPerKm)) return '--'
  const totalSeconds = Math.round(minutesPerKm * 60)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')} /km`
}

// Moving-time duration (what gets submitted with the run as `duration`) -
// wall clock between start/end minus every pause's own span (see
// useRunTracker.js's pause()/resume()) so pace stays honest. Identical to
// the plain "endedAt - startedAt" a run always used before pause existed,
// for any run that never paused (pausedMs stays 0) - Conquer/PvP/Club War
// never call pause(), so this is a safe drop-in, not Training-only math.
export function computeRunDurationSeconds(
  startedAtMs,
  endedAtMs,
  pausedMs = 0
) {
  return Math.max(0, Math.round((endedAtMs - startedAtMs - pausedMs) / 1000))
}

export function calculatePaceMinPerKm(distanceMeters, durationSeconds) {
  if (!distanceMeters || distanceMeters <= 0 || !durationSeconds) return null
  const distanceKm = distanceMeters / 1000
  return durationSeconds / 60 / distanceKm
}

export function formatRunDate(value) {
  if (!value) return '--'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const ACTIVE_RUN_STORAGE_KEY = 'fahhkit_active_run'

// Persists the in-progress run so a page refresh (or the tab being reopened)
// can resume tracking instead of losing everything collected so far.
export function saveActiveRun(record) {
  try {
    localStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Storage full/unavailable — tracking still works for this page load, it just won't survive a refresh.
  }
}

export function loadActiveRun() {
  try {
    const raw = localStorage.getItem(ACTIVE_RUN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.startedAt ? parsed : null
  } catch {
    return null
  }
}

export function clearActiveRun() {
  try {
    localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY)
  } catch {
    // no-op
  }
}

const TRACKED_EVENT_IDS_KEY_PREFIX = 'fahhkit_tracked_events_'

// Per-user record of event ids already tracked via the live-event prompt, so
// a refresh within the same 1-hour window doesn't re-show the full-screen
// tracker for an event the athlete already ran. This is a same-device
// stopgap, not a durable fact — the backend Run entity has no eventId link,
// so there's nothing server-side to check instead. No pruning needed: the
// 1-hour live window already makes stale ids irrelevant, and the list stays
// tiny (a handful of ids per athlete).
export function loadTrackedEventIds(userId) {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(`${TRACKED_EVENT_IDS_KEY_PREFIX}${userId}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTrackedEventIds(userId, ids) {
  if (!userId) return
  try {
    localStorage.setItem(
      `${TRACKED_EVENT_IDS_KEY_PREFIX}${userId}`,
      JSON.stringify(Array.from(ids))
    )
  } catch {
    // Storage full/unavailable — the prompt may reappear after a refresh, not fatal.
  }
}

// Serializes to the same offset-less "yyyy-MM-ddTHH:mm:ss" shape the backend's
// LocalDateTime fields expect (see the datetime-local inputs on CreateEventPage) —
// Date#toISOString() appends a "Z"/UTC offset that Jackson's default LocalDateTime
// deserializer rejects.
export function toLocalDateTimeString(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}
