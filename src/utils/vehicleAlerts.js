import { LocalNotifications } from '@capacitor/local-notifications'
import { buzzAlert } from './haptics'
import { isNative } from './geo'
import { isSfxMuted, playSfx } from './gameSound'
import { VEHICLE_NOTIFY_COOLDOWN_SECONDS } from '../constants/antiCheat'
import {
  OVER_SPEED_DISCARD_NOTIFICATION_BODY,
  OVER_SPEED_DISCARDED_TITLE,
  OVER_SPEED_NOTIFICATION_BODY,
  OVER_SPEED_WARNING_TITLE,
} from '../constants/runMessages'

// "You're in a vehicle" alerts for a live run. In the foreground: a haptic
// buzz + the pop sound (the in-app banner is rendered by the UI). With the
// app in the background / screen locked on native: a local notification on
// its own high-importance channel, so it actually makes noise and shows up
// over the lock screen. Never throws - an alert must not break tracking.
export const VEHICLE_CHANNEL_ID = 'run_alerts'
const WARNING_NOTIFICATION_ID = 9101
const DISCARD_NOTIFICATION_ID = 9102

export const VEHICLE_WARNING_TITLE = OVER_SPEED_WARNING_TITLE
export const VEHICLE_WARNING_BODY = OVER_SPEED_NOTIFICATION_BODY
export const VEHICLE_DISCARD_TITLE = OVER_SPEED_DISCARDED_TITLE
export const VEHICLE_DISCARD_BODY = OVER_SPEED_DISCARD_NOTIFICATION_BODY

// Header the Android run notification shows while the warning is up.
export const VEHICLE_NOTIFICATION_HEADER = OVER_SPEED_WARNING_TITLE

let lastWarningAtMs = null

export function resetVehicleAlertCooldown() {
  lastWarningAtMs = null
}

function isBackgrounded() {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  )
}

async function postNotification(id, title, body) {
  try {
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') return false
    await LocalNotifications.createChannel({
      id: VEHICLE_CHANNEL_ID,
      name: 'Run alerts',
      description: 'Warnings while a run is being tracked',
      importance: 5, // HIGH: sound + heads-up
      visibility: 1,
      vibration: true,
    })
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: VEHICLE_CHANNEL_ID,
          smallIcon: 'ic_stat_notify',
          // Tapping brings the running app (the run view) to the front.
          extra: { kind: 'run-vehicle-alert' },
        },
      ],
    })
    return true
  } catch {
    return false
  }
}

function foregroundCue() {
  try {
    buzzAlert()
  } catch {
    // no haptics - fine
  }
  if (!isSfxMuted()) playSfx('pop')
}

// One warning per episode, and never more often than the cooldown.
// Returns true when an alert was actually raised.
export async function alertVehicleWarning(nowMs = Date.now()) {
  if (
    lastWarningAtMs != null &&
    nowMs - lastWarningAtMs < VEHICLE_NOTIFY_COOLDOWN_SECONDS * 1000
  ) {
    return false
  }
  lastWarningAtMs = nowMs
  if (isNative && isBackgrounded()) {
    await postNotification(
      WARNING_NOTIFICATION_ID,
      VEHICLE_WARNING_TITLE,
      VEHICLE_WARNING_BODY
    )
  } else {
    foregroundCue()
  }
  return true
}

export async function alertVehicleDiscarded() {
  if (isNative && isBackgrounded()) {
    await postNotification(
      DISCARD_NOTIFICATION_ID,
      VEHICLE_DISCARD_TITLE,
      VEHICLE_DISCARD_BODY
    )
  } else {
    foregroundCue()
  }
}
