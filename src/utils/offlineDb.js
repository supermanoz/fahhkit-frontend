// Tiny promise wrapper over IndexedDB for the offline run store. Two object
// stores: `activeRun` (a durable mirror of the in-progress run) and `outbox`
// (finished runs waiting to upload, keyed by clientRunId). Falls back to an
// in-memory Map when IndexedDB is unavailable (unit tests, some private modes),
// so callers never branch on it.
const DB_NAME = 'fahhkit-offline'
const DB_VERSION = 1
export const STORE_ACTIVE = 'activeRun'
export const STORE_OUTBOX = 'outbox'

export function createMemoryDb() {
  const stores = { [STORE_ACTIVE]: new Map(), [STORE_OUTBOX]: new Map() }
  const clone = (v) => (v === undefined ? v : structuredClone(v))
  return {
    kind: 'memory',
    async get(store, key) {
      return clone(stores[store].get(key))
    },
    async put(store, key, value) {
      stores[store].set(key, clone(value))
    },
    async del(store, key) {
      stores[store].delete(key)
    },
    async all(store) {
      return [...stores[store].values()].map(clone)
    },
  }
}

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ACTIVE))
        db.createObjectStore(STORE_ACTIVE)
      if (!db.objectStoreNames.contains(STORE_OUTBOX))
        db.createObjectStore(STORE_OUTBOX)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function wrap(dbPromise) {
  const tx = async (store, mode, fn) => {
    const db = await dbPromise
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode)
      const out = fn(t.objectStore(store))
      t.oncomplete = () => resolve(out?.result)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  }
  return {
    kind: 'indexeddb',
    get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
    put: (store, key, value) =>
      tx(store, 'readwrite', (s) => s.put(value, key)),
    del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
    all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  }
}

let instance = null
export function getDb() {
  if (instance) return instance
  if (typeof indexedDB === 'undefined') {
    instance = createMemoryDb()
  } else {
    const db = wrap(openIdb())
    // If IndexedDB errors at runtime (e.g. blocked in a private window), fall
    // back to memory for the rest of the session instead of losing the run in
    // flight: callers still get answers, just non-durable.
    const mem = createMemoryDb()
    let broken = false
    const guard =
      (name) =>
      async (...args) => {
        if (broken) return mem[name](...args)
        try {
          return await db[name](...args)
        } catch (e) {
          console.warn('[offline] IndexedDB failed, using memory', e)
          broken = true
          return mem[name](...args)
        }
      }
    instance = {
      get kind() {
        return broken ? 'memory' : 'indexeddb'
      },
      get: guard('get'),
      put: guard('put'),
      del: guard('del'),
      all: guard('all'),
    }
  }
  return instance
}

export function __setDbForTests(db) {
  instance = db
}
