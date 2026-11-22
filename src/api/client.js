import {
  MAX_UPLOAD_BYTES,
  compressFormDataImages,
  formDataFileBytes,
} from '../utils/imageCompress'
import { googleSignOut } from '../utils/googleSession'
import { buildLoginPath } from '../utils/safeNext'
import {
  TOKEN_KEY,
  USER_KEY,
  mirrorRemove,
  mirrorSet,
} from '../utils/authStorage'
import { tokenExpiryMs } from '../utils/jwtExpiry'

const PRIMARY_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
const FALLBACK_API_BASE_URL = import.meta.env.VITE_API_FALLBACK_URL || ''
const FILE_BASE_URL = import.meta.env.VITE_FILE_BASE_URL || PRIMARY_API_BASE_URL
const ACTIVE_BASE_URL_KEY = 'fahhkit_active_api_base_url'

function getCandidateBaseUrls() {
  const candidates = [PRIMARY_API_BASE_URL, FALLBACK_API_BASE_URL].filter(
    (url, index, arr) => url && arr.indexOf(url) === index
  )
  const cached = sessionStorage.getItem(ACTIVE_BASE_URL_KEY)
  if (cached && candidates.includes(cached)) {
    return [cached, ...candidates.filter((url) => url !== cached)]
  }
  return candidates
}

// Tries each configured API server in turn, falling back to the next one
// only on a network-level failure (server unreachable), not on HTTP error
// responses. Remembers whichever one last worked so subsequent calls don't
// re-probe a dead server every time.
async function fetchWithFallback(path, options) {
  const candidates = getCandidateBaseUrls()
  let lastError
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options)
      sessionStorage.setItem(ACTIVE_BASE_URL_KEY, baseUrl)
      return response
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

// Whichever API server last answered (see fetchWithFallback) - the STOMP
// socket (useGameSocket) has to connect to that same host, not blindly to
// the primary one, or a dev session on the fallback API would never hear
// anything.
export function getActiveApiBaseUrl() {
  return getCandidateBaseUrls()[0] || PRIMARY_API_BASE_URL
}

