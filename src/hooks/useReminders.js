import { useCallback, useEffect, useState } from 'react'
import { isNative } from '../utils/geo'
import { REMINDER_SLOTS } from '../config/reminders'
import {
  checkNotificationPermission,
  requestNotificationPermission,
  scheduleReminders,
  cancelAllReminders,
  cancelTodaysRemainingReminders,
  getRemindersPref,
  setRemindersPref,
  getSlotPref,
  setSlotPref,
  cancelSlotReminders,
} from '../utils/reminders'

// Asked once, not on first launch - the task's own ask is "after the first
// run or after login", so this is set the first time either of those
// happens, whichever comes first, and never shown again after that.
const PROMPT_SHOWN_KEY = 'runconquest.reminderPromptShown'

// Drives GamePage's Settings "Reminders" toggle and the one-time permission
// explainer. A no-op shell on the website (isNative is false) so callers
// don't need their own feature-detection.
export function useReminders() {
  const [enabled, setEnabled] = useState(() => getRemindersPref() === true)
  const [showPrompt, setShowPrompt] = useState(false)
  const [slots, setSlots] = useState(() =>
    Object.fromEntries(REMINDER_SLOTS.map((s) => [s.id, getSlotPref(s.id)]))
  )

  // Tops up the rolling schedule on every mount (app open) as long as the
  // toggle is on AND the OS permission is still actually granted - a user
  // who revoked it from system settings shouldn't keep getting silently
  // rescheduled underneath them.
  useEffect(() => {
    if (!isNative || !enabled) return
    checkNotificationPermission().then((status) => {
      if (status === 'granted') scheduleReminders()
    })
  }, [enabled])

  const offerPromptOnce = useCallback(() => {
    if (!isNative) return
    if (getRemindersPref() != null) return // already decided, don't ask again
    if (localStorage.getItem(PROMPT_SHOWN_KEY)) return
    setShowPrompt(true)
  }, [])

  const acceptPrompt = useCallback(async () => {
    localStorage.setItem(PROMPT_SHOWN_KEY, 'true')
    setShowPrompt(false)
    const status = await requestNotificationPermission()
    if (status === 'granted') {
      setRemindersPref(true)
      setEnabled(true)
      await scheduleReminders()
    } else {
      setRemindersPref(false)
    }
  }, [])

  const declinePrompt = useCallback(() => {
    localStorage.setItem(PROMPT_SHOWN_KEY, 'true')
    setRemindersPref(false)
    setShowPrompt(false)
  }, [])

  // Settings toggle - re-requests permission if it was never granted
  // (e.g. the user declined the first prompt, then opts in later from
  // Settings instead); denial just leaves the toggle off with no error.
  const toggle = useCallback(async (next) => {
    if (!next) {
      setRemindersPref(false)
      setEnabled(false)
      await cancelAllReminders()
      return
    }
    const status = await requestNotificationPermission()
    if (status === 'granted') {
      setRemindersPref(true)
      setEnabled(true)
      await scheduleReminders()
    }
  }, [])

  // One of the Morning/Afternoon/Night switches: takes effect immediately
  // (cancels just that slot, or re-tops-up the schedule), no master toggle
  // round trip. Turning a slot on while the master is off does nothing
  // visible until the master is on - the pref is still remembered.
  const toggleSlot = useCallback(
    async (slotId, next) => {
      setSlotPref(slotId, next)
      setSlots((s) => ({ ...s, [slotId]: next }))
      if (!enabled) return
      if (next) await scheduleReminders()
      else await cancelSlotReminders(slotId)
    },
    [enabled]
  )

  const notifyRunSaved = useCallback(() => {
    cancelTodaysRemainingReminders()
    offerPromptOnce()
  }, [offerPromptOnce])

  const notifyLoggedIn = useCallback(() => {
    offerPromptOnce()
  }, [offerPromptOnce])

  const notifyLoggedOut = useCallback(() => {
    cancelAllReminders()
  }, [])

  return {
    supported: isNative,
    enabled,
    showPrompt,
    acceptPrompt,
    declinePrompt,
    toggle,
    slots,
    toggleSlot,
    notifyRunSaved,
    notifyLoggedIn,
    notifyLoggedOut,
  }
}
