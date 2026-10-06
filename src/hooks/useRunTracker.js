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

// Some devices/browsers deliver more than one geolocation fix per second for
// the same moment (e.g. GPS and network/fused providers both reporting, or
// the OS just re-delivering) — accepting every raw watchPosition callback as
// its own point double(or more)-counts that stretch of ground, inflating
// distance with noise instead of real movement. Throttling to at most one
// accepted point per MIN_POINT_INTERVAL_MS collapses those redundant fixes;
// a real run never needs sub-2.5s point density anyway.
const MIN_POINT_INTERVAL_MS = 2500

// --- Live "is this actually a run" sanity check (gyroscope + pace) ---
// Entirely client-side - the backend only validates speed asynchronously
// after a run is already saved (see TerritoryAntiCheatValidator server-side),
// so there's nothing to call out to here. This is a warning, not a kill
// switch: phone-sensor heuristics alone can't be 100% certain (bridges,
// downhill stretches, a bumpy road), so it never auto-stops or discards data.
const SPEED_VIOLATION_WINDOW_MS = 12000 // rolling window used to average out single-fix GPS noise
const SPEED_VIOLATION_SUSTAIN_MS = 8000 // how long the violation must hold before it's shown
// ~25.2 km/h sustained, corroborated by zero detected footstrike cadence - well
// beyond even elite distance-running pace, but still reachable on a bike/scooter.
const SPEED_WARN_MPS = 7
// No motion sensor to corroborate with, so speed alone needs to look faster
// still before it's worth a warning (~30.6 km/h sustained).
const SPEED_ONLY_FALLBACK_MPS = 8.5
const BRISK_RUN_MPS = 3 // below this, "no cadence detected" could just be walking/standing
const GAIT_CHECK_WINDOW_MS = 8000 // trailing window used to look for footstrike peaks
const STEP_MIN_INTERVAL_MS = 250 // debounce between counted steps (caps ~4Hz)
const STEP_ACCEL_DEVIATION_MPS2 = 3 // deviation from the rolling gravity baseline that counts as a footstrike

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
  // Sustained implausible pace (optionally corroborated by missing footstrike
  // cadence) — see the SPEED_VIOLATION_* constants above. Null when nothing's
  // currently flagged.
  const [invalidMotion, setInvalidMotion] = useState(null)

  const pointsRef = useRef([])
  const distanceRef = useRef(0)
  const watchIdRef = useRef(null)
  const timerRef = useRef(null)
  const startedAtRef = useRef(null)
  const eventIdRef = useRef(null)
  const speedSamplesRef = useRef([])
  const stepTimestampsRef = useRef([])
  const motionBaselineRef = useRef(9.81)
  const motionAvailableRef = useRef(false)
  const motionAttachedRef = useRef(false)
  const lastStepAtRef = useRef(0)
  const violationStartedAtRef = useRef(null)
  // PvP race this run counts for (see api/pvp.js) - persisted with the run
  // like eventId so a reload mid-race still submits it against the race.
  const challengeIdRef = useRef(null)
  // Club war this run is the player's entry for (see api/clubWar.js) - same
  // persistence as challengeId.
  const clubWarIdRef = useRef(null)
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

  // Rough step/cadence detector off the accelerometer - a running gait has a
  // clear rhythmic footstrike (~1.5-4Hz) that a smooth vehicle ride doesn't.
  // Not trying to be a precise pedometer, just "is *any* cadence present".
  const handleDeviceMotion = useCallback((event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration
    if (!acc || acc.x == null) return
    const magnitude = Math.sqrt(
      (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
    )
    // Slow-moving baseline (not a fixed 9.81) so a tilted phone still reads
    // deviations relative to its own resting magnitude.
    motionBaselineRef.current += (magnitude - motionBaselineRef.current) * 0.05
    const deviation = Math.abs(magnitude - motionBaselineRef.current)
    const now = Date.now()
    if (
      deviation > STEP_ACCEL_DEVIATION_MPS2 &&
      now - lastStepAtRef.current > STEP_MIN_INTERVAL_MS
    ) {
      lastStepAtRef.current = now
      stepTimestampsRef.current = [
        ...stepTimestampsRef.current.filter(
          (t) => t > now - GAIT_CHECK_WINDOW_MS
        ),
        now,
      ]
    }
  }, [])

  const detachMotionSensing = useCallback(() => {
    if (motionAttachedRef.current) {
      window.removeEventListener('devicemotion', handleDeviceMotion)
      motionAttachedRef.current = false
    }
  }, [handleDeviceMotion])

  // iOS 13+ Safari requires an explicit, gesture-triggered permission prompt;
  // every other browser exposes devicemotion with no permission step at all.
  // Called from start()/the resume-on-mount effect, both already inside a
  // user-gesture call stack (or a page load that already had geolocation
  // permission), so the synchronous call here still counts as "from a
  // gesture" even though the rest of this function is async.
  const armMotionSensing = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      typeof DeviceMotionEvent === 'undefined'
    ) {
      motionAvailableRef.current = false
      return
    }
    const attach = () => {
      if (motionAttachedRef.current) return
      motionAttachedRef.current = true
      window.addEventListener('devicemotion', handleDeviceMotion)
    }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then((result) => {
          motionAvailableRef.current = result === 'granted'
          if (motionAvailableRef.current) attach()
        })
        .catch(() => {
          motionAvailableRef.current = false
        })
      return
    }
    motionAvailableRef.current = true
    attach()
  }, [handleDeviceMotion])

  // Checked after every accepted GPS point - samples is a rolling window of
  // {t, speedMps, distance, dt} built in the watchPosition callback below.
  const evaluateMotionPlausibility = useCallback((now) => {
    const samples = speedSamplesRef.current
    if (samples.length === 0) return
    const windowDistance = samples.reduce((sum, s) => sum + s.distance, 0)
    const windowTime = samples.reduce((sum, s) => sum + s.dt, 0)
    if (windowTime <= 0) return
    const avgSpeed = windowDistance / windowTime

    const hasGaitData = motionAvailableRef.current
    const recentSteps = stepTimestampsRef.current.filter(
      (t) => t > now - GAIT_CHECK_WINDOW_MS
    )
    const noGait =
      hasGaitData && avgSpeed > BRISK_RUN_MPS && recentSteps.length === 0
    const speedTooHigh = hasGaitData
      ? avgSpeed > SPEED_WARN_MPS
      : avgSpeed > SPEED_ONLY_FALLBACK_MPS
    const violating = speedTooHigh || noGait

    if (!violating) {
      violationStartedAtRef.current = null
      return
    }
    if (violationStartedAtRef.current == null) {
      violationStartedAtRef.current = now
      return
    }
    if (now - violationStartedAtRef.current >= SPEED_VIOLATION_SUSTAIN_MS) {
      setInvalidMotion(
        (current) => current || { reason: noGait ? 'no-gait' : 'speed' }
      )
    }
  }, [])

  const dismissInvalidMotion = useCallback(() => {
    setInvalidMotion(null)
    violationStartedAtRef.current = null
  }, [])

  const clearTimers = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timerRef.current != null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    detachMotionSensing()
  }, [detachMotionSensing])

  // Stops the browser-level watch/timer if the component unmounts mid-run
  // (e.g. SPA navigation away from the tracker) — the collected points stay
  // in localStorage either way, so reopening the tracker resumes from them.
  useEffect(() => clearTimers, [clearTimers])

  const beginWatch = useCallback(() => {
    setStatus('tracking')
    wakeLock.request()
    armMotionSensing()

    timerRef.current = setInterval(() => {
      setElapsedSeconds(
        Math.round((Date.now() - startedAtRef.current.getTime()) / 1000)
      )
    }, 1000)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, altitude, accuracy, speed, heading } =
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
          // The GPS chip's own course-over-ground, when the device/browser
          // can determine one (null when stationary or on a non-GPS
          // location provider, e.g. desktop WiFi positioning) - far more
          // reliable than deriving a heading from two consecutive fixes,
          // since it's computed from the raw sensor data itself rather
          // than from positioning noise (see GamePage.jsx's playerHeading).
          heading: heading ?? null,
        }

        const previous = pointsRef.current[pointsRef.current.length - 1]
        if (
          previous &&
          point.timestamp - previous.timestamp < MIN_POINT_INTERVAL_MS
        ) {
          return
        }

        pointsRef.current = [...pointsRef.current, point]
        setPath(pointsRef.current)
        if (previous) {
          const segmentDistance = haversineDistance(previous, point)
          distanceRef.current += segmentDistance
          setDistance(distanceRef.current)

          const dtSeconds = (point.timestamp - previous.timestamp) / 1000
          if (dtSeconds > 0) {
            const cutoff = point.timestamp - SPEED_VIOLATION_WINDOW_MS
            speedSamplesRef.current = [
              ...speedSamplesRef.current.filter((s) => s.t > cutoff),
              { t: point.timestamp, distance: segmentDistance, dt: dtSeconds },
            ]
            evaluateMotionPlausibility(point.timestamp)
          }
        }

        saveActiveRun({
          startedAt: startedAtRef.current.toISOString(),
          eventId: eventIdRef.current,
          challengeId: challengeIdRef.current,
          clubWarId: clubWarIdRef.current,
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
  }, [clearTimers, wakeLock, armMotionSensing, evaluateMotionPlausibility])

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
        challengeId: saved.challengeId ?? null,
        clubWarId: saved.clubWarId ?? null,
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
    challengeIdRef.current = saved.challengeId ?? null
    clubWarIdRef.current = saved.clubWarId ?? null
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
    (eventId, { challengeId = null, clubWarId = null } = {}) => {
      if (!('geolocation' in navigator)) {
        setStatus('unsupported')
        return
      }

      pointsRef.current = []
      distanceRef.current = 0
      fixCountRef.current = 0
      lastAccuracyRef.current = null
      speedSamplesRef.current = []
      stepTimestampsRef.current = []
      motionBaselineRef.current = 9.81
      violationStartedAtRef.current = null
      setPath([])
      setDistance(0)
      setElapsedSeconds(0)
      setBackgroundGapSeconds(null)
      setPendingRun(null)
      setInvalidMotion(null)
      startedAtRef.current = new Date()
      eventIdRef.current = eventId ?? null
      challengeIdRef.current = challengeId
      clubWarIdRef.current = clubWarId

      saveActiveRun({
        startedAt: startedAtRef.current.toISOString(),
        eventId: eventIdRef.current,
        challengeId: challengeIdRef.current,
        clubWarId: clubWarIdRef.current,
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
    setInvalidMotion(null)
    violationStartedAtRef.current = null

    const endedAt = new Date()
    const startedAt = startedAtRef.current ?? endedAt
    const result = {
      eventId: eventIdRef.current,
      challengeId: challengeIdRef.current,
      clubWarId: clubWarIdRef.current,
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
        challengeId: result.challengeId,
        clubWarId: result.clubWarId,
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
    // Read on render (status/distance changes re-render often enough).
    challengeId: challengeIdRef.current,
    clubWarId: clubWarIdRef.current,
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
    invalidMotion,
    dismissInvalidMotion,
  }
}
