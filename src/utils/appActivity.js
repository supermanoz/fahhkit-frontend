// Single source of truth for "is the app actually being used right now":
// false while the tab/WebView is hidden (visibilitychange) or the native app is
// backgrounded (Capacitor appStateChange - the WebView doesn't always fire
// visibilitychange there). Everything that polls, animates or samples sensors
// consults this instead of running blind in the background, which is what
// keeps the phone from heating up.
//
// It also mirrors the state onto <html data-app-hidden> so CSS can pause every
// animation at once (see index.css).
import { App as CapacitorApp } from '@capacitor/app'
import { isNative } from './geo'

let active = typeof document === 'undefined' ? true : !document.hidden
const listeners = new Set()

function set(next) {
  if (next === active) return
  active = next
  if (typeof document !== 'undefined') {
    if (active) delete document.documentElement.dataset.appHidden
    else document.documentElement.dataset.appHidden = '1'
  }
  listeners.forEach((fn) => fn(active))
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => set(!document.hidden))
  if (isNative) {
    CapacitorApp.addListener('appStateChange', (state) =>
      set(Boolean(state.isActive))
    ).catch(() => {})
  }
  if (!active) document.documentElement.dataset.appHidden = '1'
}

export function isAppActive() {
  return active
}

// Returns an unsubscribe function. fn(active: boolean).
export function onAppActivityChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
