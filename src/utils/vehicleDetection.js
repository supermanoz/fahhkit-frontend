// Vehicle-detection (anti-cheat) state machine for live run tracking. Zero
// React/DOM imports on purpose, same philosophy as the backend's own
// TerritoryAntiCheatValidator (service/support/TerritoryAntiCheatValidator.java)
// - directly unit-testable with hand-built point/motion traces, no mocking a
// hook or the DOM required. See src/hooks/useRunTracker.js for the only
// consumer, and src/constants/antiCheat.js for every tunable threshold.
//
// This is a *client-side, real-time* safeguard (pause distance/territory
// credit the moment a run looks vehicle-assisted) - it does not replace the
// backend's own after-the-fact re-validation (TerritoryAntiCheatValidator,
// TerritoryProcessingServiceImpl), which independently recomputes from the
// raw submitted points and never trusts anything this module reports.
import { haversineDistance } from './run'
import {
  ACCESSIBILITY_SPEED_MULTIPLIER,
  ACCURACY_LIMIT_METERS,
  BIKE_SPEED_MS,
  BIKE_SUSTAIN_SECONDS,
  BRISK_SPEED_MS,
  CADENCE_WINDOW_SECONDS,
  FAST_PACE_SPEED_MS,
  DOPPLER_TOLERANCE_MS,
  FAST_PACE_WINDOW_SECONDS,
  GAIT_ENERGY_RMS_MPS2,
  GAP_SECONDS,
  GOOD_ACCURACY_METERS,
  MAX_PLAUSIBLE_SPEED_MS,
  MIN_CADENCE_HZ,
  MIN_WINDOW_COVERAGE_SECONDS,
  NO_GAIT_SUSTAIN_SECONDS,
  NO_MOTION_TIMEOUT_SECONDS,
  RESUME_SECONDS,
  RESUME_WINDOW_SECONDS,
  SKIP_INITIAL_SECONDS,
  STEP_ACCEL_DEVIATION_MPS2,
  STEP_MIN_INTERVAL_MS,
  SUSPECT_SUSTAIN_SECONDS,
  VEHICLE_SPEED_MS,
  VEHICLE_SUSTAIN_SECONDS,
  VEHICLE_WARNING_SECONDS,
  WARNING_MEMORY_SECONDS,
  WINDOW_SECONDS,
} from '../constants/antiCheat'

// RUNNING  - nothing odd.
// SUSPECT  - bike-like speed held for a while: banner only, still counts.
// VEHICLE  - the WARNING phase: distance stops counting and a countdown
//            (VEHICLE_WARNING_SECONDS) runs; running speed again clears it.
// DISCARDED - the warning ran out: the run is thrown away (terminal).
export const VehicleState = Object.freeze({
  RUNNING: 'running',
  SUSPECT: 'suspect',
  VEHICLE: 'vehicle',
  DISCARDED: 'discarded',
})

export const SegmentKind = Object.freeze({
  RUNNING: 'running',
  SUSPECT: 'suspect',
  VEHICLE: 'vehicle',
  GAP: 'gap',
  JUMP: 'jump',
})

// The segment recorded between the last point before a pause (useRunTracker
// .js's pause()) and the first point after resume() - always an excluded
// JUMP, regardless of the implied distance/speed, unlike every other
// segment above (which addGpsPoint classifies from the evidence). A pause
// is a deliberate stop, not GPS noise or a real sustained-speed violation,
// so there's no "maybe it's cheating" case to weigh here - it never counts
// toward distance, and feeding the detector itself a fresh instance after
// resume() (see createVehicleDetector there) means nothing before this gap
// carries forward as evidence either.
export function buildPauseResumeJumpSegment(previousPoint, resumedPoint) {
  return {
    fromTimestamp: previousPoint.timestamp,
    toTimestamp: resumedPoint.timestamp,
    distanceMeters: haversineDistance(previousPoint, resumedPoint),
    kind: SegmentKind.JUMP,
    excluded: true,
  }
}

// Why the current state/segment is what it is - drives the banner copy in
// TrackRunPanel.jsx/GamePage.jsx. Null when there's nothing to explain.
export const EvidenceReason = Object.freeze({
  SPEED: 'speed',
  NO_GAIT: 'no-gait',
  PATTERN: 'pattern',
})

