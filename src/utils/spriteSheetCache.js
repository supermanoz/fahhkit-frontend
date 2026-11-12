// Shared, refcounted ImageBitmap cache for AnimatedSprite.jsx's grid-sheet
// player - every emote/idle sheet is decoded at most once no matter how
// many on-screen instances play it at once (e.g. a leaderboard row and a
// profile popup showing the same hero's idle), and is released (closed,
// freeing its GPU/CPU-side decoded memory) the moment the last instance
// using it stops being active - "load only when shown, cache and release
// when it's not visible" from the rebuild brief.
//
// Decoding happens only when a sheet is actually acquired (an emote
// becomes `active`) - acquiring a sheet never decoded before fetches +
// decodes it on demand, nothing is pre-warmed just because a manifest
// exists.
const cache = new Map() // url -> { promise: Promise<ImageBitmap|HTMLImageElement>, refCount }

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

// Resolves once decoded. Pairs 1:1 with releaseSheet(url) - every acquire
// must be matched by exactly one release (AnimatedSprite's own effect
// cleanup does this), or a sheet leaks for the rest of the session.
export function acquireSheet(url) {
  let entry = cache.get(url)
  if (!entry) {
    entry = { promise: decode(url), refCount: 0 }
    cache.set(url, entry)
  }
  entry.refCount += 1
  return entry.promise
}

export function releaseSheet(url) {
  const entry = cache.get(url)
  if (!entry) return
  entry.refCount -= 1
  if (entry.refCount > 0) return
  cache.delete(url)
  entry.promise.then((img) => {
    // Only an ImageBitmap needs (or supports) an explicit close() to free
    // its decoded backing store immediately rather than waiting on GC: a
    // plain HTMLImageElement from the fallback path has no such method.
    if (typeof img.close === 'function') img.close()
  })
}
