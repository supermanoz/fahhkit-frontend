// Indoor (treadmill) Training: the pure rules - timer maths, the distance
// estimate and the plausibility checks. No React, no storage, no sensors.
//
// An indoor run is a Training run with NO GPS points. The distance comes from
// the pedometer (iOS distance, or steps x stride) as a PREFILL, and the player
// edits it to match the treadmill display. The server cannot verify it (no
// trace), so everything checked here is also a friendly pre-filter - the
// real caps belong on the backend (docs/indoor-training-backend-ask.md).

import { stepsLookCarried } from './stepsSource'

export const DEFAULT_STRIDE_M = 0.75
export const MIN_STRIDE_M = 0.4
export const MAX_STRIDE_M = 1.6
export const MIN_PACE_MIN_PER_KM = 2.5 // 2:30 /km
export const MAX_PACE_MIN_PER_KM = 20 // 20:00 /km
export const MAX_INDOOR_DURATION_SECONDS = 4 * 60 * 60
export const MIN_INDOOR_DISTANCE_METERS = 100
export const MIN_INDOOR_DURATION_SECONDS = 30

export const INDOOR_ERROR = Object.freeze({
  TOO_SHORT: 'too_short',
  TOO_LONG: 'too_long',
  NO_DISTANCE: 'no_distance',
  TOO_LITTLE_DISTANCE: 'too_little_distance',
  TOO_FAST: 'too_fast',
  TOO_SLOW: 'too_slow',
  STRIDE: 'stride',
})

// Stride (m) from height (cm) when known (~0.43 x height: 0.75 m at 1.75 m),
// else the 0.75 m default. Clamped to the believable band.
export function strideFromHeight(heightCm) {
  const h = Number(heightCm)
  if (!Number.isFinite(h) || h < 100 || h > 230) return DEFAULT_STRIDE_M
  return Math.min(MAX_STRIDE_M, Math.max(MIN_STRIDE_M, (h / 100) * 0.43))
}

// Epoch-based: nothing here counts ticks, so a backgrounded or killed app
// still reads the right time on return. `pausedMs` = total finished pauses,
// `pausedAtMs` = the pause that is open right now (or null).
export function indoorElapsedSeconds(
  { startedAtMs, pausedMs = 0, pausedAtMs = null, endedAtMs = null },
  nowMs
) {
  if (!Number.isFinite(startedAtMs)) return 0
  const end = pausedAtMs ?? endedAtMs ?? nowMs
  return Math.max(0, Math.floor((end - startedAtMs - pausedMs) / 1000))
}

// Prefill for the confirm screen / live estimate. Returns { meters, source }
// or null when there is nothing to estimate from (no steps, no distance).
export function estimateIndoorDistance({
  steps,
  pedometerMeters,
  strideM = DEFAULT_STRIDE_M,
}) {
  const p = Number(pedometerMeters)
  if (Number.isFinite(p) && p > 0) {
    return { meters: p, source: 'pedometer' }
  }
  const s = Number(steps)
  if (Number.isFinite(s) && s > 0) {
    return { meters: s * strideM, source: 'steps' }
  }
  return null
}

// "5", "5.2", "5,2", "5.2 km" -> metres; null when it is not a number > 0.
export function parseKmInput(text) {
  const cleaned = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/km$/, '')
    .trim()
    .replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const km = Number(cleaned)
  return Number.isFinite(km) && km > 0 ? Math.round(km * 1000) : null
}

export const formatKmInput = (meters) =>
  Number.isFinite(meters) && meters > 0 ? (meters / 1000).toFixed(2) : ''

const fmtPace = (minPerKm) => {
  const total = Math.round(minPerKm * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// -> { ok, errors: [{ code, message }], paceMinPerKm, strideM, stepsUsed }
// `stepsUsed` is the count the run may report (null when the phone was not
// carried - see stepsLookCarried - so a console-mounted phone never blocks
// the run and never sends a meaningless count).
export function validateIndoorRun({ distanceMeters, durationSeconds, steps }) {
  const errors = []
  const add = (code, message) => errors.push({ code, message })
  const dur = Number(durationSeconds)
  const dist = Number(distanceMeters)

  if (!(dur >= MIN_INDOOR_DURATION_SECONDS)) {
    add(
      INDOOR_ERROR.TOO_SHORT,
      `Only ${Math.max(0, Math.round(dur) || 0)}s on the clock - runs need at least ${MIN_INDOOR_DURATION_SECONDS}s to count.`
    )
  } else if (dur > MAX_INDOOR_DURATION_SECONDS) {
    add(
      INDOOR_ERROR.TOO_LONG,
      `That is longer than ${MAX_INDOOR_DURATION_SECONDS / 3600} hours. Indoor runs can be at most ${MAX_INDOOR_DURATION_SECONDS / 3600} hours - discard it and start a new one.`
    )
  }

  let paceMinPerKm = null
  if (!Number.isFinite(dist) || dist <= 0) {
    add(
      INDOOR_ERROR.NO_DISTANCE,
      'Enter the distance shown on the treadmill (km).'
    )
  } else if (dist < MIN_INDOOR_DISTANCE_METERS) {
    add(
      INDOOR_ERROR.TOO_LITTLE_DISTANCE,
      `Only ${(dist / 1000).toFixed(2)} km - runs need at least ${(MIN_INDOOR_DISTANCE_METERS / 1000).toFixed(1)} km to count.`
    )
  } else if (dur > 0) {
    paceMinPerKm = dur / 60 / (dist / 1000)
    if (paceMinPerKm < MIN_PACE_MIN_PER_KM) {
      add(
        INDOOR_ERROR.TOO_FAST,
        `${fmtPace(paceMinPerKm)} /km is faster than the ${fmtPace(MIN_PACE_MIN_PER_KM)} /km limit. Check the distance against the treadmill display.`
      )
    } else if (paceMinPerKm > MAX_PACE_MIN_PER_KM) {
      add(
        INDOOR_ERROR.TOO_SLOW,
        `${fmtPace(paceMinPerKm)} /km is slower than ${fmtPace(MAX_PACE_MIN_PER_KM)} /km. Check the distance against the treadmill display.`
      )
    }
  }

  let strideM = null
  let stepsUsed = null
  if (stepsLookCarried(steps, dur)) {
    stepsUsed = Math.round(Number(steps))
    if (Number.isFinite(dist) && dist > 0) {
      strideM = dist / stepsUsed
      if (strideM < MIN_STRIDE_M || strideM > MAX_STRIDE_M) {
        add(
          INDOOR_ERROR.STRIDE,
          `${(dist / 1000).toFixed(2)} km over ${stepsUsed.toLocaleString('en-US')} steps is a ${strideM.toFixed(2)} m stride - outside ${MIN_STRIDE_M}-${MAX_STRIDE_M} m. Check the distance against the treadmill display.`
        )
      }
    }
  }
  return { ok: errors.length === 0, errors, paceMinPerKm, strideM, stepsUsed }
}
