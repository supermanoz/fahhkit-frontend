import {
  MAX_UPLOAD_BYTES,
  compressFormDataImages,
  formDataFileBytes,
} from '../utils/imageCompress'

const PRIMARY_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
const FALLBACK_API_BASE_URL = import.meta.env.VITE_API_FALLBACK_URL || ''
const FILE_BASE_URL = import.meta.env.VITE_FILE_BASE_URL || PRIMARY_API_BASE_URL
const TOKEN_KEY = 'fahhkit_token'
const USER_KEY = 'fahhkit_user'
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

export function resolveFileUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${FILE_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearUser() {
  localStorage.removeItem(USER_KEY)
}

export function canManageEvents(user) {
  return user?.userType === 'ADMIN' || user?.userType === 'MODERATOR'
}

export function isAdmin(user) {
  return user?.userType === 'ADMIN'
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
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

// A 401/403 on a request that carried a token means the session itself is
// dead (expired/revoked), not just "this action is forbidden". Clear the
// stale session and send the user to sign in again, rather than leaving the
// navbar showing a cached user while every page silently fails.
function handleAuthFailure(status, hadToken) {
  if (hadToken && (status === 401 || status === 403)) {
    clearToken()
    clearUser()
    if (
      !AUTH_FLOW_PATHS.some((path) => window.location.pathname.startsWith(path))
    ) {
      window.location.href = '/login'
    }
  }
}

async function parseResponse(response, hadToken) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    handleAuthFailure(response.status, hadToken)
    throw new ApiError(
      body?.errorMessage || 'Something went wrong. Please try again.',
      response.status
    )
  }
  return body?.data
}

export async function postForm(path, rawFormData) {
  const hadToken = Boolean(getToken())
  const formData = await compressFormDataImages(rawFormData)
  const fileBytes = formDataFileBytes(formData)
  if (fileBytes > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      'Those images are too chunky for the server — try smaller photos (under ~1 MB total).',
      413
    )
  }
  let response
  try {
    response = await fetchWithFallback(path, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: formData,
    })
  } catch {
    // An over-size body gets a CORS-less 413 from nginx, which the browser
    // reports as a network failure — so hint at size when files were sent.
    throw new ApiError(
      fileBytes > 0
        ? 'Could not upload — the server may have rejected the image size. Try a smaller photo.'
        : 'Could not reach the server. Please try again in a moment.',
      0
    )
  }
  return parseResponse(response, hadToken)
}

export async function postJson(path, payload) {
  const hadToken = Boolean(getToken())
  let response
  try {
    response = await fetchWithFallback(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new ApiError(
      'Could not reach the server. Please try again in a moment.',
      0
    )
  }
  return parseResponse(response, hadToken)
}

export async function getJson(path) {
  const hadToken = Boolean(getToken())
  let response
  try {
    response = await fetchWithFallback(path, {
      headers: { ...authHeaders() },
    })
  } catch {
    throw new ApiError(
      'Could not reach the server. Please try again in a moment.',
      0
    )
  }
  return parseResponse(response, hadToken)
}

export async function deleteJson(path) {
  const hadToken = Boolean(getToken())
  let response
  try {
    response = await fetchWithFallback(path, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    })
  } catch {
    throw new ApiError(
      'Could not reach the server. Please try again in a moment.',
      0
    )
  }
  return parseResponse(response, hadToken)
}
