// localStorage/URL glue for the two anti-cheat device settings - kept out of
// vehicleDetection.js so that module stays framework/DOM-free and directly
// unit-testable. Both are TEMP, local-device-only toggles: neither has a
// backend field yet (see SESSION_NOTES.md's anti-cheat entry for the hook
// a future per-user accessibility preference would plug into).
import {
  ACCESSIBILITY_STORAGE_KEY,
  DEBUG_OVERLAY_STORAGE_KEY,
} from '../constants/antiCheat'

export function isAccessibilityModeEnabled() {
  try {
    return localStorage.getItem(ACCESSIBILITY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setAccessibilityModeEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, '1')
    else localStorage.removeItem(ACCESSIBILITY_STORAGE_KEY)
  } catch {
    // Storage full/unavailable - the toggle just won't persist across reloads.
  }
}

// `?debug=anticheat` on any page turns the debug overlay on and remembers it
// in localStorage, so a real-phone field test only needs the URL once (a
// driving test won't have the dev server's URL params handy afterwards).
// `?debug=off` clears it again.
export function isAntiCheatDebugEnabled() {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const debugParam = params.get('debug')
      if (debugParam === 'anticheat') {
        localStorage.setItem(DEBUG_OVERLAY_STORAGE_KEY, '1')
        return true
      }
      if (debugParam === 'off') {
        localStorage.removeItem(DEBUG_OVERLAY_STORAGE_KEY)
        return false
      }
    }
    return localStorage.getItem(DEBUG_OVERLAY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
