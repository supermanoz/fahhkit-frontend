// Every message a player can see after a failed sign-in / sign-up / forgot /
// reset attempt lives in THIS file - nothing else in the app should show a
// plugin error, a numeric code or raw server text on an auth screen.
//
//   describeAuthError(err, { flow }) -> { message, kind, silent, reason }
//     message  friendly one-liner (null when silent)
//     kind     'error' (real blocking failure, e.g. wrong password) or
//              'warning' (help/try-again; shown in amber)
//     silent   true for "the player cancelled" - show nothing at all
//     reason   machine-readable bucket (tests / analytics-free branching)
//
//   logAuthError(flow, err)  technical detail to console.warn only - codes,
//                            status, a truncated message with anything that
//                            looks like a token removed.
//
// The server (see FahhKit's AuthErrorCode / UserErrorCode / OAuthErrorCode)
// sends only human-readable message text - no machine code survives
// api/client.js's ApiError - so the known server cases are recognised by
// their message wording below. Anything unrecognised becomes the generic
// line instead of being passed through.
import { ApiError } from '../api/client'

export const AUTH_FLOW = Object.freeze({
  SIGN_IN: 'signIn',
  GOOGLE: 'google',
  APPLE: 'apple',
  SIGN_UP: 'signUp',
  FORGOT: 'forgot',
  SET_PASSWORD: 'setPassword',
})

export const REASON = Object.freeze({
  CANCELLED: 'cancelled',
  NETWORK: 'network',
  PROVIDER: 'provider',
  CONFLICT: 'conflict',
  CREDENTIALS: 'credentials',
  OLD_PASSWORD: 'oldPassword',
  NOT_FOUND: 'notFound',
  USES_PROVIDER: 'usesProvider',
  MOBILE_TAKEN: 'mobileTaken',
  TOO_MANY: 'tooMany',
  UNKNOWN: 'unknown',
})

const PROVIDER_NAME = {
  [AUTH_FLOW.GOOGLE]: 'Google',
  [AUTH_FLOW.APPLE]: 'Apple',
}

export const MESSAGES = Object.freeze({
  network: "Can't reach the game. Check your connection and try again.",
  provider: (provider) =>
    `${provider} sign-in isn't working right now. Try email sign-in or try again later.`,
  conflict: 'This email already has an account. Sign in with email instead.',
  credentials: "Email or password doesn't match. Try again.",
  oldPassword:
    "That emailed password doesn't match. Check the email and try again.",
  notFound:
    "We couldn't find an account with that email or mobile number. Check it and try again.",
  usesProvider:
    'This account signs in with Google or Apple. Use that button instead.',
  mobileTaken:
    'That mobile number is already registered. Try signing in instead.',
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  cooldown: (seconds) => `Too many attempts. Try again in ${seconds}s.`,
  unknown: 'Something went wrong. Please try again.',
  passwordUpdated: 'Password updated! Sign in with your new password.',
})

// Short messages shown NEXT TO a field (client-side validation).
export const FIELD_MESSAGES = Object.freeze({
  identifierRequired: 'Enter your email or mobile number.',
  identifierInvalid: 'Enter a valid email or mobile number.',
  passwordRequired: 'Enter your password.',
  emailedPasswordRequired: 'Enter the password from the email.',
  newPasswordRequired: 'Choose a new password.',
  newPasswordWeak: 'Use 8+ characters with a letter and a number.',
  confirmRequired: 'Type your new password again.',
  confirmMismatch: "Passwords don't match.",
  countryRequired: 'Pick your country.',
  birthDateRequired: 'Enter your date of birth.',
})

// ---- classification helpers ------------------------------------------------

// Play Services 12501 / 12502 (cancelled / already in progress), Google
// Sign-In iOS -5 (kGIDSignInErrorCodeCanceled), ASAuthorization 1001, and the
// web popup being closed.
const CANCEL_CODES = new Set([-5, 12501, 12502, 1001])

function codeOf(err) {
  const raw = err?.code ?? err?.status
  const n = Number.parseInt(String(raw ?? '').trim(), 10)
  return Number.isFinite(n) ? n : null
}

