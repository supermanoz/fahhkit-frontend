// Human-readable text for a failed Google sign-in, both halves of it:
//  - the native account picker (@codetrix-studio/capacitor-google-auth rejects
//    with Play Services' status code as the error's `code`, e.g. "10"), and
//  - the backend's POST /v1/auth/google rejecting the ID token (ApiError).
// Shown in the auth banner so a failure on a phone says WHY instead of
// silently doing nothing (which is what the native button used to do).
import { ApiError } from '../api/client'

// com.google.android.gms.common.api.CommonStatusCodes / GoogleSignInStatusCodes
export const GOOGLE_SIGN_IN_CODES = {
  7: 'No connection to Google (code 7). Check your network and try again.',
  // The classic misconfiguration: no Android OAuth client in the Google Cloud
  // project of the web client id matches this app's package + signing SHA-1,
  // or the requested client id is not a real web client id.
  10: "Google sign-in isn't set up for this build (code 10): the app's package + signing certificate aren't registered for its Google client ID.",
  // Play Services couldn't complete the sign-in: usually no Google account on
  // the device, Play Services out of date, or the same misconfiguration as 10.
  12500:
    'Google sign-in failed (code 12500). Check that a Google account is added on this phone and Google Play services is up to date.',
  12501: 'Google sign-in was cancelled.',
  12502: 'Google sign-in is already in progress.',
  16: "Google sign-in couldn't start (code 16): no usable Google account or Play services on this device.",
}

export function describeGoogleSignInError(err) {
  const raw = err?.code ?? err?.message
  const code = Number.parseInt(String(raw ?? '').trim(), 10)
  if (Number.isFinite(code) && GOOGLE_SIGN_IN_CODES[code]) {
    return {
      code,
      message: GOOGLE_SIGN_IN_CODES[code],
      cancelled: code === 12501,
    }
  }
  const detail = err?.message ? ` (${err.message})` : ''
  return {
    code: Number.isFinite(code) ? code : null,
    message: `Google sign-in failed${Number.isFinite(code) ? ` (code ${code})` : ''}${detail}.`,
    cancelled: false,
  }
}

// The server side: the ID token reached the backend and was refused.
export function describeOAuthServerError(err, provider, fallback) {
  if (!(err instanceof ApiError)) return fallback
  if (err.status === 0)
    return 'Could not reach the server. Check your connection and try again.'
  if (err.status === 401)
    return `${provider} sign-in was rejected by the server (401): the token's client ID isn't in the server's allow-list, or it expired.${err.message ? ` Server said: ${err.message}` : ''}`
  if (err.status === 403)
    return `This ${provider} account isn't allowed to sign in (403).${err.message ? ` Server said: ${err.message}` : ''}`
  return err.message || fallback
}
