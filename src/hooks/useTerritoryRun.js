import { useCallback, useRef, useState } from 'react'
import { haversineDistance } from '../utils/run'

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

  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('Your browser doesn’t support GPS tracking.')
      return
    }
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
            setDistance((d) => d + haversineDistance(last, point))
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
    startGps,
    startManual,
    addManualPoint,
    finish,
    reset,
  }
}
