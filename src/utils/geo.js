import { Capacitor, registerPlugin } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

// Inside the native Android/iOS shell, the WebView's navigator.geolocation
// doesn't surface a proper OS permission prompt on its own - the native
// Geolocation plugin does, and returns the same {coords, timestamp} shape as
// the web API, so callers below need no change beyond swapping the source.
// In the browser/Vite dev server this is skipped entirely and every call
// here falls through to navigator.geolocation, unchanged from before.
export const isNative = Capacitor.isNativePlatform()

// Only watchPosition (the continuous run-tracking stream useRunTracker
// drives) goes through this - getCurrentPosition is one-shot and used for
// map-centering elsewhere, where the screen is by definition on and the app
// foregrounded, so plain @capacitor/geolocation is enough for it.
// BackgroundGeolocation keeps delivering fixes on Android via a foreground
// service + persistent notification when the screen locks or the app is
// backgrounded mid-run - no ACCESS_BACKGROUND_LOCATION needed, since a
// foreground service is exempt from that restriction.
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

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

// BackgroundGeolocation's location shape ({longitude, latitude, accuracy,
// altitude, bearing, speed, time, ...}) reshaped into the same
// {coords: {...}, timestamp} contract as the Geolocation plugin/web API, so
// callers (useRunTracker) don't need to branch on which source produced it.
function toPositionShape(location) {
  return {
    coords: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? null,
      altitude: location.altitude ?? null,
      speed: location.speed ?? null,
      heading: location.bearing ?? null,
    },
    timestamp: location.time,
  }
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
  return BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Run in progress',
      backgroundMessage: 'Tracking your territory run - tap to return.',
      requestPermissions: false, // already granted via ensurePermission() above
      stale: false,
      distanceFilter: 0, // useRunTracker does its own MIN_POINT_INTERVAL_MS throttling
    },
    (location, err) => {
      if (err) {
        onError?.(err.code === 'NOT_AUTHORIZED' ? permissionDeniedError() : err)
        return
      }
      onSuccess(toPositionShape(location))
    }
  )
}

export function clearWatch(watchId) {
  if (watchId == null) return
  if (!isNative) {
    navigator.geolocation.clearWatch(watchId)
    return
  }
  BackgroundGeolocation.removeWatcher({ id: watchId })
}
