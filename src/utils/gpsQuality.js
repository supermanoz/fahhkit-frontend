// GPS-wobble filter: is this fix's movement from the last kept fix just
// position noise? Used by hooks/useRunTracker.js BEFORE a fix joins the run's
// trace, so wobble neither counts as distance nor reaches the backend's
// sustained-speed check as a fake "jump". Pure - no React/DOM.
//
// Two cases, both needing a valid chip (Doppler) speed - the one number
// position jitter cannot inflate - and both only for fixes that are not
// already precise (a hop between two good fixes is taken at face value):
//   A  standing still: the chip says ~0 m/s and the fix is within the
//      combined uncertainty of the last one.
//   B  impossible hop: the positions imply a speed far above both what the
//      chip reports and what a person can do, while the fixes are imprecise.
// A real vehicle shows up in the chip's own speed, so neither rule hides it.
import { haversineDistance } from './run'
import { validDeviceSpeed } from './vehicleDetection'
import { GOOD_ACCURACY_METERS } from '../constants/antiCheat'

// Truly still: deliberately low. A slow walker's Doppler readings dip to
// 0.3-0.5 m/s, and dropping those fixes would bias the credited distance
// upward; the distance filter (utils/distanceFilter.js) handles stationary
// drift on its own.
export const STILL_DEVICE_SPEED_MS = 0.2
export const HOP_IMPOSSIBLE_SPEED_MS = 10
export const HOP_OVER_DEVICE_SPEED_MS = 5
// After this many wobble drops in a row, take the next fix anyway: the chip
// may be wrong, and the trace must resync with where the phone really is.
export const MAX_CONSECUTIVE_WOBBLE_DROPS = 5

export function isGpsWobble(previous, fix) {
  if (!previous || !fix) return false
  const device = validDeviceSpeed(fix.speed ?? fix.speedMps)
  if (device == null) return false
  const prevAcc = previous.accuracy ?? 0
  const acc = fix.accuracy ?? 0
  if (Math.max(prevAcc, acc) <= GOOD_ACCURACY_METERS) return false
  const dt = (fix.timestamp - previous.timestamp) / 1000
  if (!(dt > 0)) return false
  const meters = haversineDistance(previous, fix)
  const uncertainty = 0.75 * (prevAcc + acc)
  if (device <= STILL_DEVICE_SPEED_MS && meters <= uncertainty) return true
  const implied = meters / dt
  return (
    implied > HOP_IMPOSSIBLE_SPEED_MS &&
    implied > device + HOP_OVER_DEVICE_SPEED_MS
  )
}
