import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { isNative } from './geo'

let initialized = false

// GoogleAuth.initialize() must run once before signIn/signOut on native.
export function ensureGoogleAuthInitialized() {
  if (initialized || !isNative) return
  initialized = true
  GoogleAuth.initialize()
}

// Forget the Google account this device last used. Our own token being gone
// is not enough: the native plugin (and GSI on the web) keep their own
// signed-in account and would silently hand it back on the next sign-in.
// Never throws - logout must always complete.
export async function googleSignOut() {
  try {
    window.google?.accounts?.id?.disableAutoSelect?.()
  } catch {
    // GSI not loaded - nothing to forget.
  }
  if (!isNative) return
  try {
    ensureGoogleAuthInitialized()
    await GoogleAuth.signOut()
  } catch {
    // Plugin had no signed-in account (or isn't ready) - already clean.
  }
}
