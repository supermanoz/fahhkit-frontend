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
const RELEASE_GRACE_MS = 8000
const cache = new Map() // url -> { promise, refCount, closeTimer }

function decode(url) {
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

function closeEntry(url, entry) {
  // Only if nobody re-acquired it during the grace period, and it is still
  // the cached entry for this url.
  if (entry.refCount > 0 || cache.get(url) !== entry) return
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

// Returns { ready, release } synchronously: `ready` resolves to the decoded
// bitmap, `release` is idempotent and safe to call before `ready` settles (an
// unmount racing the decode).
export function acquireSheet(url) {
  let entry = cache.get(url)
  if (!entry) {
    entry = { promise: decode(url), refCount: 0, closeTimer: null }
    const created = entry
    cache.set(url, created)
    // A failed decode must not stay cached (every later acquire would get
    // the same rejection until the page reloads).
    created.promise.catch(() => {
      if (cache.get(url) === created) cache.delete(url)
    })
  }
  if (entry.closeTimer != null) {
    clearTimeout(entry.closeTimer)
    entry.closeTimer = null
  }
  entry.refCount += 1
  const held = entry
  let released = false
  const release = () => {
    if (released) return
    released = true
    held.refCount -= 1
    if (held.refCount > 0) return
    held.refCount = 0
    held.closeTimer = setTimeout(() => closeEntry(url, held), RELEASE_GRACE_MS)
  }
  return { ready: held.promise, release }
}
