import { useSyncExternalStore } from 'react'
import { DEBUG_INFO } from '../config/debugInfo'

// Hidden on-screen panel for the heading-up map (components/MapDebugPanel).
// Off in normal use. On with VITE_DEBUG_MAP=1 at build time, or at runtime by
// long-pressing the version text in Settings (toggles; remembered on this
// device).
const KEY = 'fahhkit_debug_map'
const listeners = new Set()

function stored() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
let memory = null

// ?debugmap=1 / ?debugmap=0 in the URL switches it on / off (and remembers).
try {
  const q = new URLSearchParams(window.location.search).get('debugmap')
  if (q === '1' || q === '0') localStorage.setItem(KEY, q)
} catch {
  // no window / storage: ignore
}

export function isMapDebugEnabled() {
  if (!DEBUG_INFO) return false // never in release/staging builds
  if (import.meta.env?.VITE_DEBUG_MAP === '1') return true
  return memory !== null ? memory : stored()
}

export function setMapDebugEnabled(on) {
  memory = Boolean(on)
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Applies for this session only.
  }
  listeners.forEach((l) => l())
}

export function toggleMapDebug() {
  setMapDebugEnabled(!isMapDebugEnabled())
  return isMapDebugEnabled()
}

function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useMapDebug() {
  return useSyncExternalStore(subscribe, isMapDebugEnabled, () => false)
}
