import { useSyncExternalStore } from 'react'

// Settings > Map > "Rotate map while running". Stored on this device only.
// Default ON: the map turns to face the way you run during an active run.
const KEY = 'fahhkit_map_rotate_while_running'
const HINT_KEY = 'fahhkit_map_rotation_hint_seen'
const listeners = new Set()

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === 'true'
  } catch {
    return fallback
  }
}

export function getRotateWhileRunning() {
  return read(KEY, true)
}

export function setRotateWhileRunning(on) {
  try {
    localStorage.setItem(KEY, String(Boolean(on)))
  } catch {
    // Not remembered next launch; still applies for this session below.
    memory = Boolean(on)
  }
  listeners.forEach((l) => l())
}

let memory = null
const snapshot = () => (memory !== null ? memory : getRotateWhileRunning())

function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useRotateWhileRunning() {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}

// The one-time "Map turns as you run" tip.
export function hasSeenRotationHint() {
  return read(HINT_KEY, false)
}
export function markRotationHintSeen() {
  try {
    localStorage.setItem(HINT_KEY, 'true')
  } catch {
    // Shown again next launch at worst.
  }
}
