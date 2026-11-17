import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from './geo'

// One-time cleanup for the removed daily "Run Conquest" reminders (morning /
// afternoon / night). Older builds scheduled up to 14 days of them ahead on
// the device, so removing the code is not enough: they would keep firing.
// KEEP THIS FOR AT LEAST A FEW RELEASES so devices that skip versions are
// still cleaned up.
const DONE_FLAG = 'runconquest.remindersRemoved'
const OLD_CHANNEL_ID = 'run_reminders'
const OLD_TITLE = 'Run Conquest'
const OLD_KINDS = ['run-reminder', 'run-reminder-test']
const OLD_TEST_ID = 999999
const OLD_PREF_KEYS = [
  'runconquest.remindersEnabled',
  'runconquest.reminderPromptShown',
  'runconquest.reminderSlot.0',
  'runconquest.reminderSlot.1',
  'runconquest.reminderSlot.2',
  'runconquest_reminders_debug',
]

function isOldReminder(n) {
  if (!n) return false
  if (OLD_KINDS.includes(n.extra?.kind)) return true
  if (n.channelId === OLD_CHANNEL_ID) return true
  if (n.id === OLD_TEST_ID) return true
  // Fallback for builds that scheduled without extra/channel info.
  return n.title === OLD_TITLE && n.schedule?.at != null
}

export async function removeLegacyReminders() {
  if (!isNative) return
  let store
  try {
    store = window.localStorage
    if (store.getItem(DONE_FLAG) === '1') return
  } catch {
    return
  }
  try {
    const { notifications = [] } = await LocalNotifications.getPending()
    const ours = notifications.filter(isOldReminder)
    if (ours.length) {
      await LocalNotifications.cancel({
        notifications: ours.map((n) => ({ id: n.id })),
      })
    }
    try {
      await LocalNotifications.deleteChannel({ id: OLD_CHANNEL_ID })
    } catch {
      // No such channel (fresh install / iOS) - fine.
    }
    for (const key of OLD_PREF_KEYS) store.removeItem(key)
    store.setItem(DONE_FLAG, '1')
  } catch {
    // Plugin unavailable or a transient failure: leave the flag unset so the
    // next launch tries again.
  }
}
