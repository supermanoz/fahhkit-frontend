// Durable copy of the signed-in session. The app reads the token synchronously
// from localStorage everywhere (api/client.js), so localStorage stays the
// working copy on every platform. On the native app it is ALSO mirrored into
// Capacitor Preferences (UserDefaults / SharedPreferences): the WebView's
// localStorage can be purged by the OS (low storage, WebView data reset) and
// then the player would land on the sign-in screen for no visible reason.
// hydrateAuthStorage() runs once before the first render and restores the
// session from Preferences if localStorage lost it - so the auth gate never
// runs against a session that simply hasn't loaded yet.
import { Preferences } from '@capacitor/preferences'
import { isNative } from './geo'
import { isTokenUsable } from './jwtExpiry'

export const TOKEN_KEY = 'fahhkit_token'
export const USER_KEY = 'fahhkit_user'
const HYDRATE_TIMEOUT_MS = 3000

function lsGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable - Preferences (native) is still written below.
  }
}

// Fire-and-forget mirror; never throws, never blocks a sign-in.
export function mirrorSet(key, value) {
  if (!isNative) return
  Preferences.set({ key, value }).catch(() => {})
}

export function mirrorRemove(key) {
  if (!isNative) return
  Preferences.remove({ key }).catch(() => {})
}

// Restore token/user from Preferences when localStorage has none. Pure of
// timing concerns so it is unit-testable; the exported hydrate wraps it.
export async function restoreFromPreferences(
  prefs = Preferences,
  now = Date.now()
) {
  const stored = lsGet(TOKEN_KEY)
  if (stored) {
    // Normal launch: keep Preferences in step with what the page has.
    mirrorSet(TOKEN_KEY, stored)
    const user = lsGet(USER_KEY)
    if (user) mirrorSet(USER_KEY, user)
    return 'local'
  }
  const { value: token } = await prefs.get({ key: TOKEN_KEY })
  if (!token || !isTokenUsable(token, now)) {
    // Nothing saved, or the saved session already expired: drop it for good.
    if (token) await prefs.remove({ key: TOKEN_KEY }).catch(() => {})
    return 'none'
  }
  lsSet(TOKEN_KEY, token)
  const { value: user } = await prefs.get({ key: USER_KEY })
  if (user) lsSet(USER_KEY, user)
  return 'restored'
}

let hydration = null

// Resolves when the stored session is loaded (or on a short timeout - never
// blocks app start). Safe to call many times.
export function hydrateAuthStorage() {
  if (!hydration) {
    hydration = !isNative
      ? Promise.resolve('local')
      : Promise.race([
          restoreFromPreferences()
            .catch(() => 'error')
            .then((result) => {
              // Finished AFTER the timeout already let the app render: the
              // auth gate is listening for this event, so a slow storage read
              // signs the player in instead of leaving them on the login screen.
              if (result === 'restored') {
                try {
                  window.dispatchEvent(new Event('fahhkit:auth-changed'))
                } catch {
                  // No window (tests).
                }
              }
              return result
            }),
          new Promise((resolve) =>
            setTimeout(() => resolve('timeout'), HYDRATE_TIMEOUT_MS)
          ),
        ]).then((result) => {
          console.info(`[auth] session hydrated from ${result}`)
          return result
        })
  }
  return hydration
}
