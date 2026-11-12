import { registerPlugin } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { isNative, platform } from './geo'
import { registerDeviceToken, removeDeviceToken } from '../api/push'

// FCM push (Android now; iOS rides FCM's APNs bridge).
// TEMP: iOS stays off until the APNs key is uploaded in Firebase and the Push
// Notifications + Background Modes (remote notifications) capabilities are
// added in Xcode - flip this when both are done.
export const IOS_PUSH = false

// Same ids the backend puts on each push (PushCategoryConstant): Android 8+
// takes sound/importance from the channel, so these must match exactly.
export const PUSH_CHANNELS = [
  {
    id: 'broadcasts',
    name: 'News & announcements',
    description: 'Announcements and news from the Run Conquest team',
  },
  {
    id: 'club_war',
    name: 'Club wars',
    description: 'Your club war is matched, starting or about to end',
  },
  {
    id: 'territory',
    name: 'Territory alerts',
    description: 'Someone took your territory',
  },
]

const TOKEN_KEY = 'runconquest.pushToken'
const PROMPT_ASKED_KEY = 'runconquest.pushPromptAsked'

const AppSettings = registerPlugin('AppSettings')

export function pushSupported() {
  if (!isNative) return false
  return platform === 'android' || (platform === 'ios' && IOS_PUSH)
}

function readStored(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStored(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Best-effort only.
  }
}

export function hasAskedForPushPermission() {
  return readStored(PROMPT_ASKED_KEY) === 'true'
}
export function markPushPermissionAsked() {
  writeStored(PROMPT_ASKED_KEY, 'true')
}

export async function ensurePushChannels() {
  if (platform !== 'android') return
  for (const channel of PUSH_CHANNELS) {
    await PushNotifications.createChannel({
      ...channel,
      importance: 4, // HIGH
      visibility: 1,
      vibration: true,
      lights: true,
    })
  }
}

// 'granted' | 'denied' | 'prompt' (Capacitor's 'prompt-with-rationale' is
// folded into 'prompt').
export async function getPushPermission() {
  if (!pushSupported()) return 'denied'
  const { receive } = await PushNotifications.checkPermissions()
  return receive === 'prompt-with-rationale' ? 'prompt' : receive
}

export async function requestPushPermission() {
  if (!pushSupported()) return 'denied'
  const { receive } = await PushNotifications.requestPermissions()
  return receive === 'prompt-with-rationale' ? 'prompt' : receive
}

export function openNotificationSettings() {
  // iOS: the app-settings: scheme opens this app's page in Settings (no native
  // plugin needed). Android: AppSettingsPlugin.java.
  if (platform === 'ios') {
    window.open('app-settings:', '_system')
    return Promise.resolve()
  }
  return AppSettings.openNotificationSettings().catch(() => {})
}

// Sends this phone's token to the backend (idempotent upsert; a different
// player logging in on the same phone takes it over). Failures are swallowed -
// the next app open retries.
export async function syncPushToken(token) {
  writeStored(TOKEN_KEY, token)
  try {
    await registerDeviceToken(token, platform)
  } catch {
    // Retry on next app open.
  }
}

// Logout: stop pushes for this player on this phone. Bounded so a bad network
// can't hold up the logout.
export async function unregisterPushToken(timeoutMs = 1500) {
  const token = readStored(TOKEN_KEY)
  if (!token || !pushSupported()) return
  writeStored(TOKEN_KEY, null)
  await Promise.race([
    removeDeviceToken(token).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

// Starts the FCM registration; the token arrives via the 'registration' listener.
export function startPushRegistration() {
  return PushNotifications.register()
}

// onToken(token), onForeground(notification), onTap(data). Returns a cleanup.
export async function addPushListeners({ onToken, onForeground, onTap }) {
  const handles = await Promise.all([
    PushNotifications.addListener('registration', (t) => onToken(t.value)),
    PushNotifications.addListener('registrationError', () => {}),
    PushNotifications.addListener('pushNotificationReceived', (n) =>
      onForeground(n)
    ),
    PushNotifications.addListener('pushNotificationActionPerformed', (a) =>
      onTap(a?.notification?.data || {})
    ),
  ])
  return () => handles.forEach((h) => h.remove())
}
