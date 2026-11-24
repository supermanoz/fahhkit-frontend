// Client-side read of a session token's expiry, so a page can tell "signed
// out" apart from "signed in" without waiting for the server to reject the
// token. Only the (unsigned, readable) `exp` claim is looked at - this is not
// a security check, the server still validates every request; it just stops
// the UI sitting on a dead session.

function base64UrlDecode(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return atob(padded + pad)
}

// Milliseconds since epoch the token expires at, or null when it has no
// readable expiry (an opaque token).
export function tokenExpiryMs(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

// The backend (jwt.refresh-grace-days=7) still exchanges a correctly signed
// token for a fresh one for this long AFTER it expired - a phone that slept or
// an app closed for days. Inside that window the session is recoverable, so the
// client must keep the token and refresh it, not sign the player out.
export const REFRESH_GRACE_MS = 7 * 24 * 60 * 60 * 1000

// Has the access token itself passed its exp? (Still refreshable, see above.)
export function isTokenExpired(token, now = Date.now()) {
  const exp = tokenExpiryMs(token)
  return exp != null && exp <= now
}

// Missing -> no. Past expiry AND past the refresh grace window -> no (the
// server would refuse it too). Anything else - fresh, expired-but-refreshable,
// or an opaque token - yes: only a server rejection can prove it dead.
export function isTokenUsable(token, now = Date.now()) {
  if (!token) return false
  const exp = tokenExpiryMs(token)
  return exp == null || exp + REFRESH_GRACE_MS > now
}
