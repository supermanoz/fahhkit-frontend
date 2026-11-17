import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from './geo'

// 'granted' | 'denied' | 'prompt'. Native: the OS permission (on Android the
// push and local-notification permission are the same POST_NOTIFICATIONS
// one). Web: the browser's Notification permission, so Settings can show
// (and ask for) it there too.
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
