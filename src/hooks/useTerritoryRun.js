import { useCallback, useRef, useState } from 'react'
import { haversineDistance } from '../utils/run'

// Consumer GPS drifts a few meters even standing still, and watchPosition
// keeps firing on that drift — without a floor, every tick while idle reads
// as "distance covered." Points closer together than this are treated as
// noise and dropped rather than added to the path/distance.
const MIN_MOVEMENT_METERS = 4

// mode: 'idle' | 'gps' | 'manual'
// A standalone tracker for the Territory Run game — deliberately not
// useRunTracker, which is wired to backend createRun() and requires an
// eventId. This game has no backend yet, so it only ever touches
// localStorage (via territoryGame.js) and never calls the API.
export function useTerritoryRun() {
  const [mode, setMode] = useState('idle')
  const [path, setPath] = useState([])
  const [distance, setDistance] = useState(0)
  const [gpsError, setGpsError] = useState(null)
  const watchIdRef = useRef(null)

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const beginWatch = useCallback(() => {
    setGpsError(null)
    setPath([])
    setDistance(0)
    setMode('gps')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setPath((prev) => {
          const last = prev[prev.length - 1]
          if (last) {
            const moved = haversineDistance(last, point)
            if (moved < MIN_MOVEMENT_METERS) return prev
            setDistance((d) => d + moved)
          }
          return [...prev, point]
        })
      },
      (err) => {
        clearWatch()
        setMode('idle')
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was denied — enable it for this site, or use Tap to Draw instead.'
            : 'Could not get your location. Try Tap to Draw instead.'
        )
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
  }, [clearWatch])

  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('Your browser doesn’t support GPS tracking.')
      return
    }

    // Check permission state up front so a site the player already blocked
    // shows the "location not enabled" prompt immediately, instead of
    // silently doing nothing until watchPosition's own error callback (or
    // its 15s timeout) eventually fires. Not all browsers support querying
    // the geolocation permission, so fall straight through to the native
    // prompt when they don't.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (status.state === 'denied') {
            setGpsError(
              'Location is turned off for this site — enable it in your browser settings, then try again.'
            )
            return
          }
          beginWatch()
        })
        .catch(beginWatch)
    } else {
      beginWatch()
    }
  }, [beginWatch])

  const clearGpsError = useCallback(() => setGpsError(null), [])

  const startManual = useCallback(() => {
    setGpsError(null)
    setPath([])
    setDistance(0)
    setMode('manual')
  }, [])

  const addManualPoint = useCallback(
    (point) => {
      if (mode !== 'manual') return
      setPath((prev) => {
        const last = prev[prev.length - 1]
        if (last) {
          setDistance((d) => d + haversineDistance(last, point))
        }
        return [...prev, point]
      })
    },
    [mode]
  )

  const finish = useCallback(() => {
    clearWatch()
    setMode('idle')
  }, [clearWatch])

  const reset = useCallback(() => {
    clearWatch()
    setMode('idle')
    setPath([])
    setDistance(0)
    setGpsError(null)
  }, [clearWatch])

  return {
    mode,
    path,
    distance,
    gpsError,
    clearGpsError,
    startGps,
    startManual,
    addManualPoint,
    finish,
    reset,
  }
}
