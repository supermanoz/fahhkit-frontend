// Is a GPS fix good enough to decide "which city is the player in?" - used by
// the rollout check (hooks/useRolloutStatus.js) so it never runs on a bogus
// or stale position. The backend decides by the distance to a rolled-out
// city's centre (a 15 km radius today), so a fix only has to be roughly right,
// but it must be real:
//   - finite, in-range lat/lng
//   - not 0,0 ("null island": what some devices/emulators report with no fix)
//   - accuracy not worse than MAX_FIX_ACCURACY_M (an IP/cell-tower guess tens
//     of km off could put the player in the wrong city)
//   - not stale: a cached fix older than MAX_FIX_AGE_MS is ignored

export const MAX_FIX_ACCURACY_M = 5000
export const MAX_FIX_AGE_MS = 2 * 60 * 1000

export function isUsableFix(fix, now = Date.now()) {
  if (!fix) return false
  const { lat, lng, accuracy, timestamp } = fix
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false
  if (accuracy != null) {
    if (!Number.isFinite(accuracy) || accuracy > MAX_FIX_ACCURACY_M)
      return false
  }
  if (timestamp != null && now - timestamp > MAX_FIX_AGE_MS) return false
  return true
}
