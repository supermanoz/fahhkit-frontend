import { registerPlugin } from '@capacitor/core'
import { isNative, platform } from './geo'
import { requestNotificationPermission } from './notificationPermission'

// The "run in progress" surface shown while a run is being tracked, styled like
// the in-game run panel:
//  - Android: persistent notification (RunNotificationPlugin.java).
//  - iOS: Live Activity on the lock screen + Dynamic Island, iOS 16.2+
//    (RunLiveActivityPlugin.swift; silently does nothing on older iOS).
// Both native plugins take the SAME start/update/pause/stop calls below.
// No-op on the web build.
const RunNotification = registerPlugin('RunNotification')
const RunLiveActivity = registerPlugin('RunLiveActivity')
const target = () => (platform === 'ios' ? RunLiveActivity : RunNotification)

let permissionRequested = false

// POST_NOTIFICATIONS is the same permission push alerts use (see
// notificationPermission.js) - reusing that same check/request here avoids a
// second, redundant permission dialog.
// Denied or not-yet-decided just means no notification shows; run tracking
// itself is never gated on this.
async function ensurePermission() {
  // Live Activities need no notification permission (the user toggles them in
  // Settings), so iOS never gets a prompt from here.
  if (platform === 'ios') return
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
  title = null,
} = {}) {
  if (!isNative) return
  await ensurePermission()
  target()
    .start({ elapsedMs, distanceMeters, paceLabel, title })
    .catch(() => {})
}

// distanceMeters/paceLabel are both optional - pass whichever changed.
// paceLabel should already be formatted the way the in-app panel shows it
// (e.g. "5:30", or null/omitted for "--") so the notification never drifts
// from TrackRunPanel's own numbers.
export function updateRunNotification({
  distanceMeters,
  paceLabel,
  title,
} = {}) {
  if (!isNative) return
  // `title` swaps the header text (e.g. "Vehicle detected"); '' restores the
  // run-mode label. Omitted = unchanged.
  target()
    .update({ distanceMeters, paceLabel, title })
    .catch(() => {})
}

export function pauseRunNotification({ title = null } = {}) {
  if (!isNative) return
  target()
    .pause({ title })
    .catch(() => {})
}

// Resuming after pause() isn't a distinct native call - it's
// startRunNotification() again with the current elapsed/distance/pace, same
// as a fresh app-reattach would use (see start()'s doc in the Java plugin).
export const resumeRunNotification = startRunNotification

export function stopRunNotification() {
  if (!isNative) return
  target()
    .stop()
    .catch(() => {})
}
