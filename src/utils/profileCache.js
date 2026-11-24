// Stale-while-revalidate copy of the player's territory profile (level, XP,
// coins...) so the HUD and Me tab still show the last known numbers offline,
// labelled "last updated". Per account; never trusted for anything but display.
const KEY = (userId) => `fahhkit_profile_cache_${userId}`

export function saveCachedProfile(userId, profile, now = Date.now()) {
  if (!userId || !profile) return
  try {
    localStorage.setItem(KEY(userId), JSON.stringify({ at: now, profile }))
  } catch {
    // quota - the cache is a nicety
  }
}

export function loadCachedProfile(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(KEY(userId))
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.profile ? parsed : null
  } catch {
    return null
  }
}

export function formatLastUpdated(at, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - at) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
