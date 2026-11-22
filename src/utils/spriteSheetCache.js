// Shared, refcounted ImageBitmap cache for AnimatedSprite.jsx's grid-sheet
// player - every emote/idle sheet is decoded at most once no matter how
// many on-screen instances play it at once (e.g. a leaderboard row and a
// profile popup showing the same hero's idle), and is released (closed,
// freeing its GPU/CPU-side decoded memory) once the last instance using it
// has stopped - "load only when shown, cache and release when it's not
// visible" from the rebuild brief.
//
// Decoding happens only when a sheet is actually acquired (an emote
// becomes `active`) - acquiring a sheet never decoded before fetches +
// decodes it on demand, nothing is pre-warmed just because a manifest
// exists.
//
// Two rules keep a bitmap that is still on screen from being closed (a
// closed bitmap makes drawImage throw "The image source is detached", which
// used to kill the sprite's draw loop and leave a blank canvas):
// - every acquireSheet() must be matched by exactly ONE release, and the
//   handle returned by acquireSheet() makes that structural: calling its
//   release() twice is a no-op, so an unmount racing an in-flight decode can
//   never drop somebody else's reference.
// - the bitmap is only closed after a short grace period with no holders
//   (RELEASE_GRACE_MS). A quick unmount -> remount of the same sprite (the
//   HUD hero's idle<->run icon swap re-creates its emote layer) re-uses the
//   decoded sheet instead of re-fetching and re-decoding a multi-megapixel
//   image, and a never-visible-twice sheet is still freed a few seconds later.
//
// Memory is bounded, because one ~4000x4000 sheet is ~60 MB decoded and an
// emote is 2-3 of them (an idle pair ~100 MB, the biggest emote ~216 MB):
// - decoded bytes are tracked per sheet, and before a new sheet is decoded
//   any sheet nobody holds is closed at once (oldest first) if keeping it
//   would push the total over SPRITE_MEMORY_BUDGET - so swiping through a
//   hero's emotes never stacks the previous ones up waiting for the grace
//   timer. Sheets that ARE in use are never touched.
// - at most MAX_CONCURRENT_DECODES run at a time (fetch + decode of several
//   60 MB images at once is the peak that gets a WebView killed), and a
//   sheet whose sprite was unmounted before its turn is never decoded at
//   all (fast swiping skips straight to the emote that stays).
const RELEASE_GRACE_MS = 3000
// Decoded memory the cache may keep once nothing holds it (~3 sheets).
export const SPRITE_MEMORY_BUDGET = 192 * 1024 * 1024
// Size assumed for a sheet that has not finished decoding yet (a full
// 4000x4000 RGBA sheet).
const ASSUMED_SHEET_BYTES = 64 * 1024 * 1024
export const MAX_CONCURRENT_DECODES = 2

const cache = new Map() // url -> { promise, refCount, closeTimer, bytes, releasedAt }

// --- decode queue ---------------------------------------------------------
let activeDecodes = 0
const waiting = []

function pumpQueue() {
  while (activeDecodes < MAX_CONCURRENT_DECODES && waiting.length) {
    const job = waiting.shift()
    activeDecodes += 1
    job()
  }
}

function runLimited(task) {
  return new Promise((resolve, reject) => {
    waiting.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeDecodes -= 1
          pumpQueue()
        })
    })
    pumpQueue()
  })
}

function decodeNow(url) {
  if (typeof createImageBitmap === 'function') {
    return fetch(url)
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob))
  }
  // Fallback for engines without createImageBitmap (rare on this app's
  // target browsers, but cheap to cover) - img.decode() gives the same
  // "fully decoded, safe to draw without a flash" guarantee, and
  // CanvasRenderingContext2D.drawImage accepts an HTMLImageElement exactly
  // like it accepts an ImageBitmap.
  const img = new Image()
  img.src = url
  return img.decode().then(() => img)
}

function bytesOf(img) {
  const w = img.width || img.naturalWidth || 0
  const h = img.height || img.naturalHeight || 0
  return w * h * 4
}

