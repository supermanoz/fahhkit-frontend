import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_ACCEPTABLE_ACCURACY_METERS,
  clearActiveRun,
  loadActiveRun,
  saveActiveRun,
} from '../utils/run'
import { VEHICLE_RUN_INVALID_RATIO } from '../constants/antiCheat'
import {
  createVehicleDetector,
  VehicleState,
  SegmentKind,
  compressSegments,
} from '../utils/vehicleDetection'
import { isAccessibilityModeEnabled } from '../utils/antiCheatSettings'
import { useWakeLock } from './useWakeLock'
import { watchPosition, clearWatch } from '../utils/geo'

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

// --- Vehicle detection (anti-cheat) ---
// The actual speed/cadence/pattern state machine lives in
// utils/vehicleDetection.js (framework-free, unit-tested there with
// simulated traces) - this hook only ever feeds it accepted GPS fixes and
// raw devicemotion samples, and translates its output into distance
// accounting + UI state. Thresholds live in constants/antiCheat.js.
//
// This is a real-time, client-side safeguard only - the backend
// independently re-validates the full raw trace after submission
// (TerritoryAntiCheatValidator / TerritoryProcessingServiceImpl) and never
// trusts anything reported here.

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
  // RUNNING | SUSPECT | VEHICLE - see utils/vehicleDetection.js. Drives the
  // banners in TrackRunPanel.jsx/GamePage.jsx.
  const [vehicleState, setVehicleState] = useState(VehicleState.RUNNING)
  const [vehicleReason, setVehicleReason] = useState(null)
  // Hides the current SUSPECT banner without changing detection state (a
  // "keep going" dismiss) - resets the moment the state changes again.
  const [suspectDismissed, setSuspectDismissed] = useState(false)

  const pointsRef = useRef([])
  const distanceRef = useRef(0)
  const watchIdRef = useRef(null)
  const timerRef = useRef(null)
  const startedAtRef = useRef(null)
  const eventIdRef = useRef(null)
  const detectorRef = useRef(null)
  // Flat per-fix segment log, compressed into runs at stop() - see
  // compressSegments in utils/vehicleDetection.js. Sent to the backend with
  // the run (per-segment flags) alongside the aggregate fields below.
  const segmentsRef = useRef([])
  const vehicleExcludedMetersRef = useRef(0)
  const traceMetersRef = useRef(0) // every non-jump segment, for avg speed
  const traceSecondsRef = useRef(0)
  const maxSpeedMpsRef = useRef(0)
  const totalStepsRef = useRef(0)
  // "I'm not in a vehicle" taps - sent with the run for moderator review,
  // never trusted client-side to mean the flagged segments weren't real.
  const disputesRef = useRef([])
  const motionAvailableRef = useRef(false)
  const motionAttachedRef = useRef(false)
  const vehicleStateRef = useRef(VehicleState.RUNNING)
  // PvP race this run counts for (see api/pvp.js) - persisted with the run
  // like eventId so a reload mid-race still submits it against the race.
  const challengeIdRef = useRef(null)
  // Club war this run is the player's entry for (see api/clubWar.js) - same
  // persistence as challengeId.
  const clubWarIdRef = useRef(null)
  const fixCountRef = useRef(0)
  const lastAccuracyRef = useRef(null)
  const hiddenAtRef = useRef(null)
  // watchPosition's id now arrives asynchronously (the native Geolocation
  // plugin has to await an OS permission check first) - this flags that
  // clearTimers() already ran before the id came back, so it's cleared
  // immediately on arrival instead of left dangling.
  const watchCancelledRef = useRef(false)
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

  const applyVehicleState = useCallback((nextState, reason) => {
    if (nextState !== vehicleStateRef.current) {
      vehicleStateRef.current = nextState
      setVehicleState(nextState)
      setSuspectDismissed(false)
    }
    setVehicleReason(reason ?? null)
  }, [])

  const dismissSuspect = useCallback(() => setSuspectDismissed(true), [])

  // "I'm not in a vehicle" - logs a dispute (sent with the run for moderator
  // review, never trusted blindly) and resumes tracking immediately. If the
  // athlete really is in a vehicle, sustained evidence trips the detector
  // again shortly - this doesn't disable detection going forward.
  const disputeVehicle = useCallback(() => {
    disputesRef.current.push({
      at: new Date().toISOString(),
      stateAtDispute: vehicleStateRef.current,
    })
    detectorRef.current?.dispute()
    applyVehicleState(VehicleState.RUNNING, null)
  }, [applyVehicleState])

  // Rough step/cadence detector off the accelerometer, forwarded into the
  // vehicle-detection state machine - see handleMotionSample in
  // utils/vehicleDetection.js for the actual peak-detection math.
  const handleDeviceMotion = useCallback((event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration
    if (!acc || acc.x == null) return
    const magnitude = Math.sqrt(
      (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
    )
    const isStep = detectorRef.current?.handleMotionSample(
      magnitude,
      Date.now()
    )
    if (isStep) totalStepsRef.current += 1
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
      detectorRef.current?.setMotionAvailable(false)
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
          detectorRef.current?.setMotionAvailable(motionAvailableRef.current)
          if (motionAvailableRef.current) attach()
        })
        .catch(() => {
          motionAvailableRef.current = false
          detectorRef.current?.setMotionAvailable(false)
        })
      return
    }
    motionAvailableRef.current = true
    detectorRef.current?.setMotionAvailable(true)
    attach()
  }, [handleDeviceMotion])

  const clearTimers = useCallback(() => {
    watchCancelledRef.current = true
    if (watchIdRef.current != null) {
      clearWatch(watchIdRef.current)
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
    watchCancelledRef.current = false

    timerRef.current = setInterval(() => {
      setElapsedSeconds(
        Math.round((Date.now() - startedAtRef.current.getTime()) / 1000)
      )
    }, 1000)

    watchPosition(
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

        if (previous && detectorRef.current) {
          const result = detectorRef.current.addGpsPoint({
            lat: point.lat,
            lng: point.lng,
            timestamp: point.timestamp,
            accuracy: point.accuracy,
            speedMps: point.speed,
          })
          const segment = result.segment
          if (segment) {
            segmentsRef.current.push({
              fromTimestamp: previous.timestamp,
              toTimestamp: point.timestamp,
              distanceMeters: segment.distanceMeters,
              kind: segment.kind,
              excluded: segment.excluded,
            })
            if (segment.kind !== SegmentKind.JUMP) {
              traceMetersRef.current += segment.distanceMeters
              traceSecondsRef.current +=
                (point.timestamp - previous.timestamp) / 1000
              if (segment.speedMps != null) {
                maxSpeedMpsRef.current = Math.max(
                  maxSpeedMpsRef.current,
                  segment.speedMps
                )
              }
            }
            if (segment.excluded) {
              if (segment.kind === SegmentKind.VEHICLE) {
                vehicleExcludedMetersRef.current += segment.distanceMeters
              }
              // Jump segments are discarded entirely - not real movement
              // either direction, same philosophy as the backend's own
              // filterTeleportingPoints.
            } else {
              distanceRef.current += segment.distanceMeters
              setDistance(distanceRef.current)
            }
          }
          applyVehicleState(result.state, result.reason)
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
    ).then((id) => {
      if (watchCancelledRef.current) {
        clearWatch(id)
        return
      }
      watchIdRef.current = id
    })
  }, [clearTimers, wakeLock, armMotionSensing, applyVehicleState])

  // Resumes a run that was already in progress when this component mounted —
  // covers a page refresh or the tracker being reopened after SPA navigation.
  // Note: the vehicle-detection state machine itself is NOT persisted across
  // a refresh (only points/distance are) - a resumed run's anti-cheat
  // tracking restarts clean from RUNNING.
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
        segments: saved.segments ?? [],
        vehicleExcludedMeters: saved.vehicleExcludedMeters ?? 0,
        vehicleSuspiciousRatio: saved.vehicleSuspiciousRatio ?? 0,
        isVehicleInvalid: saved.isVehicleInvalid ?? false,
        maxSpeedMps: saved.maxSpeedMps ?? null,
        avgSpeedMps: saved.avgSpeedMps ?? null,
        stepCount: saved.stepCount ?? 0,
        disputes: saved.disputes ?? [],
      })
      return
    }

    pointsRef.current = saved.points || []
    distanceRef.current = saved.distance || 0
    startedAtRef.current = new Date(saved.startedAt)
    eventIdRef.current = saved.eventId ?? null
    challengeIdRef.current = saved.challengeId ?? null
    clubWarIdRef.current = saved.clubWarId ?? null
    detectorRef.current = createVehicleDetector({
      hasMotionSensing: true,
      accessibilityMode: isAccessibilityModeEnabled(),
    })
    segmentsRef.current = []
    vehicleExcludedMetersRef.current = 0
    traceMetersRef.current = 0
    traceSecondsRef.current = 0
    maxSpeedMpsRef.current = 0
    totalStepsRef.current = 0
    disputesRef.current = []
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
      segmentsRef.current = []
      vehicleExcludedMetersRef.current = 0
      traceMetersRef.current = 0
      traceSecondsRef.current = 0
      maxSpeedMpsRef.current = 0
      totalStepsRef.current = 0
      disputesRef.current = []
      detectorRef.current = createVehicleDetector({
        hasMotionSensing: true,
        accessibilityMode: isAccessibilityModeEnabled(),
      })
      setPath([])
      setDistance(0)
      setElapsedSeconds(0)
      setBackgroundGapSeconds(null)
      setPendingRun(null)
      applyVehicleState(VehicleState.RUNNING, null)
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
    [beginWatch, applyVehicleState]
  )

  const stop = useCallback(() => {
    clearTimers()
    wakeLock.release()
    setStatus('idle')
    setBackgroundGapSeconds(null)

    const endedAt = new Date()
    const startedAt = startedAtRef.current ?? endedAt
    const segments = compressSegments(segmentsRef.current)
    const vehicleExcludedMeters = vehicleExcludedMetersRef.current
    const consideredMeters = distance + vehicleExcludedMeters
    const vehicleSuspiciousRatio =
      consideredMeters > 0 ? vehicleExcludedMeters / consideredMeters : 0
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
      // Anti-cheat telemetry sent with the run (see api/runs.js createRun) -
      // the backend re-validates independently and never trusts this alone.
      segments,
      vehicleExcludedMeters,
      vehicleSuspiciousRatio,
      isVehicleInvalid: vehicleSuspiciousRatio > VEHICLE_RUN_INVALID_RATIO,
      maxSpeedMps: maxSpeedMpsRef.current || null,
      avgSpeedMps:
        traceSecondsRef.current > 0
          ? traceMetersRef.current / traceSecondsRef.current
          : null,
      stepCount: totalStepsRef.current,
      disputes: disputesRef.current,
    }
    applyVehicleState(VehicleState.RUNNING, null)

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
        segments: result.segments,
        vehicleExcludedMeters: result.vehicleExcludedMeters,
        vehicleSuspiciousRatio: result.vehicleSuspiciousRatio,
        isVehicleInvalid: result.isVehicleInvalid,
        maxSpeedMps: result.maxSpeedMps,
        avgSpeedMps: result.avgSpeedMps,
        stepCount: result.stepCount,
        disputes: result.disputes,
      })
      setPendingRun(result)
    }

    return result
  }, [clearTimers, wakeLock, distance, applyVehicleState])

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
    vehicleState,
    vehicleReason,
    suspectDismissed,
    dismissSuspect,
    disputeVehicle,
    getDebugInfo: () => detectorRef.current?.getDebugInfo() ?? null,
  }
}
