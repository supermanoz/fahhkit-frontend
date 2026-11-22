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
  cancelPendingUpdate()
  await ensurePermission()
  target()
    .start({ elapsedMs, distanceMeters, paceLabel, title })
    .catch(() => {})
}

// distanceMeters/paceLabel are both optional - pass whichever changed.
// paceLabel should already be formatted the way the in-app panel shows it
// (e.g. "5:30", or null/omitted for "--") so the notification never drifts
// from TrackRunPanel's own numbers.
// Distance/pace updates are rate-limited: a fix arrives every ~2.5 s and each
// update crosses the native bridge and spends iOS's Live Activity update
// budget (and Android's notification updates wake the UI). The latest values
// are always delivered (trailing edge); a title change goes out immediately.
const NOTIFICATION_UPDATE_MIN_MS = 5000
let lastUpdateAt = 0
let pendingUpdate = null
let pendingTimer = null

// A queued trailing update must never fire after the run notification was
// started again, paused or stopped.
function cancelPendingUpdate() {
  clearTimeout(pendingTimer)
  pendingTimer = null
  pendingUpdate = null
}

function sendUpdate(payload) {
  lastUpdateAt = Date.now()
  target()
    .update(payload)
    .catch(() => {})
}

export function updateRunNotification({
  distanceMeters,
  paceLabel,
  title,
} = {}) {
  if (!isNative) return
  // `title` swaps the header text (e.g. "Vehicle detected"); '' restores the
  // run-mode label. Omitted = unchanged.
  const payload = { distanceMeters, paceLabel, title }
  const elapsed = Date.now() - lastUpdateAt
  if (title !== undefined || elapsed >= NOTIFICATION_UPDATE_MIN_MS) {
    cancelPendingUpdate()
    sendUpdate(payload)
    return
  }
  pendingUpdate = { ...(pendingUpdate || {}), ...payload }
  if (pendingTimer == null) {
    pendingTimer = setTimeout(() => {
      pendingTimer = null
      const next = pendingUpdate
      pendingUpdate = null
      if (next) sendUpdate(next)
    }, NOTIFICATION_UPDATE_MIN_MS - elapsed)
  }
}

export function pauseRunNotification({ title = null } = {}) {
  if (!isNative) return
  cancelPendingUpdate()
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
  cancelPendingUpdate()
  lastUpdateAt = 0
  target()
    .stop()
    .catch(() => {})
}