// Queued decode that is skipped when every holder let go before it started.
function decode(url, entry) {
  return runLimited(() => {
    if (entry.refCount === 0 || cache.get(url) !== entry) {
      return Promise.reject(new Error('sprite sheet released before decode'))
    }
    return decodeNow(url).then((img) => {
      entry.bytes = bytesOf(img)
      return img
    })
  })
}

// --- memory ---------------------------------------------------------------
export function residentBytes() {
  let total = 0
  for (const entry of cache.values()) {
    total += entry.bytes || ASSUMED_SHEET_BYTES
  }
  return total
}

function closeEntry(url, entry) {
  // Only if nobody re-acquired it, and it is still the cached entry.
  if (entry.refCount > 0 || cache.get(url) !== entry) return
  if (entry.closeTimer != null) clearTimeout(entry.closeTimer)
  entry.closeTimer = null
  cache.delete(url)
  entry.promise.then(
    (img) => {
      // Only an ImageBitmap needs (or supports) an explicit close() to free
      // its decoded backing store immediately rather than waiting on GC: a
      // plain HTMLImageElement from the fallback path has no such method.
      if (typeof img.close === 'function') img.close()
    },
    () => {}
  )
}

// Close sheets nobody holds, oldest first, until `incoming` more bytes fit
// in the budget. In-use sheets are never closed.
function makeRoom(incoming) {
  if (residentBytes() + incoming <= SPRITE_MEMORY_BUDGET) return
  const idle = [...cache.entries()]
    .filter(([, e]) => e.refCount === 0)
    .sort((a, b) => a[1].releasedAt - b[1].releasedAt)
  for (const [url, entry] of idle) {
    closeEntry(url, entry)
    if (residentBytes() + incoming <= SPRITE_MEMORY_BUDGET) return
  }
}

// Returns { ready, release } synchronously: `ready` resolves to the decoded
// bitmap, `release` is idempotent and safe to call before `ready` settles (an
// unmount racing the decode).
// graceMs: how long the decoded bitmap lingers after the last holder lets go
// (default RELEASE_GRACE_MS, so a quick re-mount reuses it). 0 drops the
// reference immediately - the Shop gallery uses that so a hero you swiped
// away from (or a tab you left) doesn't keep ~tens of MB resident.
export function acquireSheet(url, graceMs = RELEASE_GRACE_MS) {
  let entry = cache.get(url)
  const fresh = !entry
  if (fresh) {
    makeRoom(ASSUMED_SHEET_BYTES)
    entry = {
      promise: null,
      refCount: 0,
      closeTimer: null,
      bytes: 0,
      releasedAt: 0,
    }
    cache.set(url, entry)
  }
  if (entry.closeTimer != null) {
    clearTimeout(entry.closeTimer)
    entry.closeTimer = null
  }
  // Counted BEFORE the decode is queued: the queue may start the job
  // immediately, and it skips sheets nobody holds.
  entry.refCount += 1
  if (fresh) {
    const created = entry
    created.promise = decode(url, created)
    // A failed (or cancelled) decode must not stay cached (every later
    // acquire would get the same rejection until the page reloads).
    created.promise.catch(() => {
      if (cache.get(url) === created) cache.delete(url)
    })
  }
  const held = entry
  let released = false
  const release = () => {
    if (released) return
    released = true
    held.refCount -= 1
    if (held.refCount > 0) return
    held.refCount = 0
    held.releasedAt = Date.now()
    if (graceMs <= 0) {
      closeEntry(url, held)
      return
    }
    held.closeTimer = setTimeout(() => closeEntry(url, held), graceMs)
  }
  return { ready: held.promise, release }
}

// Test hook: drop everything (closing bitmaps) and reset the queue.
export function resetSheetCacheForTests() {
  for (const [url, entry] of [...cache.entries()]) {
    entry.refCount = 0
    closeEntry(url, entry)
  }
  cache.clear()
  waiting.length = 0
  activeDecodes = 0
}
