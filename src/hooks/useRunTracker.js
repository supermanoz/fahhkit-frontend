import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_ACCEPTABLE_ACCURACY_METERS,
  MIN_DISTANCE_FOR_PACE_METERS,
  clearActiveRun,
  loadActiveRun,
  saveActiveRun,
  computeRunDurationSeconds,
  calculatePaceMinPerKm,
} from '../utils/run'
import {
  ACCESSIBILITY_SPEED_MULTIPLIER,
  VEHICLE_RUN_INVALID_RATIO,
} from '../constants/antiCheat'
import { describeGpsShortfall } from '../utils/runIssues'
import {
  createDistanceFilter,
  DISTANCE_FILTER_CONFIG,
  histogramLabels,
} from '../utils/distanceFilter'
import { isGpsWobble, MAX_CONSECUTIVE_WOBBLE_DROPS } from '../utils/gpsQuality'
import {
  createVehicleDetector,
  validDeviceSpeed,
  VehicleState,
  SegmentKind,
  compressSegments,
  buildPauseResumeJumpSegment,
} from '../utils/vehicleDetection'
import { newClientRunId } from '../utils/clientRunId'
import {
  isAccessibilityModeEnabled,
  isAntiCheatDebugEnabled,
} from '../utils/antiCheatSettings'
import { useWakeLock } from './useWakeLock'
import {
  getPedometerStatus,
  readPedometer,
  startPedometer,
  stopPedometer,
} from '../utils/pedometer'
import { chooseStepsSource } from '../utils/stepsSource'
import { watchPosition, clearWatch } from '../utils/geo'
import { publishFix } from '../utils/gpsFeed'
import {
  startRunNotification,
  updateRunNotification,
  pauseRunNotification,
  stopRunNotification,
} from '../utils/runNotification'
import { getRunMode, getRunModeLabel } from '../utils/runModeLabel'
import {
  VEHICLE_NOTIFICATION_HEADER,
  alertVehicleDiscarded,
  alertVehicleWarning,
  resetVehicleAlertCooldown,
} from '../utils/vehicleAlerts'

