// Is location usable for PvP? 'granted' | 'denied' | 'unknown'.
// 'unknown' (a browser or WebView that can't say, or the player hasn't been
// asked yet) is treated as allowed by the PvP entry: the game asks for
// location on its own, and blocking on a guess would lock people out.
//
// `knownDenied` / `hasFix` come from GamePage's own GPS watch (a watchPosition
// error with code 1 = permission denied; a real fix = granted).
export async function getLocationState({
  knownDenied = false,
  hasFix = false,
} = {}) {
  if (knownDenied) return 'denied'
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' })
    if (perm?.state === 'denied') return 'denied'
    if (perm?.state === 'granted') return 'granted'
  } catch {
    // Permissions API missing or unsupported - fall through.
  }
  return hasFix ? 'granted' : 'unknown'
}