// Speed reported by the device is only a cross-check, and only when valid:
// null/NaN/negative (iOS reports -1 for "unknown") is ignored.
export function validDeviceSpeed(speedMps) {
  return typeof speedMps === 'number' &&
    Number.isFinite(speedMps) &&
    speedMps >= 0
    ? speedMps
    : null
}

// Creates a fresh detector for one run. `hasMotionSensing` should reflect
// whether step/cadence data will ever arrive this run (false if DeviceMotion
// is unsupported or the iOS permission prompt was denied); without it the
// speed rules alone decide. `accessibilityMode` raises every speed ceiling
// and skips the cadence requirement entirely (wheelchair/hand-cycle
// athletes never show a running footstrike).
export function createVehicleDetector({
  hasMotionSensing = true,
  accessibilityMode = false,
} = {}) {
  let motionAvailable = hasMotionSensing
  let state = VehicleState.RUNNING
  let startedAtMs = null
  let lastPoint = null // last accepted fix {lat, lng, timestamp}
  // A fix that implied > MAX_PLAUSIBLE_SPEED_MS from lastPoint, held back
  // until the next fix says whether it was a GPS spike or real fast movement.
  let suspectJump = null
  // Set once a very fast stretch was confirmed (motorway speeds); hops above
  // MAX_PLAUSIBLE_SPEED_MS are then taken at face value, not held back,
  // until an ordinary-speed interval ends the regime.
  let inFastRegime = false
  // Accepted segments, newest last:
  // {t, speedMps, distanceMeters, dtSeconds, counted}
  const samples = []
  const stepTimestamps = []
  let motionBaseline = 9.81
  let lastStepAtMs = 0
  let lastMotionAtMs = null
  let firstMotionAtMs = null
  // Mean-square wobble of the accelerometer around its baseline (see
  // GAIT_ENERGY_RMS_MPS2): body motion without clean step peaks.
  let motionEnergy = 0
  let noGaitSinceMs = null

  let suspectSinceMs = null
  let vehicleSinceMs = null
  let cleanSinceMs = null
  // Vehicle time already spent in this/earlier warning episodes, and when
  // the current episode started (null outside VEHICLE).
  let warnedMs = 0
  let episodeStartMs = null
  let lastVehicleMs = null

  let lastSnapshot = {
    state,
    speedMps: 0,
    avgSpeedMps: 0,
    cadenceHz: 0,
    reason: null,
    warningSecondsLeft: null,
  }

  const ceiling = (base) =>
    accessibilityMode ? base * ACCESSIBILITY_SPEED_MULTIPLIER : base

  function pruneSamples(nowMs) {
    const cutoff = nowMs - FAST_PACE_WINDOW_SECONDS * 1000
    while (samples.length && samples[0].t < cutoff) samples.shift()
  }

  function windowStats(nowMs, seconds) {
    const cutoff = nowMs - seconds * 1000
    let distance = 0
    let time = 0
    for (const sample of samples) {
      if (sample.t < cutoff) continue
      distance += sample.evidenceMeters
      time += sample.dtSeconds
    }
    return { time, avg: time > 0 ? distance / time : 0 }
  }

  function cadenceHzAt(nowMs) {
    const cutoff = nowMs - CADENCE_WINDOW_SECONDS * 1000
    while (stepTimestamps.length && stepTimestamps[0] < cutoff)
      stepTimestamps.shift()
    return stepTimestamps.length / CADENCE_WINDOW_SECONDS
  }

  // Is a running gait something we can actually judge right now? Not when
  // the sensor is missing/denied, in accessibility mode, or when it has
  // gone quiet (a locked screen can throttle DeviceMotion to nothing - a
  // runner must not be convicted for that).
  function gaitJudgeable(nowMs) {
    if (!motionAvailable || accessibilityMode) return false
    // A sensor that never reported (denied, unsupported, prompt unanswered)
    // is "unknown", not "no footsteps": the speed rules alone decide.
    if (lastMotionAtMs == null) return false
    return nowMs - lastMotionAtMs <= NO_MOTION_TIMEOUT_SECONDS * 1000
  }

  function setMotionAvailable(available) {
    motionAvailable = available
  }

  // Peak-detection on accelerometer magnitude - a running gait has a clear
  // rhythmic footstrike a smooth vehicle ride doesn't. Returns whether this
  // sample counted as a new step.
  function handleMotionSample(magnitude, nowMs) {
    lastMotionAtMs = nowMs
    firstMotionAtMs ??= nowMs
    motionBaseline += (magnitude - motionBaseline) * 0.05
    const deviation = Math.abs(magnitude - motionBaseline)
    motionEnergy += (deviation * deviation - motionEnergy) * 0.005
    if (
      deviation > STEP_ACCEL_DEVIATION_MPS2 &&
      nowMs - lastStepAtMs > STEP_MIN_INTERVAL_MS
    ) {
      lastStepAtMs = nowMs
      stepTimestamps.push(nowMs)
      return true
    }
    return false
  }

  // Direct step injection for tests/simulated traces.
  function recordStep(nowMs) {
    lastMotionAtMs = nowMs
    firstMotionAtMs ??= nowMs
    lastStepAtMs = nowMs
    stepTimestamps.push(nowMs)
  }

  function warningSecondsLeft(nowMs) {
    if (state !== VehicleState.VEHICLE || episodeStartMs == null) return null
    const spent = warnedMs + (nowMs - episodeStartMs)
    return Math.max(0, Math.ceil(VEHICLE_WARNING_SECONDS - spent / 1000))
  }

  function snapshot(segment, extra = {}, nowMs = null) {
    lastSnapshot = {
      state,
      speedMps: segment?.speedMps ?? lastSnapshot.speedMps,
      avgSpeedMps: segment?.avgSpeedMps ?? lastSnapshot.avgSpeedMps,
      cadenceHz: segment?.cadenceHz ?? lastSnapshot.cadenceHz,
      reason:
        segment?.reason ??
        (state === VehicleState.RUNNING ? null : lastSnapshot.reason),
      warningSecondsLeft: nowMs != null ? warningSecondsLeft(nowMs) : null,
    }
    return { state, segment, reclaimMeters: 0, ...lastSnapshot, ...extra }
  }

  // Feed one accepted GPS fix. Returns { state, segment, reclaimMeters,
  // speedMps, avgSpeedMps, cadenceHz, reason, warningSecondsLeft }.
  // `segment` is null when this fix produced no measurable segment, otherwise
  // { kind, distanceMeters, excluded, ... }. `reclaimMeters` > 0 on the fix
  // that tips into VEHICLE: distance the caller already counted from the
  // vehicle stretch that the window needed time to recognise.
  function addGpsPoint({ lat, lng, timestamp, accuracy, speedMps }) {
    if (accuracy != null && accuracy > ACCURACY_LIMIT_METERS) {
      return snapshot(null, {}, timestamp)
    }
    if (state === VehicleState.DISCARDED) return snapshot(null, {}, timestamp)
    if (startedAtMs == null) startedAtMs = timestamp
    const sinceStartMs = timestamp - startedAtMs
    const previous = lastPoint
    if (!previous) {
      lastPoint = { lat, lng, timestamp, accuracy }
      return snapshot(null, {}, timestamp)
    }

    const dtSeconds = (timestamp - previous.timestamp) / 1000
    if (dtSeconds <= 0) return snapshot(null, {}, timestamp)

    let distanceMeters = haversineDistance(previous, { lat, lng })
    let impliedSpeedMps = distanceMeters / dtSeconds

    if (dtSeconds > GAP_SECONDS) {
      // Tunnel/signal drop - the implied speed across the gap is no evidence
      // either way, and whatever hysteresis was building stays frozen.
      lastPoint = { lat, lng, timestamp, accuracy }
      suspectJump = null
      return snapshot(
        {
          kind: SegmentKind.GAP,
          distanceMeters,
          excluded: false,
          speedMps: impliedSpeedMps,
        },
        {},
        timestamp
      )
    }

    let confirmedFast = false
    if (impliedSpeedMps > MAX_PLAUSIBLE_SPEED_MS && inFastRegime) {
      // Already established as a motorway-speed stretch: real movement.
    } else if (impliedSpeedMps > MAX_PLAUSIBLE_SPEED_MS) {
      if (!suspectJump) {
        // First impossible hop: hold it back. If the next fix is back on
        // the path it was a spike; if the next fix keeps going, it was real.
        suspectJump = { lat, lng, timestamp, accuracy }
        return snapshot(
          {
            kind: SegmentKind.JUMP,
            distanceMeters,
            excluded: true,
            speedMps: impliedSpeedMps,
          },
          {},
          timestamp
        )
      }
      // Still impossible from the anchor after a second fix: the
      // movement is real (a motorway at 30+ m/s, or a one-way teleport).
      // Continue from the held-back fix; the hop into it stays excluded.
      confirmedFast = true
      inFastRegime = true
      const held = suspectJump
      suspectJump = null
      lastPoint = {
        lat: held.lat,
        lng: held.lng,
        timestamp: held.timestamp,
        accuracy: held.accuracy,
      }
      const heldDt = (timestamp - held.timestamp) / 1000
      if (heldDt <= 0) return snapshot(null, {}, timestamp)
      distanceMeters = haversineDistance(lastPoint, { lat, lng })
      impliedSpeedMps = distanceMeters / heldDt
    } else {
      suspectJump = null // it was a spike; this fix is back on the path
      inFastRegime = false
    }
    const segDt = confirmedFast
      ? (timestamp - lastPoint.timestamp) / 1000
      : dtSeconds
    const prevAccuracy = lastPoint.accuracy
    lastPoint = { lat, lng, timestamp, accuracy }

    // The device's own speed is a cross-check, only when valid (iOS gives
    // -1, some browsers null). When it disagrees wildly with the distance
    // between fixes, trust the lower of the two (a jittery fix inflates the
    // computed one; a stale chip value inflates the other).
    const deviceSpeed = validDeviceSpeed(speedMps)
    const sampleSpeedMps =
      deviceSpeed != null
        ? Math.min(
            impliedSpeedMps,
            Math.max(deviceSpeed, impliedSpeedMps * 0.5)
          )
        : impliedSpeedMps
    // Never let one hop weigh more than a very fast vehicle would cover.
    const cappedDistance = Math.min(distanceMeters, 60 * segDt)
    // Speed EVIDENCE for the windows. Fixes at GOOD_ACCURACY_METERS or better
    // count exactly as measured. With imprecise fixes part of the hop is GPS
    // wobble, so half of each fix's accuracy beyond that is discounted, and
    // a valid chip (Doppler) speed - which jitter cannot inflate - caps the
    // estimate at DOPPLER_TOLERANCE_MS above itself. A real vehicle still
    // shows up in the chip's own speed.
    const allowance =
      0.5 *
      (Math.max(0, (prevAccuracy ?? 0) - GOOD_ACCURACY_METERS) +
        Math.max(0, (accuracy ?? 0) - GOOD_ACCURACY_METERS))
    let evidenceMeters = cappedDistance
    if (allowance > 0 && segDt > 0) {
      const adjustedImplied = Math.max(0, distanceMeters - allowance) / segDt
      const evidenceSpeed =
        deviceSpeed != null
          ? Math.min(adjustedImplied, deviceSpeed + DOPPLER_TOLERANCE_MS)
          : adjustedImplied
      evidenceMeters = Math.min(evidenceSpeed * segDt, cappedDistance)
    }
    const sample = {
      t: timestamp,
      speedMps: sampleSpeedMps,
      distanceMeters: cappedDistance,
      evidenceMeters,
      dtSeconds: segDt,
      counted: false,
    }
    samples.push(sample)
    pruneSamples(timestamp)

    const baseSegment = {
      distanceMeters,
      speedMps: sampleSpeedMps,
    }
    if (sinceStartMs < SKIP_INITIAL_SECONDS * 1000) {
      sample.counted = true
      return snapshot(
        { kind: SegmentKind.RUNNING, excluded: false, ...baseSegment },
        {},
        timestamp
      )
    }

    const win = windowStats(timestamp, WINDOW_SECONDS)
    const longWin = windowStats(timestamp, FAST_PACE_WINDOW_SECONDS)
    const recent = windowStats(timestamp, RESUME_WINDOW_SECONDS)
    const windowCovered = win.time >= MIN_WINDOW_COVERAGE_SECONDS
    const longCovered = longWin.time >= FAST_PACE_WINDOW_SECONDS * 0.75
    const cadenceHz = cadenceHzAt(timestamp)
    const judgeGait = gaitJudgeable(timestamp)

    // Fast, with no footstrike and no body wobble at all, for a sustained
    // stretch, is decisive on its own.
    const gaitEnergyRms = Math.sqrt(motionEnergy)
    const noGaitNow =
      judgeGait &&
      windowCovered &&
      win.avg > BRISK_SPEED_MS &&
      cadenceHz < MIN_CADENCE_HZ &&
      gaitEnergyRms < GAIT_ENERGY_RMS_MPS2
    noGaitSinceMs = noGaitNow ? (noGaitSinceMs ?? timestamp) : null
    const noGait =
      noGaitNow && timestamp - noGaitSinceMs >= NO_GAIT_SUSTAIN_SECONDS * 1000
    const speedVehicle = windowCovered && win.avg > ceiling(VEHICLE_SPEED_MS)
    const paceVehicle = longCovered && longWin.avg > ceiling(FAST_PACE_SPEED_MS)
    const vehicleEvidence = speedVehicle || paceVehicle || noGait
    const bikeSuspect =
      !accessibilityMode &&
      longWin.time >= BIKE_SUSTAIN_SECONDS * 0.75 &&
      longWin.avg > ceiling(BIKE_SPEED_MS)
    const suspectEvidence = vehicleEvidence || bikeSuspect

    const reason = noGait
      ? EvidenceReason.NO_GAIT
      : speedVehicle || paceVehicle || bikeSuspect
        ? EvidenceReason.SPEED
        : null

    // Clear evidence: back at running speed over the recent window, and (if
    // it can be judged) with footsteps again.
    const recentCovered = recent.time >= RESUME_WINDOW_SECONDS * 0.6
    const validRunningNow =
      recentCovered &&
      recent.avg <= ceiling(BIKE_SPEED_MS) &&
      (!judgeGait || cadenceHz >= MIN_CADENCE_HZ || recent.avg < BRISK_SPEED_MS)

    vehicleSinceMs = vehicleEvidence ? (vehicleSinceMs ?? timestamp) : null
    suspectSinceMs = suspectEvidence ? (suspectSinceMs ?? timestamp) : null
    cleanSinceMs = validRunningNow ? (cleanSinceMs ?? timestamp) : null

    let reclaimMeters = 0
    const wasState = state

    if (state === VehicleState.RUNNING || state === VehicleState.SUSPECT) {
      // Vehicle time is forgotten after a long stretch without any.
      if (
        lastVehicleMs != null &&
        timestamp - lastVehicleMs > WARNING_MEMORY_SECONDS * 1000
      ) {
        warnedMs = 0
        lastVehicleMs = null
      }
      if (
        vehicleSinceMs != null &&
        timestamp - vehicleSinceMs >= VEHICLE_SUSTAIN_SECONDS * 1000
      ) {
        state = VehicleState.VEHICLE
        episodeStartMs = timestamp
        // Take back what the window needed time to recognise.
        reclaimMeters = samples
          .filter(
            (x) =>
              x.counted &&
              x.t >= timestamp - WINDOW_SECONDS * 1000 &&
              x.speedMps > ceiling(BIKE_SPEED_MS)
          )
          .reduce((sum, x) => sum + x.distanceMeters, 0)
      } else if (
        state === VehicleState.RUNNING &&
        suspectSinceMs != null &&
        timestamp - suspectSinceMs >= SUSPECT_SUSTAIN_SECONDS * 1000
      ) {
        state = VehicleState.SUSPECT
      } else if (state === VehicleState.SUSPECT && suspectSinceMs == null) {
        state = VehicleState.RUNNING
      }
    } else if (state === VehicleState.VEHICLE) {
      lastVehicleMs = timestamp
      const spentMs = warnedMs + (timestamp - episodeStartMs)
      if (
        cleanSinceMs != null &&
        timestamp - cleanSinceMs >= RESUME_SECONDS * 1000
      ) {
        // Back to running speed: counting resumes (the vehicle stretch
        // stays excluded). The time already spent is remembered.
        warnedMs = spentMs
        episodeStartMs = null
        state = VehicleState.RUNNING
        // Judge from here on only: the vehicle stretch must not keep
        // convicting the (now running) player through the long windows.
        samples.length = 0
        vehicleSinceMs = null
        suspectSinceMs = null
        cleanSinceMs = null
      } else if (spentMs >= VEHICLE_WARNING_SECONDS * 1000) {
        state = VehicleState.DISCARDED
      }
    }

    const excluded =
      state === VehicleState.VEHICLE || state === VehicleState.DISCARDED
    sample.counted = !excluded
    const kind =
      state === VehicleState.DISCARDED || state === VehicleState.VEHICLE
        ? SegmentKind.VEHICLE
        : state === VehicleState.SUSPECT
          ? SegmentKind.SUSPECT
          : SegmentKind.RUNNING

    return snapshot(
      {
        kind,
        excluded,
        avgSpeedMps: win.avg,
        cadenceHz,
        reason,
        ...baseSegment,
      },
      {
        reclaimMeters,
        enteredVehicle:
          wasState !== VehicleState.VEHICLE && state === VehicleState.VEHICLE,
      },
      timestamp
    )
  }

  // The "I'm not in a vehicle" button: clears a SUSPECT banner only. It can
  // no longer stop the VEHICLE warning - speed alone decides that - but the
  // tap is still logged by the caller for moderator review.
  function dispute() {
    if (state === VehicleState.SUSPECT) {
      state = VehicleState.RUNNING
      suspectSinceMs = null
    }
  }

  function reset() {
    motionAvailable = hasMotionSensing
    state = VehicleState.RUNNING
    startedAtMs = null
    lastPoint = null
    suspectJump = null
    inFastRegime = false
    samples.length = 0
    stepTimestamps.length = 0
    motionBaseline = 9.81
    lastStepAtMs = 0
    lastMotionAtMs = null
    firstMotionAtMs = null
    motionEnergy = 0
    noGaitSinceMs = null
    suspectSinceMs = null
    vehicleSinceMs = null
    cleanSinceMs = null
    warnedMs = 0
    episodeStartMs = null
    lastVehicleMs = null
    lastSnapshot = {
      state,
      speedMps: 0,
      avgSpeedMps: 0,
      cadenceHz: 0,
      reason: null,
      warningSecondsLeft: null,
    }
  }

  // Seconds since the last footstep, for the distance filter's "no steps and
  // slow = standing still" check. null when that cannot be judged (no sensor,
  // denied, silent, accessibility mode): the check is then skipped, never a
  // failure.
  function secondsSinceStep(nowMs) {
    if (!gaitJudgeable(nowMs) || firstMotionAtMs == null) return null
    // Body motion without clean step peaks (armband, pocket): the missing
    // steps say nothing about standing still.
    if (Math.sqrt(motionEnergy) >= GAIT_ENERGY_RMS_MPS2) return null
    return (nowMs - Math.max(lastStepAtMs, firstMotionAtMs)) / 1000
  }

  return {
    addGpsPoint,
    secondsSinceStep,
    handleMotionSample,
    recordStep,
    setMotionAvailable,
    dispute,
    reset,
    getState: () => state,
    getDebugInfo: () => ({ ...lastSnapshot }),
  }
}

// Merges a flat per-fix segment list into runs of consecutive same-kind
// segments - keeps the payload sent with the run compact (a long run can
// have 1000+ fixes) without losing per-stretch granularity.
export function compressSegments(segments) {
  const merged = []
  for (const segment of segments) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.kind === segment.kind &&
      last.excluded === segment.excluded
    ) {
      last.toTimestamp = segment.toTimestamp
      last.distanceMeters += segment.distanceMeters
    } else {
      merged.push({ ...segment })
    }
  }
  return merged
}
