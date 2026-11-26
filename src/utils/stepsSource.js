// Which step count a run reports - ONE place, pure, unit-tested.
//
// Priority: the phone's hardware pedometer (iOS CMPedometer / Android
// TYPE_STEP_COUNTER, via utils/pedometer.js) when it is available AND the
// player allowed it; the accelerometer peak counter (utils/vehicleDetection.js
// handleMotionSample) only when the pedometer is unavailable or denied; else
// no steps at all. A count is never faked or zero-filled: "none" -> null ->
// the request omits `steps` (utils/runPayload.js stepsForPayload).

export const STEPS_SOURCE = Object.freeze({
  PEDOMETER: 'pedometer',
  ACCELEROMETER: 'accelerometer',
  NONE: 'none',
})

export const PEDOMETER_PERMISSION = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
  PROMPT: 'prompt',
  RESTRICTED: 'restricted',
  UNAVAILABLE: 'unavailable',
})

const count = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

// pedometer: { available, permission, steps }  (steps = null when no reading)
// accelerometer: { available, steps, lost }     (lost = run was resumed after
//   an app kill, so the in-memory count is partial and untrustworthy)
export function chooseStepsSource({ pedometer, accelerometer } = {}) {
  const ped = pedometer ?? {}
  const pedSteps = count(ped.steps)
  if (
    ped.available &&
    ped.permission === PEDOMETER_PERMISSION.GRANTED &&
    pedSteps != null
  ) {
    return { source: STEPS_SOURCE.PEDOMETER, steps: pedSteps }
  }
  const acc = accelerometer ?? {}
  const accSteps = count(acc.steps)
  if (acc.available && !acc.lost && accSteps != null && accSteps > 0) {
    return { source: STEPS_SOURCE.ACCELEROMETER, steps: accSteps }
  }
  return { source: STEPS_SOURCE.NONE, steps: null }
}

// A treadmill run with the phone left on the console or in a bag counts
// (almost) nothing: fewer than 60 steps/min over the run means the phone was
// not carried, so the count says nothing about the distance. Above 240/min is
// not a human gait. Outside this band the count is ignored, not validated.
export const MIN_CADENCE_SPM = 60
export const MAX_CADENCE_SPM = 240
export function stepsLookCarried(steps, durationSeconds) {
  const n = count(steps)
  if (n == null || n <= 0 || !(durationSeconds > 0)) return false
  const spm = n / (durationSeconds / 60)
  return spm >= MIN_CADENCE_SPM && spm <= MAX_CADENCE_SPM
}
