// Small request layer: in-flight de-duplication plus a bounded TTL cache.
//
// - dedupe(key, fn): callers asking for the same key while a request is in
//   flight share ONE promise (StrictMode double effects, two components
//   fetching the same endpoint). Nothing is kept once it settles.
// - cached(key, fn, { ttlMs }): serves a fresh entry instantly, otherwise
//   dedupes. Stale entries are still readable with peek() so a screen can
//   paint them while the refresh runs (stale-while-revalidate).
// - invalidate(prefix): call after mutations (buy, equip, claim, join).
// Memory only, bounded, never used for tokens or balances.
const inflight = new Map()
const store = new Map() // key -> { at, value }
const MAX_ENTRIES = 60

export function dedupe(key, fn) {
  const running = inflight.get(key)
  if (running) return running
  const p = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key)
    })
  inflight.set(key, p)
  return p
}

export function peek(key) {
  const hit = store.get(key)
  return hit ? { value: hit.value, ageMs: Date.now() - hit.at } : null
}

export function cached(key, fn, { ttlMs = 60_000 } = {}) {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value)
  return dedupe(key, fn).then((value) => {
    store.delete(key)
    store.set(key, { at: Date.now(), value })
    while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value)
    return value
  })
}

export function invalidate(prefix = '') {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k)
}

// Tests / sign-out.
export function clearRequestCache() {
  store.clear()
  inflight.clear()
}
