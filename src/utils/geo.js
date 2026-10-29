import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

// Inside the native Android/iOS shell, the WebView's navigator.geolocation
// doesn't surface a proper OS permission prompt on its own - the native
// Geolocation plugin does, and returns the same {coords, timestamp} shape as
// the web API, so callers below need no change beyond swapping the source.
// In the browser/Vite dev server this is skipped entirely and every call
// here falls through to navigator.geolocation, unchanged from before.
export const isNative = Capacitor.isNativePlatform()

async function ensurePermission() {
  const current = await Geolocation.checkPermissions()
  if (current.location === 'granted' || current.location === 'limited') {
    return true
  }
  const requested = await Geolocation.requestPermissions()
  return requested.location === 'granted' || requested.location === 'limited'
}

// Matches the shape of a real GeolocationPositionError so existing
// `err.code === err.PERMISSION_DENIED` checks keep working unchanged.
function permissionDeniedError() {
  return { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
}

export function getCurrentPosition(onSuccess, onError, options) {
  if (!isNative) {
    navigator.geolocation.getCurrentPosition(onSuccess, onError, options)
    return
  }
  ensurePermission().then((granted) => {
    if (!granted) {
      onError?.(permissionDeniedError())
      return
    }
    Geolocation.getCurrentPosition(options).then(onSuccess).catch(onError)
  })
}

// Always resolves to a watch id (even on web, where
// navigator.geolocation.watchPosition's id is handed back synchronously) so
// every caller awaits one consistent shape instead of branching per platform.
export async function watchPosition(onSuccess, onError, options) {
  if (!isNative) {
    return navigator.geolocation.watchPosition(onSuccess, onError, options)
  }
  const granted = await ensurePermission()
  if (!granted) {
    onError?.(permissionDeniedError())
    return null
  }
  return Geolocation.watchPosition(options, (position, err) => {
    if (err) {
      onError?.(err)
      return
    }
    onSuccess(position)
  })
}

export function clearWatch(watchId) {
  if (watchId == null) return
  if (!isNative) {
    navigator.geolocation.clearWatch(watchId)
    return
  }
  Geolocation.clearWatch({ id: watchId })
}
