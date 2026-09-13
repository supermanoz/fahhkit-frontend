import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_ACCEPTABLE_ACCURACY_METERS,
  clearActiveRun,
  haversineDistance,
  loadActiveRun,
  saveActiveRun,
} from '../utils/run'
import { useWakeLock } from './useWakeLock'

// Below this, a brief tab switch or notification check isn't worth warning about.
const BACKGROUND_GAP_THRESHOLD_MS = 10000

// status: idle | tracking | permission-denied | unsupported | error
export function useRunTracker() {
  const [status, setStatus] = useState('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [distance, setDistance] = useState(0)
  // Mirrors pointsRef as render-visible state, {lat,lng} only — for callers
  // that draw the live trail on a map (e.g. GamePage). TrackRunPanel doesn't
  // use this; it's additive and doesn't change tracking/save behavior.
  const [path, setPath] = useState([])
  const [backgroundGapSeconds, setBackgroundGapSeconds] = useState(null)
  // A finished run that hasn't been saved to the server yet (e.g. the POST failed
  // because there was no connection) — kept in localStorage until it succeeds, so
  // it survives closing the app rather than being lost.
  const [pendingRun, setPendingRun] = useState(null)

  const pointsRef = useRef([])
  const distanceRef = useRef(0)
  const watchIdRef = useRef(null)
  const timerRef = useRef(null)
  const startedAtRef = useRef(null)
  const eventIdRef = useRef(null)
  const fixCountRef = useRef(0)
  const lastAccuracyRef = useRef(null)
  const hiddenAtRef = useRef(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const wakeLock = useWakeLock()

  // Flags when the tab was backgrounded (screen locked, app switched away) for
  // long enough that GPS tracking likely paused, so the UI can warn the route
  // may have a gap — see the useRunTracker() writeup for why this can't just
  // keep tracking through it.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (statusRef.current === 'tracking') {
          hiddenAtRef.current = Date.now()
        }
        return
      }
      if (hiddenAtRef.current == null) return
      const hiddenMs = Date.now() - hiddenAtRef.current
      hiddenAtRef.current = null
      if (
        statusRef.current === 'tracking' &&
        hiddenMs > BACKGROUND_GAP_THRESHOLD_MS
      ) {
        setBackgroundGapSeconds(Math.round(hiddenMs / 1000))
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const dismissBackgroundGap = useCallback(
    () => setBackgroundGapSeconds(null),
    []
  )

  const clearTimers = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timerRef.current != null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Stops the browser-level watch/timer if the component unmounts mid-run
  // (e.g. SPA navigation away from the tracker) — the collected points stay
  // in localStorage either way, so reopening the tracker resumes from them.
  useEffect(() => clearTimers, [clearTimers])

  const beginWatch = useCallback(() => {
    setStatus('tracking')
    wakeLock.request()

    timerRef.current = setInterval(() => {
      setElapsedSeconds(
        Math.round((Date.now() - startedAtRef.current.getTime()) / 1000)
      )
    }, 1000)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, altitude, accuracy, speed } =
          position.coords
        fixCountRef.current += 1
        lastAccuracyRef.current = accuracy ?? null
        if (accuracy != null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS)
          return

        const point = {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
          timestamp: position.timestamp,
          speed: speed ?? null,
          elevation: altitude ?? null,
        }

        const previous = pointsRef.current[pointsRef.current.length - 1]
        pointsRef.current = [...pointsRef.current, point]
        setPath(pointsRef.current)
        if (previous) {
          distanceRef.current += haversineDistance(previous, point)
          setDistance(distanceRef.current)
        }

        saveActiveRun({
          startedAt: startedAtRef.current.toISOString(),
          eventId: eventIdRef.current,
          points: pointsRef.current,
          distance: distanceRef.current,
        })
      },
      (err) => {
        clearTimers()
        wakeLock.release()
        setStatus(
          err.code === err.PERMISSION_DENIED ? 'permission-denied' : 'error'
        )
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
  }, [clearTimers, wakeLock])

  // Resumes a run that was already in progress when this component mounted —
  // covers a page refresh or the tracker being reopened after SPA navigation.
  useEffect(() => {
    const saved = loadActiveRun()
    if (!saved || !('geolocation' in navigator)) return

    if (saved.stopped) {
      if (!saved.points || saved.points.length === 0) {
        clearActiveRun()
        return
      }
      const savedStartedAt = new Date(saved.startedAt)
      const savedEndedAt = new Date(saved.endedAt)
      setDistance(saved.distance || 0)
      setElapsedSeconds(saved.duration ?? 0)
      setPendingRun({
        eventId: saved.eventId ?? null,
        points: saved.points,
        distance: saved.distance || 0,
        duration: saved.duration ?? 0,
        startedAt: savedStartedAt,
        endedAt: savedEndedAt,
        fixCount: saved.fixCount ?? saved.points.length,
        lastAccuracy: saved.lastAccuracy ?? null,
      })
      return
    }

    pointsRef.current = saved.points || []
    distanceRef.current = saved.distance || 0
    startedAtRef.current = new Date(saved.startedAt)
    eventIdRef.current = saved.eventId ?? null
    setPath(pointsRef.current)
    setDistance(distanceRef.current)
    setElapsedSeconds(
      Math.round((Date.now() - startedAtRef.current.getTime()) / 1000)
    )

    const lastPoint = pointsRef.current[pointsRef.current.length - 1]
    const lastKnownAt = lastPoint
      ? lastPoint.timestamp
      : startedAtRef.current.getTime()
    const goneMs = Date.now() - lastKnownAt
    if (goneMs > BACKGROUND_GAP_THRESHOLD_MS) {
      setBackgroundGapSeconds(Math.round(goneMs / 1000))
    }

    beginWatch()
    // Runs once on mount only — beginWatch is stable across the run's lifetime via its own deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(
    (eventId) => {
      if (!('geolocation' in navigator)) {
        setStatus('unsupported')
        return
      }

      pointsRef.current = []
      distanceRef.current = 0
      fixCountRef.current = 0
      lastAccuracyRef.current = null
      setPath([])
      setDistance(0)
      setElapsedSeconds(0)
      setBackgroundGapSeconds(null)
      setPendingRun(null)
      startedAtRef.current = new Date()
      eventIdRef.current = eventId ?? null

      saveActiveRun({
        startedAt: startedAtRef.current.toISOString(),
        eventId: eventIdRef.current,
        points: [],
        distance: 0,
      })
      beginWatch()
    },
    [beginWatch]
  )

  const stop = useCallback(() => {
    clearTimers()
    wakeLock.release()
    setStatus('idle')
    setBackgroundGapSeconds(null)

    const endedAt = new Date()
    const startedAt = startedAtRef.current ?? endedAt
    const result = {
      eventId: eventIdRef.current,
      points: pointsRef.current,
      distance,
      duration: Math.round((endedAt - startedAt) / 1000),
      startedAt,
      endedAt,
      fixCount: fixCountRef.current,
      lastAccuracy: lastAccuracyRef.current,
    }

    if (result.points.length === 0) {
      // Nothing worth retrying — clear rather than leaving an empty pending record behind.
      clearActiveRun()
      setPendingRun(null)
    } else {
      saveActiveRun({
        startedAt: startedAt.toISOString(),
        eventId: result.eventId,
        points: result.points,
        distance: result.distance,
        stopped: true,
        endedAt: endedAt.toISOString(),
        duration: result.duration,
        fixCount: result.fixCount,
        lastAccuracy: result.lastAccuracy,
      })
      setPendingRun(result)
    }

    return result
  }, [clearTimers, wakeLock, distance])

  const clearPendingRun = useCallback(() => {
    clearActiveRun()
    setPendingRun(null)
    setDistance(0)
    setElapsedSeconds(0)
    setPath([])
  }, [])

  return {
    status,
    elapsedSeconds,
    distance,
    path,
    start,
    stop,
    backgroundGapSeconds,
    dismissBackgroundGap,
    pendingRun,
    clearPendingRun,
  }
}
