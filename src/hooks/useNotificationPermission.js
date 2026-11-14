import { useCallback, useEffect, useState } from 'react'
import {
  checkNotificationPermission,
  requestNotificationPermission,
  notificationPermissionSupported,
} from '../utils/reminders'

// The one "may this app show notifications" state Settings reads:
// 'unknown' (still checking) | 'granted' | 'denied' | 'prompt' (not asked yet).
// Native uses the OS permission (via the push hook's request when push is
// available, so a grant also registers the FCM token); web uses the
// browser's. Re-read on focus/visibility so coming back from the phone's
// settings screen updates the switches without reopening the menu.
export function useNotificationPermission(push) {
  const supported = notificationPermissionSupported()
  const [state, setState] = useState('unknown')
  const pushRequest = push?.requestPermission
  const pushSupported = Boolean(push?.supported)

  const refresh = useCallback(async () => {
    if (!supported) return 'denied'
    try {
      const next = await checkNotificationPermission()
      setState(next)
      return next
    } catch {
      return 'denied'
    }
  }, [supported])

  useEffect(() => {
    if (!supported) return
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [supported, refresh])

  // Shows the OS/browser dialog when it hasn't been asked (or can be asked
  // again); resolves to the resulting state.
  const request = useCallback(async () => {
    if (!supported) return 'denied'
    try {
      if (pushSupported && pushRequest) await pushRequest()
      else await requestNotificationPermission()
    } catch {
      // Fall through to the re-check.
    }
    return refresh()
  }, [supported, pushSupported, pushRequest, refresh])

  return { supported, state, refresh, request }
}
