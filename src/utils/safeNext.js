// The sign-in page's `?next=` target: where to send the player once they have
// signed in. It comes from the URL, so it is untrusted - only a plain
// same-site path (+ query + hash) is ever accepted. Anything else (another
// host, a `//host` or `/\host` trick, a scheme like `javascript:`, control
// characters, the auth pages themselves) is rejected and the caller falls
// back to the default page.
//
// No token, password or other credential ever belongs in `next` - it is just
// the page the player was trying to open.

export const DEFAULT_NEXT = '/'

// Landing here after signing in would just bounce back to sign in.
const AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/update-password',
]

// A sentinel origin: if parsing the candidate against it changes the origin,
// the candidate pointed somewhere else.
const BASE = 'http://next.invalid'

export function sanitizeNext(raw, fallback = DEFAULT_NEXT) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    return fallback
  }
  // Must be a path: one leading "/", and not "//" (protocol-relative) or
  // "/\" (browsers treat a backslash as a slash).
  if (raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return fallback
  // Control characters (tab/newline are stripped by URL parsers and can
  // smuggle a second slash) and backslashes anywhere.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback

  let url
  try {
    url = new URL(raw, BASE)
  } catch {
    return fallback
  }
  if (url.origin !== BASE || !url.pathname.startsWith('/')) return fallback
  if (
    AUTH_PATHS.some(
      (p) => url.pathname === p || url.pathname.startsWith(`${p}/`)
    )
  ) {
    return fallback
  }
  // The parser's normalised form (resolves "/./", "/a/../b", encodes spaces).
  return `${url.pathname}${url.search}${url.hash}`
}

// "/login?next=<path+query>" for a page that needs a session. The default
// page is omitted so a plain sign-in stays a plain /login.
export function buildLoginPath(next) {
  const safe = sanitizeNext(next, null)
  return safe && safe !== DEFAULT_NEXT
    ? `/login?next=${encodeURIComponent(safe)}`
    : '/login'
}

// Short friendly line for the sign-in page, based on where they were going.
export function nextMessage(next) {
  const safe = sanitizeNext(next, null)
  if (!safe) return null
  const path = new URL(safe, BASE).pathname
  if (path === '/shop') return 'Sign in to continue to the shop.'
  if (path === '/profile/edit') return 'Sign in to edit your profile.'
  if (path === '/payment-status') return 'Sign in to see your payment status.'
  if (path === '/history' || path.startsWith('/runs'))
    return 'Sign in to see your runs.'
  return 'Sign in to continue.'
}