export function resolveFileUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${FILE_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

// The app calls club roles Captain / Vice-Captain; the backend's messages
// still say leader / co-leader (and "leadership"). Reword them on the way in
// so every error the player sees uses the game's names. "leaderboard" is
// left alone.
const CLUB_ROLE_WORDS = [
  [/\bco[- ]?leaders\b/gi, 'vice-captains'],
  [/\bco[- ]?leader\b/gi, 'vice-captain'],
  [/\bleadership\b/gi, 'captaincy'],
  [/\bleaders\b/gi, 'captains'],
  [/\bleader\b/gi, 'captain'],
]

export function toClubRoleWords(text) {
  if (typeof text !== 'string') return text
  return CLUB_ROLE_WORDS.reduce(
    (out, [pattern, word]) =>
      out.replace(pattern, (match) =>
        match[0] === match[0].toUpperCase()
          ? word.replace(/(^|-)(\w)/g, (_, sep, c) => sep + c.toUpperCase())
          : word
      ),
    text
  )
}

export class ApiError extends Error {
  constructor(message, status) {
    super(toClubRoleWords(message))
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

// Pages that need a session (RequireAuth) re-check it when this fires, so a
// sign-out or an expired/rejected token in THIS tab redirects them at once,
// and the browser's own `storage` event covers a sign-out in ANOTHER tab.
export const AUTH_CHANGED_EVENT = 'fahhkit:auth-changed'

function notifyAuthChanged() {
  try {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  } catch {
    // No window (tests, SSR) - nothing is listening.
  }
}

export function subscribeAuth(onChange) {
  const onStorage = (e) => {
    if (e.key === null || e.key === TOKEN_KEY) onChange()
  }
  window.addEventListener(AUTH_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
  mirrorSet(TOKEN_KEY, token)
  logTokenExpiry(token, 'new token')
  notifyAuthChanged()
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  mirrorRemove(TOKEN_KEY)
  notifyAuthChanged()
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

export function setUser(user) {
  const raw = JSON.stringify(user)
  localStorage.setItem(USER_KEY, raw)
  mirrorSet(USER_KEY, raw)
}

export function clearUser() {
  localStorage.removeItem(USER_KEY)
  mirrorRemove(USER_KEY)
}

// Everything stored on this device that belongs to the signed-in player.
// Device settings (sound/music, theme, map style, anti-cheat toggles) and
// the per-user dismissed-broadcast list are deliberately kept.
const USER_SCOPED_KEYS = [
  TOKEN_KEY,
  USER_KEY,
  'fahhkit_active_run',
  'fahhkit_territory_avatar_id',
  'fahhkit_seen_medal_ids',
  'fahhkit_pvp_discoverable',
]
const USER_SCOPED_PREFIXES = [
  'fahhkit_club_war_last_',
  'fahhkit_tracked_events_',
]

// Synchronous, idempotent wipe of the signed-in player's local state. Used by
// logout, the 401 auto-logout and the start of every sign-in.
export function clearSession() {
  try {
    USER_SCOPED_KEYS.forEach((key) => localStorage.removeItem(key))
    Object.keys(localStorage)
      .filter((key) => USER_SCOPED_PREFIXES.some((p) => key.startsWith(p)))
      .forEach((key) => localStorage.removeItem(key))
    sessionStorage.clear()
  } catch {
    // Storage unavailable - nothing to clear.
  }
  mirrorRemove(TOKEN_KEY)
  mirrorRemove(USER_KEY)
  notifyAuthChanged()
}

export function canManageEvents(user) {
  return user?.userType === 'ADMIN' || user?.userType === 'MODERATOR'
}

export function isAdmin(user) {
  return user?.userType === 'ADMIN'
}

// Navbar and LiveEventRunPrompt both call useCurrentUser() on every page
// (LiveEventRunPrompt is mounted globally in App.jsx, outside <Routes>), so a
// stale/expired token sitting in localStorage can make one of those
// background find/logged-in calls 401 on ANY page — including one the user
// was just client-side-navigated to mid-flow (e.g. LoginPage sending a
// first-time moderator to /update-password). A hard redirect here must never
// fire on the auth pages themselves, or it stomps that navigation (and the
// router state it carried) with a full reload back to /login.
const AUTH_FLOW_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/update-password',
]

function authHeaders(token = getToken()) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---------------------------------------------------------------------------
// Session recovery. A 401/403 on a request that carried a token used to wipe
// the session and hard-reload to /login on the spot. That logged players out
// for things that are not a dead session (a 403 on an action they may not do,
// a token the server rejected a moment before a refresh landed, ...). Now:
//   1. refresh the token once (single flight: parallel requests that hit a 401
//      all wait on that one refresh, then retry with the new token),
//   2. if it can't be refreshed, ask the server directly whether the session
//      is alive (GET /v1/user/find/logged-in) - the backend answers an
//      unauthenticated call with 403, the same as a forbidden action, so the
//      status alone can't tell them apart,
//   3. only a session the server confirms dead ends in sign-out.
// Network errors, timeouts and 5xx never sign anyone out.
// ---------------------------------------------------------------------------
const ME_PATH = '/v1/user/find/logged-in'
// Backend token refresh (POST, Bearer = current token, answers like
// /v1/authenticate: {data:{tokenId}}). The backend does not have it yet - a
// 404 is remembered for the session and the flow falls through to the probe.
// Set VITE_AUTH_REFRESH_PATH to '' to switch refresh off entirely.
const REFRESH_PATH =
  import.meta.env.VITE_AUTH_REFRESH_PATH ?? '/v1/auth/refresh'
// Requests made while signed OUT / signing in: a 401/403 there is a wrong
// password etc., never a dead session.
const NO_RECOVERY_PREFIXES = [
  '/v1/authenticate',
  '/v1/auth/',
  '/v1/user/forgot-password',
]

export function describeTokenExpiry(token, now = Date.now()) {
  const exp = tokenExpiryMs(token)
  if (exp == null) return 'no readable expiry'
  const mins = Math.round((exp - now) / 60000)
  return `expires ${new Date(exp).toISOString()} (${
    mins >= 0 ? `in ${mins} min` : `${-mins} min ago`
  })`
}

export function logTokenExpiry(token, label = 'token') {
  console.info(`[auth] ${label}: ${describeTokenExpiry(token)}`)
}

// One line per redirect to login / sign-out, with the reason.
export function logAuthRedirect(reason, detail) {
  console.warn(`[auth] redirect to login - ${reason}`, detail ?? '')
}

let refreshUnsupported = false
let refreshInFlight = null

export function isRefreshSupported() {
  return Boolean(REFRESH_PATH) && !refreshUnsupported
}

// -> 'refreshed' | 'unsupported' | 'rejected' | 'unreachable'
async function doRefresh(tokenUsed) {
  if (!isRefreshSupported() || !tokenUsed) return 'unsupported'
  let response
  try {
    response = await fetchWithFallback(REFRESH_PATH, {
      method: 'POST',
      headers: authHeaders(tokenUsed),
    })
  } catch {
    return 'unreachable'
  }
  if ([404, 405, 501].includes(response.status)) {
    refreshUnsupported = true
    console.info('[auth] backend has no token refresh endpoint')
    return 'unsupported'
  }
  if (response.status === 401 || response.status === 403) return 'rejected'
  if (!response.ok) return 'unreachable'
  const body = await response.json().catch(() => null)
  const next = body?.data?.tokenId
  if (!next) return 'unsupported'
  // The player signed out / in as someone else meanwhile: drop the result.
  if (getToken() === tokenUsed) setToken(next)
  console.info('[auth] token refreshed')
  return 'refreshed'
}

// Single flight: every caller during a refresh gets the same answer.
export function refreshSession(tokenUsed = getToken()) {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh(tokenUsed).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

// -> 'alive' | 'dead' | 'unknown'
async function probeSession(token) {
  try {
    const response = await fetchWithFallback(ME_PATH, {
      headers: authHeaders(token),
    })
    if (response.ok) return 'alive'
    if (response.status === 401 || response.status === 403) return 'dead'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

const verifying = new Map()

// -> 'retry' (a newer token exists - resend), 'dead', 'alive', 'unknown' or
// 'gone' (already signed out meanwhile).
async function doVerify(tokenUsed, conclusive) {
  const current = getToken()
  if (current !== tokenUsed) return current ? 'retry' : 'gone'
  const refreshed = await refreshSession(tokenUsed)
  if (refreshed === 'refreshed') return 'retry'
  const exp = tokenExpiryMs(tokenUsed)
  if (exp != null && exp <= Date.now()) return 'dead'
  if (refreshed === 'rejected' || conclusive) return 'dead'
  return probeSession(tokenUsed)
}

function verifySession(tokenUsed, conclusive) {
  if (!verifying.has(tokenUsed)) {
    verifying.set(
      tokenUsed,
      doVerify(tokenUsed, conclusive).finally(() => verifying.delete(tokenUsed))
    )
  }
  return verifying.get(tokenUsed)
}

// The session is confirmed dead: wipe it and show sign-in again. In the
// native app the in-game auth gate is reactive (useCurrentUser subscribes to
// the token), so no page reload - the reload is what used to look like a
// "redirect to login loop". On the website, send them to the login page.
function endSession(reason, detail) {
  logAuthRedirect(reason, detail)
  clearSession()
  googleSignOut()
  if (import.meta.env.VITE_APP_SHELL === 'true') return
  if (
    !AUTH_FLOW_PATHS.some((path) => window.location.pathname.startsWith(path))
  ) {
    window.location.href = buildLoginPath(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    )
  }
}

async function parseResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      body?.errorMessage || 'Something went wrong. Please try again.',
      response.status
    )
  }
  return body?.data
}

// Every API call goes through here.
async function request(path, { method, headers = {}, body, unreachable }) {
  const sent = getToken()
  const send = (token) =>
    fetchWithFallback(path, {
      method,
      headers: { ...headers, ...authHeaders(token) },
      ...(body === undefined ? {} : { body }),
    }).catch(() => {
      throw new ApiError(unreachable, 0)
    })

  const response = await send(sent)
  const rejected = response.status === 401 || response.status === 403
  if (
    !rejected ||
    !sent ||
    NO_RECOVERY_PREFIXES.some((p) => path.startsWith(p))
  ) {
    return parseResponse(response)
  }

  console.warn(
    `[auth] ${response.status} ${method} ${path} - token ${describeTokenExpiry(sent)}`
  )
  const verdict = await verifySession(sent, path === ME_PATH)
  if (verdict === 'retry') return parseResponse(await send(getToken()))
  if (verdict === 'dead') {
    endSession(`server rejected the session (${response.status} on ${path})`)
  }
  // 'alive' / 'unknown' / 'gone': a plain error for this call, session kept.
  return parseResponse(response)
}

const UNREACHABLE = 'Could not reach the server. Please try again in a moment.'

export async function postForm(path, rawFormData) {
  const formData = await compressFormDataImages(rawFormData)
  const fileBytes = formDataFileBytes(formData)
  if (fileBytes > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      'Those images are too chunky for the server — try smaller photos (under ~1 MB total).',
      413
    )
  }
  return request(path, {
    method: 'POST',
    body: formData,
    // An over-size body gets a CORS-less 413 from nginx, which the browser
    // reports as a network failure — so hint at size when files were sent.
    unreachable:
      fileBytes > 0
        ? 'Could not upload — the server may have rejected the image size. Try a smaller photo.'
        : UNREACHABLE,
  })
}

export function postJson(path, payload) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    unreachable: UNREACHABLE,
  })
}

export function getJson(path) {
  return request(path, { method: 'GET', unreachable: UNREACHABLE })
}

export function putJson(path, payload) {
  return request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    unreachable: UNREACHABLE,
  })
}

export function deleteJson(path) {
  return request(path, { method: 'DELETE', unreachable: UNREACHABLE })
}

// Fire-and-forget GET for tracking pings (banner clicks): never awaited by
// the caller, never throws, survives the page/app navigating away
// (keepalive), and doesn't follow redirects (redirect: 'manual') - the
// tracked-redirect endpoint answers 302 to a third-party site that has no
// CORS headers; the server-side count has already happened by then.
export function pingGet(path) {
  try {
    fetch(`${getActiveApiBaseUrl()}${path}`, {
      method: 'GET',
      headers: { ...authHeaders() },
      keepalive: true,
      redirect: 'manual',
    }).catch(() => {})
  } catch {
    // Tracking must never break the tap that triggered it.
  }
}
