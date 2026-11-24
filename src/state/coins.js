import { useEffect, useSyncExternalStore } from 'react'
import { getTerritoryProfile } from '../api/territory'
import { isAppActive, onAppActivityChange } from '../utils/appActivity'

// THE one place the player's Fahhcoin balance lives. Every screen (HUD pill,
// daily-reward / welcome popups, shop, PvP, club, website pills) reads it via
// useCoins(); nothing keeps its own copy.
//
//   getCoins() / useCoins()    read (null until the first server answer)
//   setCoins(n, source)        a response carried the balance: write it now
//   applyDelta(d, source)      a known change (-20 donation...): write it now,
//                              then call refresh({ force: true }) to confirm
//   refresh({ force })         re-read from the existing profile endpoint
//                              (/v1/territory/profile -> fahhcoinBalance):
//                              in-flight deduped, max one request per 5 s
//   bindUser(id)               login / logout / account switch: resets
//
// No polling. Callers refresh after coin-changing actions, after login, on app
// resume (startResumeRefresh) and when a coin screen opens. A failed read never
// changes the number. A response older than the latest write is ignored.

export const MIN_GAP_MS = 5000

let state = { userId: null, balance: null }
let lastWriteAt = 0 // when the balance was last written (ms)
let seq = 0 // bumped on every write; a read started before it is stale
let lastFetchAt = -Infinity
let inflight = null
let trailing = null // timer for a forced refresh asked for inside the gap
let again = false // a forced refresh arrived while one was in flight
let fetcher = defaultFetcher
const listeners = new Set()

// Dev log of every update: [{ source, old, next, at }] (+ console.debug).
export const coinLog = []
function log(source, old, next) {
  const entry = { source, old, next, at: Date.now() }
  coinLog.push(entry)
  if (coinLog.length > 100) coinLog.shift()
  if (import.meta.env?.DEV && import.meta.env?.MODE !== 'test') {
    console.debug(`[coins] ${source}: ${old} -> ${next}`)
  }
}

const emit = () => listeners.forEach((l) => l())
const isCount = (n) => typeof n === 'number' && Number.isFinite(n)

async function defaultFetcher() {
  const profile = await getTerritoryProfile()
  return profile?.fahhcoinBalance
}

export function getCoins() {
  return state.balance
}
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function bindUser(userId) {
  const next = userId ?? null
  if (state.userId === next) return
  clearTimeout(trailing)
  trailing = null
  again = false
  seq += 1
  lastFetchAt = -Infinity
  log(next ? 'login' : 'logout', state.balance, null)
  state = { userId: next, balance: null }
  emit()
}

export function setCoins(n, source = 'set') {
  if (!isCount(n)) return false
  seq += 1
  lastWriteAt = Date.now()
  if (state.balance !== n) {
    log(source, state.balance, n)
    state = { ...state, balance: n }
    emit()
  }
  return true
}

// A balance a mail carried (PVP_RESULT.newBalance) is a snapshot from when the
// mail was created: ignore it if the store was written after that moment.
export function setCoinsIfNewer(n, createdAtMs, source = 'mail') {
  if (!Number.isFinite(createdAtMs) || createdAtMs < lastWriteAt) return false
  return setCoins(n, source)
}

export function applyDelta(delta, source = 'delta') {
  if (!isCount(delta) || state.balance == null) return false
  return setCoins(Math.max(0, state.balance + delta), source)
}

// For code that fetches the profile itself (GamePage.refreshProfile): take a
// token before the request and apply the answer only if nothing newer landed.
export const coinsToken = () => seq
export function setCoinsIfCurrent(token, n, source = 'profile') {
  return token === seq ? setCoins(n, source) : false
}

export function refresh({ force = false } = {}) {
  if (!state.userId) return Promise.resolve(state.balance)
  if (inflight) {
    if (force) again = true
    return inflight
  }
  const wait = lastFetchAt + MIN_GAP_MS - Date.now()
  if (wait > 0) {
    if (force && !trailing) {
      trailing = setTimeout(() => {
        trailing = null
        refresh({ force: true })
      }, wait)
    }
    return Promise.resolve(state.balance)
  }
  const uid = state.userId
  const token = seq
  lastFetchAt = Date.now()
  inflight = (async () => {
    try {
      const n = await fetcher()
      if (state.userId === uid) setCoinsIfCurrent(token, n, 'refresh')
    } catch {
      // Keep the last known balance.
    } finally {
      inflight = null
      if (again) {
        again = false
        refresh({ force: true })
      }
    }
    return state.balance
  })()
  return inflight
}

// App back in the foreground: one throttled refresh.
let unwatch = null
export function startResumeRefresh() {
  if (unwatch) return unwatch
  let last = isAppActive()
  const off = onAppActivityChange(() => {
    const now = isAppActive()
    if (now && !last) refresh()
    last = now
  })
  unwatch = () => {
    off()
    unwatch = null
  }
  return unwatch
}

export function useCoins() {
  return useSyncExternalStore(subscribe, getCoins, () => null)
}

// For screens outside the game: bind the signed-in user, read on mount.
export function useCoinsSession(userId) {
  useEffect(() => {
    bindUser(userId ?? null)
    if (userId) refresh()
  }, [userId])
  return useCoins()
}

// Tests only.
export function __resetForTests({ fetch } = {}) {
  clearTimeout(trailing)
  trailing = null
  again = false
  inflight = null
  seq = 0
  lastWriteAt = 0
  lastFetchAt = -Infinity
  state = { userId: null, balance: null }
  fetcher = fetch || defaultFetcher
  listeners.clear()
  coinLog.length = 0
}
