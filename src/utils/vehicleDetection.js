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
  ACCURACY_LIMIT_METERS,
  BRISK_SPEED_MS,
  CADENCE_WINDOW_SECONDS,
  CLEAR_SUSTAIN_SECONDS,
  CONSTANT_SPEED_VARIANCE_THRESHOLD,
  GAP_SECONDS,
  MAX_PLAUSIBLE_SPEED_MS,
  MIN_CADENCE_HZ,
  RESUME_SECONDS,
  SKIP_INITIAL_SECONDS,
  STEP_ACCEL_DEVIATION_MPS2,
  STEP_MIN_INTERVAL_MS,
  SUSPECT_SPEED_FALLBACK_MS,
  SUSPECT_SPEED_MS,
  SUSPECT_SUSTAIN_SECONDS,
  VEHICLE_SPEED_MS,
  VEHICLE_SUSTAIN_SECONDS,
  WINDOW_SECONDS,
  ACCESSIBILITY_SPEED_MULTIPLIER,
} from '../constants/antiCheat'

export const VehicleState = Object.freeze({
  RUNNING: 'running',
  SUSPECT: 'suspect',
  VEHICLE: 'vehicle',
})

export const SegmentKind = Object.freeze({
  RUNNING: 'running',
  SUSPECT: 'suspect',
  VEHICLE: 'vehicle',
  GAP: 'gap',
  JUMP: 'jump',
})

// Why the current state/segment is what it is - drives the banner copy in
// TrackRunPanel.jsx/GamePage.jsx. Null when there's nothing to explain.
export const EvidenceReason = Object.freeze({
  SPEED: 'speed',
  NO_GAIT: 'no-gait',
  PATTERN: 'pattern',
})