// Bare "m:ss" (no " /km" suffix - the notification's own label already says
// "Avg. pace (/km)"), gated exactly like GamePage.jsx's own run card
// (movingSeconds < 30 || distance < MIN_DISTANCE_FOR_PACE_METERS -> "--") so
// the notification's pace never shows something the in-game panel wouldn't.
// movingSeconds, not elapsedSeconds, on purpose - see that panel's own
// comment on why (pause-aware, doesn't count paused time as covered ground).
function notificationPaceLabel(distanceMeters, movingSeconds) {
  if (movingSeconds < 30 || distanceMeters < MIN_DISTANCE_FOR_PACE_METERS) {
    return null
  }
  const minutesPerKm = calculatePaceMinPerKm(distanceMeters, movingSeconds)
  if (!minutesPerKm || !Number.isFinite(minutesPerKm)) return null
  const totalSeconds = Math.round(minutesPerKm * 60)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

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
// A fresh counted-distance filter for a run. The speed ceiling is the one the
// detector uses for the same mode (accessibility mode raises it).
function newDistanceFilter() {
  return createDistanceFilter({
    maxSpeedMs: isAccessibilityModeEnabled()
      ? DISTANCE_FILTER_CONFIG.maxSpeedMs * ACCESSIBILITY_SPEED_MULTIPLIER
      : DISTANCE_FILTER_CONFIG.maxSpeedMs,
  })
}

export function useRunTracker() {
  const [status, setStatus] = useState('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // Elapsed minus accumulated paused time - identical to elapsedSeconds for
  // any run that never pauses (Conquer, PvP, Club War - none of them call
  // pause()), so every existing consumer of elapsedSeconds is unaffected.
  // Training's live "Time" stat and the duration submitted with the run
  // both read this instead (see stop() below) - see pause()/resume().
  const [movingSeconds, setMovingSeconds] = useState(0)
  const [paused, setPaused] = useState(false)
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
  // Wall-clock time (ms) the vehicle warning runs out and the run is thrown
  // away, null outside the warning. The UI ticks a countdown off it.
  const [vehicleWarningDeadline, setVehicleWarningDeadline] = useState(null)
  // True once a run was discarded for being in a vehicle - drives the
  // "Run discarded" message until the player dismisses it.
  const [vehicleDiscarded, setVehicleDiscarded] = useState(false)
  // Why a run ended with nothing measured when it was the phone's GPS (see
  // utils/runIssues.js): {kind, title, message} or null.
  const [runIssue, setRunIssue] = useState(null)
  const clearRunIssue = useCallback(() => setRunIssue(null), [])
  // Hides the current SUSPECT banner without changing detection state (a
  // "keep going" dismiss) - resets the moment the state changes again.
  const [suspectDismissed, setSuspectDismissed] = useState(false)

  const pointsRef = useRef([])
  const distanceRef = useRef(0)
  const watchIdRef = useRef(null)
  const timerRef = useRef(null)
  const startedAtRef = useRef(null)
  // The hero the player started this run as (Hero Poster share card needs it
  // for offline / Training / old runs the server has no loadout for).
  const heroIdRef = useRef(null)
  const eventIdRef = useRef(null)
  // Idempotency key for this run - created at start, persisted with it.
  const clientRunIdRef = useRef(null)
  const detectorRef = useRef(null)
  // Flat per-fix segment log, compressed into runs at stop() - see
  // compressSegments in utils/vehicleDetection.js. Sent to the backend with
  // the run (per-segment flags) alongside the aggregate fields below.
  const segmentsRef = useRef([])
  const vehicleExcludedMetersRef = useRef(0)
  // Consecutive fixes skipped as GPS wobble (utils/gpsQuality.js).
  const wobbleDropsRef = useRef(0)
  // Turns noisy fixes into the credited distance (utils/distanceFilter.js).
  const distanceFilterRef = useRef(null)
  const traceMetersRef = useRef(0) // every non-jump segment, for avg speed
  const traceSecondsRef = useRef(0)
  const maxSpeedMpsRef = useRef(0)
  const totalStepsRef = useRef(0)
  const stepsLostRef = useRef(false)
  // Native pedometer (utils/pedometer.js): the preferred step source. The
  // accelerometer count above is only the fallback (see stepsSource.js).
  // pedStepsRef = cumulative steps since the run began (pauses included),
  // pedPausedStepsRef = steps taken during pauses (taken back out), pedLostRef
  // = the count can no longer be trusted (resumed after a kill mid-pause).
  const pedStatusRef = useRef({ available: false, permission: 'unavailable' })
  const pedStepsRef = useRef(null)
  const pedPausedStepsRef = useRef(0)
  const pedAtPauseRef = useRef(null)
  const pedLostRef = useRef(false)
  // True once the pedometer is delivering: the distance filter's "no footsteps
  // for 10 s + slow = standing still" check then reads the pedometer instead
  // of the accelerometer peaks. pedLastStepAtRef = when its count last grew.
  const pedLiveRef = useRef(false)
  const pedLastStepAtRef = useRef(0)
  // "I'm not in a vehicle" taps - sent with the run for moderator review,
  // never trusted client-side to mean the flagged segments weren't real.
  const disputesRef = useRef([])
  const motionAvailableRef = useRef(false)
  const motionAttachedRef = useRef(false)
  const vehicleStateRef = useRef(VehicleState.RUNNING)
  // Whether the run notification header currently says "Vehicle detected".
  const vehicleHeaderShownRef = useRef(false)
  // PvP race this run counts for (see api/pvp.js) - persisted with the run
  // like eventId so a reload mid-race still submits it against the race.
  const challengeIdRef = useRef(null)
  // Club war this run is the player's entry for (see api/clubWar.js) - same
  // persistence as challengeId.
  const clubWarIdRef = useRef(null)
  // Started from the Training screen - a normal territory run in every way
  // (same submit path, same exp/territory/leaderboard outcome), the ONLY
  // difference is that GamePage's run panel shows the Pause/Resume button
  // only when this is true. Persisted the same way as challengeId/
  // clubWarId so a reload mid-run (or mid-pause) still knows to show it.
  const isTrainingRef = useRef(false)
  const fixCountRef = useRef(0)
  // Fixes dropped for being worse than MAX_ACCEPTABLE_ACCURACY_METERS.
  const lowAccuracyFixCountRef = useRef(0)
  const lastAccuracyRef = useRef(null)
  // Total ms spent paused so far this run, across every pause/resume cycle -
  // subtracted from wall-clock elapsed to get movingSeconds/the submitted
  // duration. pausedAtRef is the timestamp of the CURRENTLY open pause (null
  // when not paused) - its own span gets folded into pausedMsRef on resume()
  // (or on stop(), if the run ends while still paused).
  const pausedMsRef = useRef(0)
  const pausedAtRef = useRef(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  // Set by resume(), consumed by the next accepted GPS fix after it - see
  // the point handler in beginWatch for why this fix is excluded from
  // distance instead of scored normally.
  const resumeJumpPendingRef = useRef(false)
  const hiddenAtRef = useRef(null)
  // watchPosition's id now arrives asynchronously (the native Geolocation
  // plugin has to await an OS permission check first) - this flags that
  // clearTimers() already ran before the id came back, so it's cleared
  // immediately on arrival instead of left dangling.
  const watchCancelledRef = useRef(false)
  // Set right before calling beginWatch() from start()/resume()/the mount-
  // reattach effect, consumed once watchPosition's promise resolves (see
  // beginWatch) - the Android notification (RunNotificationPlugin) can only
  // safely take over the BackgroundGeolocation plugin's own notification
  // after that plugin's addWatcher has actually run, so it can't be kicked
  // off any earlier than this regardless of which of the three call sites
  // triggered it. null between runs/when nothing needs it.
  const pendingNotifyRef = useRef(null)
  // Same words as the in-game run panel header (utils/runModeLabel.js).
  const notifyTitle = (state) =>
    getRunModeLabel(
      getRunMode({
        isTraining: isTrainingRef.current,
        clubWarId: clubWarIdRef.current,
        challengeId: challengeIdRef.current,
      }),
      state
    )
  const statusRef = useRef(status)
  statusRef.current = status
  const wakeLock = useWakeLock()

  // Flags when the tab was backgrounded (screen locked, app switched away) for
  // long enough that GPS tracking likely paused, so the UI can warn the route
  // may have a gap — see the useRunTracker() writeup for why this can't just
  // keep tracking through it.
  useEffect(() => {
    function onVisibilityChange() {
      // Paused already means "GPS is deliberately off" - backgrounding
      // through a break the runner asked for isn't a route gap to warn
      // about, unlike backgrounding mid-tracking.
      if (document.visibilityState === 'hidden') {
        if (statusRef.current === 'tracking' && !pausedRef.current) {
          hiddenAtRef.current = Date.now()
        }
        return
      }
      if (hiddenAtRef.current == null) return
      const hiddenMs = Date.now() - hiddenAtRef.current
      hiddenAtRef.current = null
      if (
        statusRef.current === 'tracking' &&
        !pausedRef.current &&
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

  const applyVehicleState = useCallback(
    (nextState, reason, warningSecondsLeft = null) => {
      if (nextState !== vehicleStateRef.current) {
        vehicleStateRef.current = nextState
        setVehicleState(nextState)
        setSuspectDismissed(false)
      }
      setVehicleReason(reason ?? null)
      setVehicleWarningDeadline(
        nextState === VehicleState.VEHICLE && warningSecondsLeft != null
          ? Date.now() + warningSecondsLeft * 1000
          : null
      )
    },
    []
  )

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

  const onPedometerSteps = useCallback((steps) => {
    if (steps == null) return
    if (pedStepsRef.current == null || steps > pedStepsRef.current) {
      pedLastStepAtRef.current = Date.now()
    }
    pedStepsRef.current = steps
    pedLiveRef.current = true
  }, [])

  // Start counting from the run's (original) start time. Never throws; when the
  // pedometer is unavailable or not allowed the run just uses the fallback.
  const beginPedometer = useCallback(
    async (startedAtMs) => {
      pedStepsRef.current = null
      pedLiveRef.current = false
      pedLastStepAtRef.current = startedAtMs
      const status = await getPedometerStatus()
      pedStatusRef.current = status
      if (!status.available || status.permission !== 'granted') return
      const ok = await startPedometer(startedAtMs, (r) =>
        onPedometerSteps(r?.steps ?? null)
      )
      if (!ok) return
      const first = await readPedometer(startedAtMs)
      if (first?.steps != null) onPedometerSteps(first.steps)
    },
    [onPedometerSteps]
  )

  // The step count a finished run reports (null = leave steps out entirely).
  const resolveSteps = useCallback((pedometerSteps) => {
    const ped = pedStatusRef.current
    const net =
      pedometerSteps == null || pedLostRef.current
        ? null
        : Math.max(0, pedometerSteps - pedPausedStepsRef.current)
    return chooseStepsSource({
      pedometer: {
        available: ped.available,
        permission: ped.permission,
        steps: net,
      },
      accelerometer: {
        available: motionAvailableRef.current,
        steps: totalStepsRef.current,
        lost: stepsLostRef.current,
      },
    })
  }, [])

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
      const now = Date.now()
      setElapsedSeconds(
        Math.round((now - startedAtRef.current.getTime()) / 1000)
      )
      setMovingSeconds(
        computeRunDurationSeconds(
          startedAtRef.current.getTime(),
          now,
          pausedMsRef.current
        )
      )
    }, 1000)

    watchPosition(
      (position) => {
        // A late fix after stop()/pause()/a vehicle discard must never
        // re-create the run it just ended.
        if (watchCancelledRef.current) return
        const { latitude, longitude, altitude, accuracy, speed, heading } =
          position.coords
        fixCountRef.current += 1
        lastAccuracyRef.current = accuracy ?? null
        // Every raw fix, unfiltered, for the heading-up map (see gpsFeed).
        publishFix({
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
          speed: validDeviceSpeed(speed),
          heading: Number.isFinite(heading) && heading >= 0 ? heading : null,
          t: position.timestamp,
        })
        if (accuracy != null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
          lowAccuracyFixCountRef.current += 1
          distanceFilterRef.current?.noteRejectedFix(accuracy)
          return
        }

        const point = {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
          timestamp: position.timestamp,
          // iOS reports -1 for "unknown" - never pass that on as a speed.
          speed: validDeviceSpeed(speed),
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
        // Imprecise fix whose "movement" is only position noise (the chip
        // says we're still, or the hop is impossible for the chip's speed):
        // leave it out of the trace - see utils/gpsQuality.js. Never more
        // than a few in a row, so the trace always resyncs.
        if (
          previous &&
          !resumeJumpPendingRef.current &&
          wobbleDropsRef.current < MAX_CONSECUTIVE_WOBBLE_DROPS &&
          isGpsWobble(previous, point)
        ) {
          wobbleDropsRef.current += 1
          return
        }
        wobbleDropsRef.current = 0

        pointsRef.current = [...pointsRef.current, point]
        setPath(pointsRef.current)
        // What the distance filter sees (the route keeps the raw `point`).
        const filterFix = {
          lat: point.lat,
          lng: point.lng,
          timestamp: point.timestamp,
          accuracy: point.accuracy,
          speed: point.speed,
        }

        if (previous && resumeJumpPendingRef.current) {
          // The first fix after resume() - the real-world gap since the
          // last pre-pause point (which may include real movement, e.g.
          // walking at a water stop) never counts as run distance, but the
          // route line still connects straight through it rather than
          // showing a break. Recorded as an explicit JUMP/excluded segment
          // (same shape a GPS teleport gets) so moderator review still
          // shows what happened here instead of an unexplained silent gap.
          // detectorRef.current was reset fresh in resume() - feeding it
          // this point only primes its internal lastPoint/timing state,
          // scoring nothing, the same as any run's very first fix.
          resumeJumpPendingRef.current = false
          segmentsRef.current.push(buildPauseResumeJumpSegment(previous, point))
          // The distance filter starts over from here (still, at this spot).
          distanceFilterRef.current?.rebase(filterFix)
          detectorRef.current?.addGpsPoint({
            lat: point.lat,
            lng: point.lng,
            timestamp: point.timestamp,
            accuracy: point.accuracy,
            speedMps: point.speed,
          })
        } else if (!previous) {
          // First fix of the run: just sets the distance filter's anchor.
          distanceFilterRef.current?.process(filterFix)
        } else if (previous && detectorRef.current) {
          const result = detectorRef.current.addGpsPoint({
            lat: point.lat,
            lng: point.lng,
            timestamp: point.timestamp,
            accuracy: point.accuracy,
            speedMps: point.speed,
          })
          const segment = result.segment
          // Credited length of this hop: the filter sees every non-jump fix
          // (to keep its anchor in step) but only a non-excluded segment is
          // added. Raw lengths stay in the telemetry below.
          let creditedMeters = 0
          if (segment) {
            creditedMeters =
              segment.kind === SegmentKind.JUMP || !distanceFilterRef.current
                ? segment.distanceMeters
                : distanceFilterRef.current.process(filterFix, {
                    secondsSinceStep: pedLiveRef.current
                      ? (point.timestamp - pedLastStepAtRef.current) / 1000
                      : detectorRef.current.secondsSinceStep(point.timestamp),
                  }).meters
          }
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
                vehicleExcludedMetersRef.current += creditedMeters
              }
              // Jump segments are discarded entirely - not real movement
              // either direction, same philosophy as the backend's own
              // filterTeleportingPoints.
            } else {
              distanceRef.current += creditedMeters
              setDistance(distanceRef.current)
            }
          }
          if (result.reclaimMeters > 0) {
            // The detector needed a few seconds to recognise the vehicle:
            // take back the distance it let through in the meantime.
            // The detector measured that stretch in raw hops; scale it to
            // what the filter actually credited.
            const fs = distanceFilterRef.current?.getStats()
            const scale =
              fs && fs.rawMeters > 0
                ? Math.min(1, fs.countedMeters / fs.rawMeters)
                : 1
            const reclaim = Math.min(
              result.reclaimMeters * scale,
              distanceRef.current
            )
            distanceRef.current -= reclaim
            vehicleExcludedMetersRef.current += reclaim
            setDistance(distanceRef.current)
          }
          applyVehicleState(
            result.state,
            result.reason,
            result.warningSecondsLeft
          )
          if (result.enteredVehicle) {
            alertVehicleWarning()
            if (!pausedRef.current) {
              updateRunNotification({ title: VEHICLE_NOTIFICATION_HEADER })
            }
          } else if (
            result.state === VehicleState.RUNNING &&
            vehicleHeaderShownRef.current
          ) {
            updateRunNotification({ title: '' })
          }
          vehicleHeaderShownRef.current = result.state === VehicleState.VEHICLE
          updateRunNotification({
            distanceMeters: distanceRef.current,
            paceLabel: notificationPaceLabel(
              distanceRef.current,
              computeRunDurationSeconds(
                startedAtRef.current.getTime(),
                point.timestamp,
                pausedMsRef.current
              )
            ),
          })
        }

        saveActiveRun({
          startedAt: startedAtRef.current.toISOString(),
          eventId: eventIdRef.current,
          clientRunId: clientRunIdRef.current,
          challengeId: challengeIdRef.current,
          clubWarId: clubWarIdRef.current,
          isTraining: isTrainingRef.current,
          heroId: heroIdRef.current,
          points: pointsRef.current,
          distance: distanceRef.current,
          paused: false,
          pausedMs: pausedMsRef.current,
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
      if (pendingNotifyRef.current) {
        startRunNotification({
          ...pendingNotifyRef.current,
          title: notifyTitle(),
        })
        pendingNotifyRef.current = null
      }
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
      // An indoor run legitimately has no points (treadmill, no GPS).
      if ((!saved.points || saved.points.length === 0) && !saved.isIndoor) {
        clearActiveRun()
        return
      }
      const savedStartedAt = new Date(saved.startedAt)
      const savedEndedAt = new Date(saved.endedAt)
      setDistance(saved.distance || 0)
      setElapsedSeconds(saved.duration ?? 0)
      setPendingRun({
        eventId: saved.eventId ?? null,
        clientRunId: saved.clientRunId ?? null,
        challengeId: saved.challengeId ?? null,
        clubWarId: saved.clubWarId ?? null,
        isTraining: saved.isTraining ?? false,
        heroId: saved.heroId ?? null,
        isIndoor: saved.isIndoor ?? false,
        points: saved.points ?? [],
        distance: saved.distance || 0,
        duration: saved.duration ?? 0,
        startedAt: savedStartedAt,
        endedAt: savedEndedAt,
        fixCount: saved.fixCount ?? saved.points.length,
        lowAccuracyFixCount: saved.lowAccuracyFixCount ?? 0,
        lastAccuracy: saved.lastAccuracy ?? null,
        segments: saved.segments ?? [],
        vehicleExcludedMeters: saved.vehicleExcludedMeters ?? 0,
        vehicleSuspiciousRatio: saved.vehicleSuspiciousRatio ?? 0,
        isVehicleInvalid: saved.isVehicleInvalid ?? false,
        maxSpeedMps: saved.maxSpeedMps ?? null,
        avgSpeedMps: saved.avgSpeedMps ?? null,
        stepCount: saved.stepCount ?? null,
        stepsSource: saved.stepsSource ?? null,
        distanceSource: saved.distanceSource ?? null,
        disputes: saved.disputes ?? [],
      })
      return
    }

    pointsRef.current = saved.points || []
    distanceRef.current = saved.distance || 0
    startedAtRef.current = new Date(saved.startedAt)
    eventIdRef.current = saved.eventId ?? null
    clientRunIdRef.current = saved.clientRunId ?? null
    challengeIdRef.current = saved.challengeId ?? null
    clubWarIdRef.current = saved.clubWarId ?? null
    isTrainingRef.current = saved.isTraining ?? false
    heroIdRef.current = saved.heroId ?? null
    pausedMsRef.current = saved.pausedMs || 0
    distanceFilterRef.current = newDistanceFilter()
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
    // Steps taken before the app was killed are gone: a count from here on
    // would be a partial one, so this run reports no steps at all.
    stepsLostRef.current = true
    // The pedometer, unlike the accelerometer count, survives the kill: it
    // counts from the run's original start. Only a run that was ever paused
    // can't be trusted (the steps taken during the pause are unknown now).
    pedPausedStepsRef.current = 0
    pedAtPauseRef.current = null
    pedLostRef.current = Boolean(saved.paused || saved.pausedMs > 0)
    beginPedometer(startedAtRef.current.getTime())
    disputesRef.current = []
    setPath(pointsRef.current)
    setDistance(distanceRef.current)

    // A paused run needs an explicit tap (resume(), below) to re-arm
    // geolocation rather than silently restarting it - most browsers want
    // a fresh user gesture for that after a reload anyway, and backgroundGap
    // detection has nothing meaningful to say about a deliberate pause. The
    // timer/distance/route stay exactly as they were at pause time until
    // then (see GamePage's "Resume unfinished run").
    if (saved.paused) {
      pausedAtRef.current = saved.pausedAt
        ? new Date(saved.pausedAt).getTime()
        : Date.now()
      setPaused(true)
      setStatus('tracking')
      setElapsedSeconds(
        Math.round(
          (pausedAtRef.current - startedAtRef.current.getTime()) / 1000
        )
      )
      setMovingSeconds(
        computeRunDurationSeconds(
          startedAtRef.current.getTime(),
          pausedAtRef.current,
          pausedMsRef.current
        )
      )
      return
    }

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

    const reattachMovingSeconds = computeRunDurationSeconds(
      startedAtRef.current.getTime(),
      Date.now(),
      pausedMsRef.current
    )
    pendingNotifyRef.current = {
      elapsedMs: reattachMovingSeconds * 1000,
      distanceMeters: distanceRef.current,
      paceLabel: notificationPaceLabel(
        distanceRef.current,
        reattachMovingSeconds
      ),
    }
    beginWatch()
    // Runs once on mount only — beginWatch is stable across the run's lifetime via its own deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(
    (
      eventId,
      {
        challengeId = null,
        clubWarId = null,
        isTraining = false,
        heroId = null,
      } = {}
    ) => {
      if (!('geolocation' in navigator)) {
        setStatus('unsupported')
        return
      }

      pointsRef.current = []
      distanceRef.current = 0
      fixCountRef.current = 0
      lowAccuracyFixCountRef.current = 0
      lastAccuracyRef.current = null
      segmentsRef.current = []
      vehicleExcludedMetersRef.current = 0
      traceMetersRef.current = 0
      traceSecondsRef.current = 0
      maxSpeedMpsRef.current = 0
      totalStepsRef.current = 0
      stepsLostRef.current = false
      pedPausedStepsRef.current = 0
      pedAtPauseRef.current = null
      pedLostRef.current = false
      disputesRef.current = []
      distanceFilterRef.current = newDistanceFilter()
      detectorRef.current = createVehicleDetector({
        hasMotionSensing: true,
        accessibilityMode: isAccessibilityModeEnabled(),
      })
      pausedMsRef.current = 0
      pausedAtRef.current = null
      resumeJumpPendingRef.current = false
      setPaused(false)
      setPath([])
      setDistance(0)
      setElapsedSeconds(0)
      setMovingSeconds(0)
      setBackgroundGapSeconds(null)
      setPendingRun(null)
      applyVehicleState(VehicleState.RUNNING, null)
      resetVehicleAlertCooldown()
      vehicleHeaderShownRef.current = false
      setVehicleDiscarded(false)
      startedAtRef.current = new Date()
      eventIdRef.current = eventId ?? null
      clientRunIdRef.current = newClientRunId()
      challengeIdRef.current = challengeId
      clubWarIdRef.current = clubWarId
      isTrainingRef.current = isTraining
      heroIdRef.current = heroId

      saveActiveRun({
        startedAt: startedAtRef.current.toISOString(),
        eventId: eventIdRef.current,
        clientRunId: clientRunIdRef.current,
        challengeId: challengeIdRef.current,
        clubWarId: clubWarIdRef.current,
        isTraining: isTrainingRef.current,
        heroId: heroIdRef.current,
        paused: false,
        pausedMs: 0,
        points: [],
        distance: 0,
      })
      pendingNotifyRef.current = {
        elapsedMs: 0,
        distanceMeters: 0,
        paceLabel: null,
      }
      beginPedometer(startedAtRef.current.getTime())
      beginWatch()
    },
    [beginWatch, applyVehicleState, beginPedometer]
  )

  // The stopped (not yet submitted) run, as it is kept on disk so a reload or
  // app kill still finds it.
  const persistStopped = useCallback((result) => {
    saveActiveRun({
      startedAt: result.startedAt.toISOString(),
      eventId: result.eventId,
      clientRunId: result.clientRunId,
      challengeId: result.challengeId,
      clubWarId: result.clubWarId,
      isTraining: result.isTraining,
      heroId: result.heroId ?? null,
      isIndoor: result.isIndoor ?? false,
      points: result.points,
      distance: result.distance,
      stopped: true,
      endedAt: result.endedAt.toISOString(),
      duration: result.duration,
      fixCount: result.fixCount,
      lowAccuracyFixCount: result.lowAccuracyFixCount,
      lastAccuracy: result.lastAccuracy,
      segments: result.segments,
      vehicleExcludedMeters: result.vehicleExcludedMeters,
      vehicleSuspiciousRatio: result.vehicleSuspiciousRatio,
      isVehicleInvalid: result.isVehicleInvalid,
      maxSpeedMps: result.maxSpeedMps,
      avgSpeedMps: result.avgSpeedMps,
      stepCount: result.stepCount,
      stepsSource: result.stepsSource ?? null,
      distanceSource: result.distanceSource ?? null,
      disputes: result.disputes,
    })
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    wakeLock.release()
    setStatus('idle')
    setBackgroundGapSeconds(null)
    pendingNotifyRef.current = null
    stopRunNotification()

    const endedAt = new Date()
    const startedAt = startedAtRef.current ?? endedAt
    // Ending while still paused (no explicit resume() first) folds that
    // open pause's own span in too - time spent paused never counts as
    // moving time either way.
    const totalPausedMs =
      pausedAtRef.current != null
        ? pausedMsRef.current + (endedAt.getTime() - pausedAtRef.current)
        : pausedMsRef.current
    pausedAtRef.current = null
    setPaused(false)
    const segments = compressSegments(segmentsRef.current)
    const vehicleExcludedMeters = vehicleExcludedMetersRef.current
    const consideredMeters = distance + vehicleExcludedMeters
    const vehicleSuspiciousRatio =
      consideredMeters > 0 ? vehicleExcludedMeters / consideredMeters : 0
    const stepSelection = resolveSteps(pedStepsRef.current)
    const result = {
      eventId: eventIdRef.current,
      clientRunId: clientRunIdRef.current,
      challengeId: challengeIdRef.current,
      clubWarId: clubWarIdRef.current,
      isTraining: isTrainingRef.current,
      heroId: heroIdRef.current,
      points: pointsRef.current,
      distance,
      // Moving time, not wall clock - see pause()/resume() and the
      // movingSeconds state above. Identical to the old plain elapsed
      // calculation for any run that never paused (totalPausedMs stays 0).
      duration: computeRunDurationSeconds(
        startedAt.getTime(),
        endedAt.getTime(),
        totalPausedMs
      ),
      startedAt,
      endedAt,
      fixCount: fixCountRef.current,
      lowAccuracyFixCount: lowAccuracyFixCountRef.current,
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
      // The pedometer's count when it is available and allowed, else the
      // accelerometer's; null = no reliable source (denied / unsupported /
      // counted nothing): the payload then omits steps rather than sending a
      // fake 0. A final pedometer read (below) refines it a moment later.
      stepCount: stepSelection.steps,
      stepsSource: stepSelection.source,
      disputes: disputesRef.current,
    }
    // Calibration log (debug flag only, off by default): raw vs credited
    // length, fixes held as drift, accuracy histogram - for tuning
    // DISTANCE_FILTER_CONFIG against real-phone runs.
    if (isAntiCheatDebugEnabled() && distanceFilterRef.current) {
      const st = distanceFilterRef.current.getStats()
      console.info('[distance-calibration]', {
        rawPathMeters: Math.round(st.rawMeters),
        countedMeters: Math.round(st.countedMeters),
        driftFixesDropped: st.driftDrops,
        fixesRejectedForAccuracy: st.accuracyDropped,
        accuracyHistogram: Object.fromEntries(
          histogramLabels().map((label, i) => [label, st.histogram[i]])
        ),
      })
    }
    applyVehicleState(VehicleState.RUNNING, null)

    if (result.points.length === 0) {
      // Nothing worth retrying — clear rather than leaving an empty pending record behind.
      clearActiveRun()
      setPendingRun(null)
      setRunIssue(describeGpsShortfall(result))
    } else {
      persistStopped(result)
      setPendingRun(result)
    }

    // The phone's count can lag the last second or two: read it once more and
    // update the run waiting to be saved (long before anyone taps Submit).
    pedLiveRef.current = false
    const stoppedAtMs = startedAt.getTime()
    if (pedStatusRef.current.permission === 'granted') {
      readPedometer(stoppedAtMs)
        .then((res) => {
          if (res?.steps == null || result.points.length === 0) return
          const refined = resolveSteps(res.steps)
          const updated = {
            ...result,
            stepCount: refined.steps,
            stepsSource: refined.source,
          }
          persistStopped(updated)
          setPendingRun((p) =>
            p && p.clientRunId === result.clientRunId ? updated : p
          )
        })
        .finally(() => stopPedometer())
    } else {
      stopPedometer()
    }

    return result
  }, [
    clearTimers,
    wakeLock,
    distance,
    applyVehicleState,
    resolveSteps,
    persistStopped,
  ])

  const clearPendingRun = useCallback(() => {
    clearActiveRun()
    setPendingRun(null)
    setDistance(0)
    setElapsedSeconds(0)
    setMovingSeconds(0)
    setPath([])
  }, [])

  // The vehicle warning ran out: the run is thrown away - stopped, nothing
  // saved or submitted (no XP, no territory) - and a clear message stays up
  // until the player dismisses it. Applies to every mode, Training included.
  useEffect(() => {
    if (vehicleState !== VehicleState.DISCARDED) return
    if (statusRef.current !== 'tracking') return
    stop()
    clearPendingRun()
    setVehicleDiscarded(true)
    alertVehicleDiscarded()
  }, [vehicleState, stop, clearPendingRun])

  const dismissVehicleDiscarded = useCallback(
    () => setVehicleDiscarded(false),
    []
  )

  // Training-only (other modes never call this - see GamePage's run panel,
  // which only ever shows a Pause button there). Stops watchPosition and the
  // timer exactly like a full stop() would, but leaves everything else
  // (points, distance, the wake lock - kept deliberately, unlike stop()) in
  // place so resume() picks up right where this left off.
  const pause = useCallback(() => {
    if (statusRef.current !== 'tracking' || pausedAtRef.current != null) return
    clearTimers()
    pausedAtRef.current = Date.now()
    pedAtPauseRef.current = pedStepsRef.current
    if (pedLiveRef.current && startedAtRef.current) {
      // The cached count can lag a moment: pin the pause point to a real read.
      const pausedAt = pausedAtRef.current
      readPedometer(startedAtRef.current.getTime()).then((res) => {
        if (res?.steps != null && pausedAtRef.current === pausedAt)
          pedAtPauseRef.current = res.steps
      })
    }
    setPaused(true)
    saveActiveRun({
      startedAt: startedAtRef.current.toISOString(),
      eventId: eventIdRef.current,
      clientRunId: clientRunIdRef.current,
      challengeId: challengeIdRef.current,
      clubWarId: clubWarIdRef.current,
      isTraining: isTrainingRef.current,
      heroId: heroIdRef.current,
      points: pointsRef.current,
      distance: distanceRef.current,
      paused: true,
      pausedAt: new Date(pausedAtRef.current).toISOString(),
      pausedMs: pausedMsRef.current,
    })
    pauseRunNotification({ title: notifyTitle('paused') })
  }, [clearTimers])

  const resume = useCallback(() => {
    if (pausedAtRef.current == null) return
    pausedMsRef.current += Date.now() - pausedAtRef.current
    pausedAtRef.current = null
    setPaused(false)
    // Steps taken while paused are not part of the run: measure them now (the
    // pedometer kept counting) and take them back out.
    const atPause = pedAtPauseRef.current
    pedAtPauseRef.current = null
    if (pedLiveRef.current && atPause != null && startedAtRef.current) {
      readPedometer(startedAtRef.current.getTime()).then((res) => {
        if (res?.steps != null) {
          pedPausedStepsRef.current += Math.max(0, res.steps - atPause)
          onPedometerSteps(res.steps)
        }
      })
    } else if (atPause == null) {
      // No reading at the pause: the pause's steps are unknown.
      pedLostRef.current = pedLostRef.current || pedLiveRef.current
    }
    resumeJumpPendingRef.current = true
    // Fresh detector - the pause itself may include real movement (a water
    // stop, walking off and back), so whatever RUNNING/SUSPECT/VEHICLE
    // evidence it had built up shouldn't carry across the gap - same reset
    // start() already does for a brand new run.
    detectorRef.current = createVehicleDetector({
      hasMotionSensing: motionAvailableRef.current,
      accessibilityMode: isAccessibilityModeEnabled(),
    })
    const resumeMovingSeconds = computeRunDurationSeconds(
      startedAtRef.current.getTime(),
      Date.now(),
      pausedMsRef.current
    )
    pendingNotifyRef.current = {
      elapsedMs: resumeMovingSeconds * 1000,
      distanceMeters: distanceRef.current,
      paceLabel: notificationPaceLabel(
        distanceRef.current,
        resumeMovingSeconds
      ),
    }
    beginWatch()
  }, [beginWatch, onPedometerSteps])

  // A finished run that did not come from GPS tracking (the indoor treadmill
  // run - hooks/useIndoorRun.js) joins the normal save/submit path: it becomes
  // the pending run, kept on disk like any stopped run, and goes through the
  // same offline outbox and retry.
  const adoptRun = useCallback(
    (result) => {
      persistStopped(result)
      setPendingRun(result)
    },
    [persistStopped]
  )

  return {
    // Read on render (status/distance changes re-render often enough).
    challengeId: challengeIdRef.current,
    clubWarId: clubWarIdRef.current,
    isTraining: isTrainingRef.current,
    heroId: heroIdRef.current,
    status,
    elapsedSeconds,
    movingSeconds,
    paused,
    distance,
    path,
    start,
    stop,
    pause,
    resume,
    backgroundGapSeconds,
    dismissBackgroundGap,
    pendingRun,
    clearPendingRun,
    adoptRun,
    vehicleState,
    vehicleReason,
    vehicleWarningDeadline,
    vehicleDiscarded,
    dismissVehicleDiscarded,
    runIssue,
    clearRunIssue,
    suspectDismissed,
    dismissSuspect,
    disputeVehicle,
    // Debug panel only (utils/antiCheatSettings.js): the detector's live
    // readout plus the distance filter's calibration numbers.
    getDebugInfo: () => {
      const info = detectorRef.current?.getDebugInfo() ?? null
      if (!info) return null
      return {
        ...info,
        distance: distanceFilterRef.current?.getStats() ?? null,
      }
    },
  }
}