function textOf(err) {
  return String(err?.message ?? err?.error ?? err ?? '')
}

export function isCancelled(err) {
  if (!err || err instanceof ApiError) return false
  const code = codeOf(err)
  if (code != null && CANCEL_CODES.has(code)) return true
  const text = `${err?.code ?? ''} ${textOf(err)}`
  return /cancel+ed|cancelled|popup[_ ]closed|user closed|dismissed|\b1001\b|\b12501\b/i.test(
    text
  )
}

function isNetwork(err) {
  if (err instanceof ApiError) return err.status === 0
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return true
  const code = codeOf(err)
  // Play Services NETWORK_ERROR (7) / TIMEOUT (15).
  if (code === 7 || code === 15) return true
  return /failed to fetch|network ?error|load failed|timed? ?out|timeout|offline|econn/i.test(
    `${err?.name ?? ''} ${textOf(err)}`
  )
}

const text = (err) => (err instanceof ApiError ? err.message : '')

function result(reason, message, kind = 'warning') {
  return { reason, message, kind, silent: false }
}

export function describeAuthError(err, { flow = AUTH_FLOW.SIGN_IN } = {}) {
  const provider = PROVIDER_NAME[flow]

  if (provider && isCancelled(err)) {
    return {
      reason: REASON.CANCELLED,
      message: null,
      kind: 'warning',
      silent: true,
    }
  }
  if (isNetwork(err)) return result(REASON.NETWORK, MESSAGES.network)

  // Google / Apple: anything that isn't a conflict is "the provider isn't
  // working" - a bad/expired token, a setup mistake, a plugin failure.
  if (provider) {
    const server = text(err)
    if (
      (err instanceof ApiError && err.status === 409) ||
      /already exists with this email|already (registered|exists)/i.test(server)
    ) {
      return result(REASON.CONFLICT, MESSAGES.conflict)
    }
    return result(REASON.PROVIDER, MESSAGES.provider(provider))
  }

  if (err instanceof ApiError) {
    const server = err.message
    if (err.status === 429) return result(REASON.TOO_MANY, MESSAGES.tooMany)
    if (/signed up with google\/apple|no password set/i.test(server)) {
      return result(REASON.USES_PROVIDER, MESSAGES.usesProvider)
    }
    // Duplicate account on sign-up - the server words these several ways
    // ("Email is already registered!", "An account with this email already
    // exists.", a bare 409...), so match on meaning, not exact text.
    const duplicate =
      err.status === 409 ||
      /already (registered|exists|used|taken)|duplicate/i.test(server)
    if (duplicate && /mobile|phone/i.test(server)) {
      return result(REASON.MOBILE_TAKEN, MESSAGES.mobileTaken)
    }
    if (duplicate && flow === AUTH_FLOW.SIGN_UP) {
      return result(REASON.CONFLICT, MESSAGES.conflict)
    }
    const wrong =
      /given credential is wrong|does not exist|invalid (credentials|password)|bad credentials/i.test(
        server
      )
    if (wrong) {
      if (flow === AUTH_FLOW.FORGOT)
        return result(REASON.NOT_FOUND, MESSAGES.notFound)
      if (flow === AUTH_FLOW.SET_PASSWORD)
        return result(REASON.OLD_PASSWORD, MESSAGES.oldPassword, 'error')
      // Same line whether the account or the password was wrong - never
      // reveal which.
      return result(REASON.CREDENTIALS, MESSAGES.credentials, 'error')
    }
  }
  return result(REASON.UNKNOWN, MESSAGES.unknown)
}

// ---- logging ---------------------------------------------------------------

const TOKEN_LIKE = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g

// Technical detail for developers: console only, never shown. Codes and a
// short message with anything token-shaped stripped; never the raw object
// (plugin results can carry ID tokens / emails).
export function logAuthError(flow, err) {
  const detail = {
    flow,
    name: err?.name,
    code: err?.code ?? null,
    status: err instanceof ApiError ? err.status : null,
    message: textOf(err).replace(TOKEN_LIKE, '[token]').slice(0, 200),
  }
  console.warn('[auth]', detail)
  return detail
}
