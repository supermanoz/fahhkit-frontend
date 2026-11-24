// ONE source of truth for "can this device reach our API right now?".
//
// navigator.onLine lies (captive-portal wifi, wifi with no data, airplane mode
// toggled mid-request), so it is only a hint that triggers a REAL probe: a
// lightweight request to the API host. Any HTTP answer (even 404) means the
// server is reachable; only a network failure/timeout counts as offline.
//
//  - offline is applied after OFFLINE_DEBOUNCE_MS of stable failure (a flapping
//    connection never makes the UI flicker);
//  - online is applied immediately (a successful probe, or any successful API
//    response reported through reportNetworkSuccess());
//  - while offline it re-probes every PROBE_EVERY_OFFLINE_MS.
//
// Sources: window online/offline events, the app coming back to the foreground
// (appActivity - web visibility AND the native appStateChange) and the API
// client reporting its own failures/successes. @capacitor/network could be
// plugged in as one more source in start(); it is not needed for correctness.
import { useSyncExternalStore } from 'react'
import { isAppActive, onAppActivityChange } from './appActivity'

export const OFFLINE_DEBOUNCE_MS = 2000
export const PROBE_EVERY_OFFLINE_MS = 8000
const PROBE_TIMEOUT_MS = 4000

let state = { online: true, settled: false }
const listeners = new Set()
let probeUrl = () => null
let offlineTimer = null
let retryTimer = null
let probing = null
let started = false
let fetchImpl = null // tests

function set(next) {
  if (next.online === state.online && next.settled === state.settled) return
  state = next
  if (typeof document !== 'undefined') {
    if (state.online) delete document.documentElement.dataset.offline
    else document.documentElement.dataset.offline = '1'
  }
  listeners.forEach((fn) => fn(state))
}

export function getConnectivity() {
  return state
}
export function isOnline() {
  return state.online
}
export function subscribeConnectivity(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// api/client.js tells us which host to probe (avoids a circular import).
export function setProbeUrlProvider(fn) {
  probeUrl = fn
}
export function __setFetchForTests(fn) {
  fetchImpl = fn
}

function goOnline() {
  clearTimeout(offlineTimer)
  offlineTimer = null
  clearTimeout(retryTimer)
  retryTimer = null
  set({ online: true, settled: true })
}

function scheduleOffline() {
  if (!state.online || offlineTimer) return
  offlineTimer = setTimeout(() => {
    offlineTimer = null
    set({ online: false, settled: true })
    scheduleRetry()
  }, OFFLINE_DEBOUNCE_MS)
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    if (!state.online) probe()
  }, PROBE_EVERY_OFFLINE_MS)
}

// Real reachability check. Resolves to true/false and updates the store.
export function probe() {
  if (probing) return probing
  const url = probeUrl()
  if (!url) return Promise.resolve(state.online)
  const run = fetchImpl || ((u, o) => fetch(u, o))
  const ctrl =
    typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeout = setTimeout(() => ctrl?.abort(), PROBE_TIMEOUT_MS)
  probing = run(url, {
    method: 'GET',
    mode: 'no-cors', // an opaque answer is still an answer
    cache: 'no-store',
    signal: ctrl?.signal,
  })
    .then(() => {
      reportNetworkSuccess()
      return true
    })
    .catch(() => {
      reportNetworkFailure(true)
      return false
    })
    .finally(() => {
      clearTimeout(timeout)
      probing = null
    })
  return probing
}

// The API client saw a real response: we are online, right now.
export function reportNetworkSuccess() {
  if (!state.online || !state.settled || offlineTimer) goOnline()
}

// The API client (or a probe) failed at network level. `confirmed` = a probe
// failed (trustworthy); an ordinary request failure first asks for a probe.
export function reportNetworkFailure(confirmed = false) {
  if (confirmed) {
    scheduleOffline()
    if (!state.online) scheduleRetry()
  } else {
    probe()
  }
}

export function start() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', () => probe())
  window.addEventListener('offline', () => reportNetworkFailure(true))
  onAppActivityChange((active) => {
    if (active) probe()
  })
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    reportNetworkFailure(true)
  } else if (isAppActive()) {
    // Confirm the first state quietly; the banner never reacts to "unknown".
    probe()
  }
}

export function __resetForTests() {
  clearTimeout(offlineTimer)
  clearTimeout(retryTimer)
  offlineTimer = retryTimer = probing = null
  state = { online: true, settled: false }
  listeners.clear()
  started = false
  fetchImpl = null
  probeUrl = () => null
}

// React: re-renders when online/offline flips. `settled` stays false until the
// first confirmed answer so the UI can avoid reacting to the initial unknown.
export function useConnectivity() {
  return useSyncExternalStore(
    subscribeConnectivity,
    getConnectivity,
    getConnectivity
  )
}
export function useIsOnline() {
  return useConnectivity().online
}
