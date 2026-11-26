// Diagnostics for the "is territory capture available here?" check
// (hooks/useRolloutStatus.js). Keeps the last few checks - which coordinates
// were sent, what the server answered (or why it failed) and what the app
// decided - so "I disabled a city but nothing happened" can be answered from
// the phone instead of guessing. Always recorded (tiny, in memory); logged to
// the console and shown in Settings > About ONLY when DEBUG_INFO is on (dev
// server or VITE_DEBUG_INFO=1) - never in release/staging builds, and there is
// no URL/storage switch players could stumble into.
import { useSyncExternalStore } from 'react'
import { API_BASE_URL } from '../config/backend'
import { DEBUG_INFO } from '../config/debugInfo'

const MAX_ENTRIES = 10
const listeners = new Set()
let entries = []
let snapshot = []

export function isRolloutDebugEnabled() {
  return DEBUG_INFO
}

// entry: { trigger, lat, lng, accuracy, ok, response?, error?, decision }
export function recordRolloutCheck(entry) {
  const full = { at: Date.now(), api: API_BASE_URL, ...entry }
  entries = [full, ...entries].slice(0, MAX_ENTRIES)
  snapshot = entries
  if (isRolloutDebugEnabled() && typeof console !== 'undefined') {
    console.info('[rollout]', formatRolloutCheck(full))
  }
  listeners.forEach((l) => l())
  return full
}

export function getRolloutChecks() {
  return snapshot
}

export function clearRolloutChecksForTests() {
  entries = []
  snapshot = []
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useRolloutChecks() {
  return useSyncExternalStore(subscribe, getRolloutChecks, getRolloutChecks)
}

const f5 = (n) => (typeof n === 'number' ? n.toFixed(5) : '?')

export function formatRolloutCheck(e) {
  const time = new Date(e.at).toLocaleTimeString()
  const where = `@${f5(e.lat)},${f5(e.lng)}${e.accuracy != null ? ` ±${Math.round(e.accuracy)}m` : ''}`
  const answer = e.ok
    ? `rolledOut=${e.response?.rolledOut} city=${e.response?.cityName ?? '-'} requested=${e.response?.alreadyRequested}`
    : `ERROR ${e.error}`
  return `${time} [${e.trigger}] ${where} -> ${answer} => ${e.decision}`
}
