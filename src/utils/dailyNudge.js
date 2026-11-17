import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from './geo'
import { removeLegacyReminders } from './legacyReminderCleanup'

// ONE built-in "come back" reminder, native only, no settings. Every time the
// app is opened/resumed or a run is saved we cancel the pending one and
// schedule a single new one for 24h later - so daily players never see it and
// someone who stays away for a day gets one nudge. It fires once; the next is
// only scheduled the next time the app opens.
export const NUDGE_ID = 7001
export const NUDGE_CHANNEL_ID = 'daily_nudge'
export const NUDGE_KIND = 'daily-nudge'
const NUDGE_TITLE = 'Run Conquest'
const NUDGE_BODIES = [
  'Your streets are waiting. Go claim some territory!',
  'Your turf misses you. Lace up and take it back!',
  'A day without a run? Your rivals are cheering. Go claim some territory!',
]
const QUIET_BEFORE_HOUR = 7
const QUIET_AFTER_HOUR = 21
const DELIVER_HOUR = 9
const DELAY_MS = 24 * 60 * 60 * 1000

// 24h after `from`, moved to the next 9:00 local time when it lands before
// 7:00 or after 21:00 (device timezone, evaluated at call time).
export function computeNudgeTime(from = new Date()) {
  const t = new Date(from.getTime() + DELAY_MS)
  const mins = t.getHours() * 60 + t.getMinutes()
  if (mins < QUIET_BEFORE_HOUR * 60) {
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), DELIVER_HOUR)
  }
  if (mins > QUIET_AFTER_HOUR * 60) {
    return new Date(
      t.getFullYear(),
      t.getMonth(),
      t.getDate() + 1,
      DELIVER_HOUR
    )
  }
  return t
}

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
}

export async function cancelDailyNudge() {
  if (!isNative) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NUDGE_ID }] })
  } catch {
    // Plugin unavailable - nothing to cancel.
  }
}

// Respects the OS permission only: never asks, silently does nothing unless
// it is already granted.
export async function scheduleDailyNudge(now = new Date()) {
  if (!isNative) return
  try {
    // The old reminders' cleanup must finish first (it is memoised/once).
    await removeLegacyReminders()
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') return
    await LocalNotifications.createChannel({
      id: NUDGE_CHANNEL_ID,
      name: 'Come-back reminder',
      description: 'A single nudge if you have not run for a day',
      importance: 3, // DEFAULT, not high
      visibility: 1,
    })
    await cancelDailyNudge()
    const at = computeNudgeTime(now)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NUDGE_ID,
          title: NUDGE_TITLE,
          body: NUDGE_BODIES[dayOfYear(at) % NUDGE_BODIES.length],
          channelId: NUDGE_CHANNEL_ID,
          smallIcon: 'ic_stat_notify',
          schedule: { at, allowWhileIdle: true },
          extra: { kind: NUDGE_KIND },
        },
      ],
    })
  } catch {
    // Best-effort: a failed nudge must never affect the game.
  }
}
