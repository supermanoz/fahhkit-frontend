// Native step counter (iOS CMPedometer / Android TYPE_STEP_COUNTER) behind one
// small, never-throwing API. The plugin itself is in-app (RunPedometerPlugin.swift /
// RunPedometerPlugin.java, registered like RunLiveActivity). On the web there
// is no pedometer: everything reports "unavailable" and callers fall back
// (utils/stepsSource.js).

import { Capacitor, registerPlugin } from '@capacitor/core'
import { PEDOMETER_PERMISSION } from './stepsSource'

const RunPedometer = registerPlugin('RunPedometer')

const KNOWN = new Set(Object.values(PEDOMETER_PERMISSION))
const normalise = (p) => (KNOWN.has(p) ? p : PEDOMETER_PERMISSION.UNAVAILABLE)

const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const UNAVAILABLE = Object.freeze({
  available: false,
  permission: PEDOMETER_PERMISSION.UNAVAILABLE,
})

// -> { available, permission }
export async function getPedometerStatus() {
  if (!isNativeApp()) return UNAVAILABLE
  try {
    const r = await RunPedometer.getStatus()
    return {
      available: Boolean(r?.available),
      permission: normalise(r?.permission),
    }
  } catch {
    return UNAVAILABLE
  }
}

// Shows the system permission dialog (only when it has not been answered).
export async function requestPedometerPermission() {
  if (!isNativeApp()) return PEDOMETER_PERMISSION.UNAVAILABLE
  try {
    const r = await RunPedometer.requestPermission()
    return normalise(r?.permission)
  } catch {
    return PEDOMETER_PERMISSION.UNAVAILABLE
  }
}

// Begin counting from `startedAtMs` (a resumed run passes its ORIGINAL start,
// so nothing is lost). `onSteps({steps, distanceMeters})` gets live updates.
// -> true when counting started, false when it could not (denied/unavailable).
export async function startPedometer(startedAtMs, onSteps) {
  if (!isNativeApp()) return false
  try {
    stopListening()
    if (onSteps) {
      listener = await RunPedometer.addListener('steps', onSteps)
    }
    await RunPedometer.start({ startedAtMs })
    return true
  } catch {
    stopListening()
    return false
  }
}

// -> { steps: number|null, distanceMeters: number|null } | null on failure.
export async function readPedometer(startedAtMs) {
  if (!isNativeApp()) return null
  try {
    const r = await RunPedometer.read({ startedAtMs })
    const steps = Number(r?.steps)
    const dist = Number(r?.distanceMeters)
    return {
      steps: r?.steps != null && Number.isFinite(steps) ? steps : null,
      distanceMeters:
        r?.distanceMeters != null && Number.isFinite(dist) ? dist : null,
    }
  } catch {
    return null
  }
}

export async function stopPedometer() {
  stopListening()
  if (!isNativeApp()) return
  try {
    await RunPedometer.stop()
  } catch {
    // nothing to stop
  }
}

let listener = null
function stopListening() {
  try {
    listener?.remove?.()
  } catch {
    // already removed
  }
  listener = null
}
