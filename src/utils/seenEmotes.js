// Tracks which EMOTE StoreItem ids this browser has already seen, purely to
// drive the "NEW" badge on EmoteSelectScreen's grid - StoreItemResponse
// carries no createdAt (see ~/Documents/FahhKit's StoreItemResponse.java),
// so there's no server signal for "new" to key off. A per-browser
// localStorage set is a reasonable stand-in: the first visit after an emote
// is added marks it new, the next visit it doesn't.
const STORAGE_KEY = 'fahhkit_seen_emote_ids'

// Pure read - safe to call from a render/useMemo (including React
// StrictMode's dev-only double-render, which runs a render function's body
// twice) since it never mutates anything.
export function loadSeenEmoteIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

// The actual persistence - deliberately kept out of the "which ids are
// new" read above and left for a caller to run as a useEffect, not inside
// a useMemo. A useMemo factory can run more than once for the same inputs
// (StrictMode's double-render is exactly that), and since marking an id
// seen changes what the VERY NEXT call to loadSeenEmoteIds returns, doing
// both in one memoized step risked the second of two same-render calls
// seeing its own first call's writes and computing an empty "new" set -
// in effect, no "NEW" badge ever showing, but only in dev under
// StrictMode. A useEffect's own double-fire there is harmless by
// comparison: marking the same ids seen twice is a no-op, and it runs
// after the render (and the "new" set) it's not supposed to affect.
export function markEmotesSeen(itemIds) {
  const seen = loadSeenEmoteIds()
  itemIds.forEach((id) => seen.add(id))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // localStorage unavailable (private mode, quota) - "new" badges just
    // won't persist across visits; nothing else depends on this.
  }
}
