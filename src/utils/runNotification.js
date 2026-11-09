import { registerPlugin } from '@capacitor/core'
import { isNative } from './geo'
import { requestNotificationPermission } from './reminders'

// Android-only persistent "Running"/"Paused" notification shown while a run
// is being tracked - styled like the in-game run panel (see
// RunNotificationPlugin.java). No-op everywhere else (web build, iOS -
// iOS's equivalent live-tracking notification isn't built yet).
const RunNotification = registerPlugin('RunNotification')

let permissionRequested = false

// POST_NOTIFICATIONS is also what @capacitor/local-notifications' daily-
// reminders feature already prompts for (see reminders.js) - reusing that
// same check/request here avoids a second, redundant permission dialog.
// Denied or not-yet-decided just means no notification shows; run tracking
// itself is never gated on this.
async function ensurePermission() {
  if (permissionRequested) return
  permissionRequested = true
  try {
    const status = await requestNotificationPermission()
    if (status !== 'granted') permissionRequested = false
  } catch {
    permissionRequested = false
  }
}

// Called whenever tracking (re)starts not-paused: a brand new run, a
// Training run resuming after pause(), or the app reattaching to a run
// already in progress after being reopened. elapsedMs/distanceMeters/
// paceLabel should reflect the run's current state at that moment (not
// always zero) - see useRunTracker.js's three call sites.
export async function startRunNotification({
  elapsedMs = 0,
  distanceMeters = 0,
  paceLabel = null,
} = {}) {
  if (!isNative) return
  await ensurePermission()
  RunNotification.start({ elapsedMs, distanceMeters, paceLabel }).catch(
    () => {}
  )
}

// distanceMeters/paceLabel are both optional - pass whichever changed.
// paceLabel should already be formatted the way the in-app panel shows it
// (e.g. "5:30", or null/omitted for "--") so the notification never drifts
// from TrackRunPanel's own numbers.
export function updateRunNotification({ distanceMeters, paceLabel } = {}) {
  if (!isNative) return
  RunNotification.update({ distanceMeters, paceLabel }).catch(() => {})
}

export function pauseRunNotification() {
  if (!isNative) return
  RunNotification.pause().catch(() => {})
}

// Resuming after pause() isn't a distinct native call - it's
// startRunNotification() again with the current elapsed/distance/pace, same
// as a fresh app-reattach would use (see start()'s doc in the Java plugin).
export const resumeRunNotification = startRunNotification

export function stopRunNotification() {
  if (!isNative) return
  RunNotification.stop().catch(() => {})
}
