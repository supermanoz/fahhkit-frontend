import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from './geo'
import {
  REMINDER_SLOTS,
  REMINDER_NOTIFICATION_TITLE,
  REMINDER_WINDOW_DAYS,
} from '../config/reminders'

const CHANNEL_ID = 'run_reminders'
const PREF_KEY = 'runconquest.remindersEnabled'

export function remindersSupported() {
  return isNative
}

// null = never decided (no prompt answered yet) - distinct from false
// ("explicitly turned off"), so useReminders knows whether to still offer
// the first-run/first-login prompt.
export function getRemindersPref() {
  const raw = localStorage.getItem(PREF_KEY)
  return raw == null ? null : raw === 'true'
}

export function setRemindersPref(enabled) {
  localStorage.setItem(PREF_KEY, String(enabled))
}

// Per-slot switches (Morning / Afternoon / Night). Default on, so someone who
// only ever used the old single Reminders toggle keeps all three.
const SLOT_PREF_PREFIX = 'runconquest.reminderSlot.'

export function getSlotPref(slotId) {
  try {
    return localStorage.getItem(SLOT_PREF_PREFIX + slotId) !== 'false'
  } catch {
    return true
  }
}

export function setSlotPref(slotId, enabled) {
  try {
    localStorage.setItem(SLOT_PREF_PREFIX + slotId, String(enabled))
  } catch {
    // Best-effort only.
  }
}

async function ensureChannel() {
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Run reminders',
    description: 'Daily nudges to go claim some territory',
    importance: 4, // HIGH - matches the task's "high-importance channel"
    visibility: 1,
    lights: true,
    vibration: true,
  })
}

// 'granted' | 'denied' | 'prompt'. Native: the OS permission (on Android the
// push and local-notification permission are the same POST_NOTIFICATIONS
// one). Web: the browser's Notification permission, so Settings can show
// (and ask for) it there too - nothing is ever scheduled on web, see the
// isNative guards below.
function normalizePermission(value) {
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  return 'prompt'
}

export function notificationPermissionSupported() {
  return isNative || typeof Notification !== 'undefined'
}

export async function checkNotificationPermission() {
  if (!isNative) {
    if (typeof Notification === 'undefined') return 'denied'
    return normalizePermission(Notification.permission)
  }
  const { display } = await LocalNotifications.checkPermissions()
  return normalizePermission(display)
}

export async function requestNotificationPermission() {
  if (!isNative) {
    if (typeof Notification === 'undefined') return 'denied'
    try {
      return normalizePermission(await Notification.requestPermission())
    } catch {
      return 'denied'
    }
  }
  const { display } = await LocalNotifications.requestPermissions()
  return normalizePermission(display)
}

function dateKey(d) {
  return (
    d.getFullYear() * 10000 +
    (d.getMonth() + 1) * 100 +
    d.getDate()
  ).toString()
}

function idFor(key, slotId) {
  return Number(key) * 10 + slotId
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

// (Re)schedules every slot still ahead, for today through
// REMINDER_WINDOW_DAYS out - already-fired/passed slots for earlier days are
// simply never re-added (Capacitor's `schedule` upserts by id, so calling
// this repeatedly is always safe/idempotent). Call on app open, right after
// permission is granted, and whenever the toggle turns on.
export async function scheduleReminders() {
  if (!isNative) return
  await ensureChannel()
  const now = new Date()
  const notifications = []
  for (let offset = 0; offset < REMINDER_WINDOW_DAYS; offset++) {
    const day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset
    )
    const key = dateKey(day)
    const doy = dayOfYear(day)
    for (const slot of REMINDER_SLOTS) {
      if (!getSlotPref(slot.id)) continue
      const at = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        slot.hour,
        slot.minute,
        0,
        0
      )
      if (at <= now) continue
      notifications.push({
        id: idFor(key, slot.id),
        title: REMINDER_NOTIFICATION_TITLE,
        body: slot.messages[doy % slot.messages.length],
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_notify',
        schedule: { at, allowWhileIdle: true },
        extra: { kind: 'run-reminder' },
      })
    }
  }
  if (notifications.length) {
    await LocalNotifications.schedule({ notifications })
  }
}

export async function cancelAllReminders() {
  if (!isNative) return
  const pending = await LocalNotifications.getPending()
  const ours = pending.notifications.filter(
    (n) => n.extra?.kind === 'run-reminder'
  )
  if (ours.length) {
    await LocalNotifications.cancel({
      notifications: ours.map((n) => ({ id: n.id })),
    })
  }
}

// One slot switched off: drop just that slot's pending reminders (ids are
// dateKey * 10 + slotId, see idFor). Turning it back on is scheduleReminders.
export async function cancelSlotReminders(slotId) {
  if (!isNative) return
  const pending = await LocalNotifications.getPending()
  const ours = pending.notifications.filter(
    (n) => n.extra?.kind === 'run-reminder' && n.id % 10 === slotId
  )
  if (ours.length) {
    await LocalNotifications.cancel({
      notifications: ours.map((n) => ({ id: n.id })),
    })
  }
}

// Called right after a run is saved - skips whichever of TODAY's slots
// haven't fired yet. Future days are untouched (saving a run today says
// nothing about tomorrow). Harmless no-op for ids that already fired/don't
// exist.
export async function cancelTodaysRemainingReminders() {
  if (!isNative) return
  const key = dateKey(new Date())
  await LocalNotifications.cancel({
    notifications: REMINDER_SLOTS.map((slot) => ({ id: idFor(key, slot.id) })),
  })
}

const DEBUG_STORAGE_KEY = 'runconquest_reminders_debug'

// `?debug=reminders` on any page shows Settings' "Send test reminder" button
// - same one-time-URL-param-then-remembered pattern as the anti-cheat debug
// overlay (see utils/antiCheatSettings.js's isAntiCheatDebugEnabled).
// `?debug=off` clears every debug flag, this one included.
export function isRemindersDebugEnabled() {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const debugParam = params.get('debug')
      if (debugParam === 'reminders') {
        localStorage.setItem(DEBUG_STORAGE_KEY, '1')
        return true
      }
      if (debugParam === 'off') {
        localStorage.removeItem(DEBUG_STORAGE_KEY)
        return false
      }
    }
    return localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Dev/QA helper - fires one real reminder ~60s out through the exact same
// channel/path as the real schedule, to prove delivery without waiting for
// a real slot. Not reachable from production UI - see Settings' debug
// affordance, gated the same way other dev-only tools in this file are.
export async function scheduleTestReminderInOneMinute() {
  if (!isNative) return
  await ensureChannel()
  const slot = REMINDER_SLOTS[0]
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 999999,
        title: REMINDER_NOTIFICATION_TITLE,
        body: `[Test] ${slot.messages[0]}`,
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_notify',
        schedule: { at: new Date(Date.now() + 60000), allowWhileIdle: true },
        extra: { kind: 'run-reminder-test' },
      },
    ],
  })
}