// Creates a fresh detector for one run. `hasMotionSensing` should reflect
// whether step/cadence data will ever arrive this run (false if DeviceMotion
// is unsupported or the iOS permission prompt was denied) - without it,
// speed alone has to clear a higher bar before counting as evidence.
// `accessibilityMode` raises every speed ceiling and skips the cadence
// requirement entirely (wheelchair/hand-cycle athletes never show a running
// footstrike).
export function createVehicleDetector({
  hasMotionSensing = true,
  accessibilityMode = false,
} = {}) {
  let motionAvailable = hasMotionSensing
  let state = VehicleState.RUNNING
  let startedAtMs = null
  let lastPoint = null
  // Rolling window of accepted (non-jump, non-gap) segments: {t, speedMps, distanceMeters, dtSeconds}
  const speedSamples = []
  const stepTimestamps = []
  let motionBaseline = 9.81
  let lastStepAtMs = 0

  let suspectEvidenceSinceMs = null
  let vehicleEvidenceSinceMs = null
  // Consecutive time with neither suspect nor vehicle evidence - used both to
  // drop SUSPECT back to RUNNING and (combined with a cadence check) to
  // resume from VEHICLE.
  let cleanEvidenceSinceMs = null

  let lastSnapshot = {
    state,
    speedMps: 0,
    avgSpeedMps: 0,
    cadenceHz: 0,
    reason: null,
  }

  function speedCeiling(base) {
    return accessibilityMode ? base * ACCESSIBILITY_SPEED_MULTIPLIER : base
  }

  function pruneSpeedWindow(nowMs, windowMs) {
    const cutoff = nowMs - windowMs
    while (speedSamples.length && speedSamples[0].t < cutoff)
      speedSamples.shift()
  }

  function cadenceHzAt(nowMs) {
    const cutoff = nowMs - CADENCE_WINDOW_SECONDS * 1000
    while (stepTimestamps.length && stepTimestamps[0] < cutoff)
      stepTimestamps.shift()
    return stepTimestamps.length / CADENCE_WINDOW_SECONDS
  }

  function setMotionAvailable(available) {
    motionAvailable = available
  }

  // Peak-detection on accelerometer magnitude - a running gait has a clear
  // rhythmic footstrike a smooth vehicle ride doesn't. Returns whether this
  // sample counted as a new step, so the caller can keep its own run-total
  // step count (this module only keeps a trailing cadence window).
  function handleMotionSample(magnitude, nowMs) {
    motionBaseline += (magnitude - motionBaseline) * 0.05
    const deviation = Math.abs(magnitude - motionBaseline)
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

  // Direct step injection for tests/simulated traces - bypasses the
  // accelerometer magnitude math above.
  function recordStep(nowMs) {
    lastStepAtMs = nowMs
    stepTimestamps.push(nowMs)
  }

  function snapshot(segment) {
    lastSnapshot = {
      state,
      speedMps: segment?.speedMps ?? lastSnapshot.speedMps,
      avgSpeedMps: segment?.avgSpeedMps ?? lastSnapshot.avgSpeedMps,
      cadenceHz: segment?.cadenceHz ?? lastSnapshot.cadenceHz,
      reason:
        segment?.reason ??
        (state === VehicleState.RUNNING ? null : lastSnapshot.reason),
    }
    return { state, segment, ...lastSnapshot }
  }

  // Feed one accepted GPS fix. Returns { state, segment, speedMps, avgSpeedMps,
  // cadenceHz, reason } - `segment` is null when this fix didn't produce a
  // measurable segment (first fix, or this fix was dropped for poor
  // accuracy), otherwise { kind, distanceMeters, excluded }.
  function addGpsPoint({ lat, lng, timestamp, accuracy, speedMps }) {
    if (accuracy != null && accuracy > ACCURACY_LIMIT_METERS) {
      return snapshot(null)
    }
    if (startedAtMs == null) startedAtMs = timestamp
    const sinceStartMs = timestamp - startedAtMs
    const previous = lastPoint
    lastPoint = { lat, lng, timestamp }
    if (!previous) return snapshot(null)

    const dtSeconds = (timestamp - previous.timestamp) / 1000
    if (dtSeconds <= 0) return snapshot(null)

    const distanceMeters = haversineDistance(previous, { lat, lng })
    const impliedSpeedMps = distanceMeters / dtSeconds

    if (dtSeconds > GAP_SECONDS) {
      // Tunnel/signal drop - don't let the implied speed across the gap count
      // as evidence either way. Whatever hysteresis was already building
      // stays frozen rather than reset, so a cheat caught right before a dead
      // zone doesn't get a free pass.
      return snapshot({
        kind: SegmentKind.GAP,
        distanceMeters,
        excluded: false,
        speedMps: impliedSpeedMps,
      })
    }
    if (impliedSpeedMps > MAX_PLAUSIBLE_SPEED_MS) {
      // A single-fix teleport - noise, not movement in either direction.
      return snapshot({
        kind: SegmentKind.JUMP,
        distanceMeters,
        excluded: true,
        speedMps: impliedSpeedMps,
      })
    }

    // Blend the device's own reported speed (when available) with the
    // computed distance/time speed, rather than trusting either alone.
    const sampleSpeedMps =
      speedMps != null ? (speedMps + impliedSpeedMps) / 2 : impliedSpeedMps
    speedSamples.push({
      t: timestamp,
      speedMps: sampleSpeedMps,
      distanceMeters,
      dtSeconds,
    })
    pruneSpeedWindow(timestamp, WINDOW_SECONDS * 1000)

    if (sinceStartMs < SKIP_INITIAL_SECONDS * 1000) {
      return snapshot({
        kind: SegmentKind.RUNNING,
        distanceMeters,
        excluded: false,
        speedMps: sampleSpeedMps,
      })
    }

    const windowDistance = speedSamples.reduce(
      (sum, s) => sum + s.distanceMeters,
      0
    )
    const windowTime = speedSamples.reduce((sum, s) => sum + s.dtSeconds, 0)
    const avgSpeedMps =
      windowTime > 0 ? windowDistance / windowTime : sampleSpeedMps

    const cadenceHz = cadenceHzAt(timestamp)
    const hasGait = motionAvailable && !accessibilityMode
    // Complete absence of footstrike at a brisk-or-faster pace is decisive on
    // its own (spec: "speed that's high or moderate while there are no steps
    // = vehicle or bike") - it doesn't need to also clear the full suspect
    // speed ceiling below.
    const noGait =
      hasGait && avgSpeedMps > BRISK_SPEED_MS && cadenceHz < MIN_CADENCE_HZ

    // Only evaluated with real gait data - in accessibility mode a hand-cycle
    // or wheelchair's naturally steady pace on a flat stretch would otherwise
    // read as "suspiciously" constant for no good reason; that mode already
    // relies on speed-only evidence at a raised ceiling instead.
    const mean = avgSpeedMps
    const variance =
      speedSamples.length > 1
        ? speedSamples.reduce((sum, s) => sum + (s.speedMps - mean) ** 2, 0) /
          speedSamples.length
        : 0
    const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 1
    const suspiciouslyConstant =
      !accessibilityMode &&
      speedSamples.length >= 4 &&
      mean > SUSPECT_SPEED_MS * 0.7 &&
      coefficientOfVariation < CONSTANT_SPEED_VARIANCE_THRESHOLD

    const suspectCeiling = speedCeiling(
      hasGait ? SUSPECT_SPEED_MS : SUSPECT_SPEED_FALLBACK_MS
    )
    const vehicleCeiling = speedCeiling(VEHICLE_SPEED_MS)

    const speedTooHighForSuspect = avgSpeedMps > suspectCeiling
    const suspectEvidence =
      speedTooHighForSuspect || suspiciouslyConstant || noGait
    const vehicleEvidence = avgSpeedMps > vehicleCeiling || noGait

    const reason = noGait
      ? EvidenceReason.NO_GAIT
      : speedTooHighForSuspect
        ? EvidenceReason.SPEED
        : suspiciouslyConstant
          ? EvidenceReason.PATTERN
          : null

    // --- Hysteresis bookkeeping ---
    vehicleEvidenceSinceMs = vehicleEvidence
      ? (vehicleEvidenceSinceMs ?? timestamp)
      : null
    if (suspectEvidence) {
      suspectEvidenceSinceMs = suspectEvidenceSinceMs ?? timestamp
      cleanEvidenceSinceMs = null
    } else {
      suspectEvidenceSinceMs = null
      cleanEvidenceSinceMs = cleanEvidenceSinceMs ?? timestamp
    }

    // --- State transitions ---
    if (state === VehicleState.RUNNING) {
      if (
        vehicleEvidenceSinceMs != null &&
        timestamp - vehicleEvidenceSinceMs >= VEHICLE_SUSTAIN_SECONDS * 1000
      ) {
        state = VehicleState.VEHICLE
      } else if (
        suspectEvidenceSinceMs != null &&
        timestamp - suspectEvidenceSinceMs >= SUSPECT_SUSTAIN_SECONDS * 1000
      ) {
        state = VehicleState.SUSPECT
      }
    } else if (state === VehicleState.SUSPECT) {
      if (
        vehicleEvidenceSinceMs != null &&
        timestamp - vehicleEvidenceSinceMs >= VEHICLE_SUSTAIN_SECONDS * 1000
      ) {
        state = VehicleState.VEHICLE
      } else if (
        cleanEvidenceSinceMs != null &&
        timestamp - cleanEvidenceSinceMs >= CLEAR_SUSTAIN_SECONDS * 1000
      ) {
        state = VehicleState.RUNNING
      }
    } else if (state === VehicleState.VEHICLE) {
      const validRunningNow =
        !suspectEvidence &&
        !vehicleEvidence &&
        (!hasGait || cadenceHz >= MIN_CADENCE_HZ)
      if (!validRunningNow) {
        cleanEvidenceSinceMs = null
      } else if (
        cleanEvidenceSinceMs != null &&
        timestamp - cleanEvidenceSinceMs >= RESUME_SECONDS * 1000
      ) {
        state = VehicleState.RUNNING
      }
    }

    const excluded = state === VehicleState.VEHICLE
    const kind =
      state === VehicleState.VEHICLE
        ? SegmentKind.VEHICLE
        : state === VehicleState.SUSPECT
          ? SegmentKind.SUSPECT
          : SegmentKind.RUNNING

    return snapshot({
      kind,
      distanceMeters,
      excluded,
      speedMps: sampleSpeedMps,
      avgSpeedMps,
      cadenceHz,
      reason,
    })
  }

  // Manual override from the "I'm not in a vehicle" dispute button - trusts
  // the athlete just enough to stop blocking them immediately, but never
  // erases segments already recorded as vehicle-excluded (the backend
  // re-validates independently regardless of anything disputed here). If
  // they really are in a car, sustained evidence trips the state machine
  // again within VEHICLE_SUSTAIN_SECONDS.
  function dispute() {
    state = VehicleState.RUNNING
    suspectEvidenceSinceMs = null
    vehicleEvidenceSinceMs = null
    cleanEvidenceSinceMs = null
  }

  function reset() {
    motionAvailable = hasMotionSensing
    state = VehicleState.RUNNING
    startedAtMs = null
    lastPoint = null
    speedSamples.length = 0
    stepTimestamps.length = 0
    motionBaseline = 9.81
    lastStepAtMs = 0
    suspectEvidenceSinceMs = null
    vehicleEvidenceSinceMs = null
    cleanEvidenceSinceMs = null
    lastSnapshot = {
      state,
      speedMps: 0,
      avgSpeedMps: 0,
      cadenceHz: 0,
      reason: null,
    }
  }

  return {
    addGpsPoint,
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
