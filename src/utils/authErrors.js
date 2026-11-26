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
  UNAVAILABLE: 'unavailable',
  NO_ACCOUNT: 'noAccount',
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
  // Google/Apple setup problem on our side (Play Services 10 DEVELOPER_ERROR,
  // 12500 SIGN_IN_FAILED, 8 INTERNAL_ERROR): nothing the player can fix.
  signInUnavailable:
    'Sign-in is temporarily unavailable. Please try again later or use email sign-in.',
  noGoogleAccount:
    'No Google account found on this device. Add one in your phone settings, or use email sign-in.',
  appleFailed: 'Apple sign-in failed. Try again or use another sign-in method.',
  appleUnavailable:
    "Apple sign-in isn't available right now. Please use another method.",
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

// Play Services / Google Sign-In codes the native plugin hands back as
// err.code (a string like "10"). Names are for the dev log only - the player
// never sees them.
const NATIVE_CODE_NAMES = Object.freeze({
  7: 'NETWORK_ERROR',
  8: 'INTERNAL_ERROR',
  10: 'DEVELOPER_ERROR',
  15: 'TIMEOUT',
  16: 'NO_ACCOUNTS',
  12500: 'SIGN_IN_FAILED',
  12501: 'SIGN_IN_CANCELLED',
  12502: 'SIGN_IN_CURRENTLY_IN_PROGRESS',
  [-5]: 'GID_CANCELED',
  1001: 'ASAUTH_CANCELED',
})
// Our-side configuration/setup failures: wrong SHA-1 / client id / consent
// screen. Retrying never helps and the player can't fix it.
const GOOGLE_CONFIG_CODES = new Set([8, 10, 12500])
const GOOGLE_NO_ACCOUNT_CODES = new Set([16])

export function nativeCodeName(err) {
  const n = codeOf(err)
  return n == null ? null : (NATIVE_CODE_NAMES[n] ?? null)
}

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

// The Apple endpoint isn't there (404/405/501/503) or the server says the
// Apple client id / provider isn't configured.
const APPLE_UNAVAILABLE_STATUS = new Set([404, 405, 501, 503])
const APPLE_NOT_CONFIGURED =
  /(apple|client[ _-]?id|provider|oauth)[^\n]{0,60}(not (been )?(set|configured|enabled)|missing|unavailable|disabled|(not )?supported)|(not (set|configured)|missing)[^\n]{0,40}(apple|client[ _-]?id|provider)/i
function appleUnavailable(err) {
  if (!(err instanceof ApiError)) return false
  return (
    APPLE_UNAVAILABLE_STATUS.has(err.status) ||
    APPLE_NOT_CONFIGURED.test(err.message)
  )
}

// Backend OAuth codes (errorCode) for an Apple token that was refused: bad
// nonce, wrong audience, expired or malformed. One friendly line for all.
const APPLE_TOKEN_CODES = new Set([
  'NONCE_MISMATCH',
  'AUDIENCE_MISMATCH',
  'TOKEN_EXPIRED',
  'MALFORMED_TOKEN',
])

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

  // Native Google plugin failures (never an ApiError): setup problems and
  // "no account on the device" get their own calm line.
  if (flow === AUTH_FLOW.GOOGLE && err && !(err instanceof ApiError)) {
    const n = codeOf(err)
    if (n != null && GOOGLE_CONFIG_CODES.has(n))
      return result(REASON.UNAVAILABLE, MESSAGES.signInUnavailable)
    if (n != null && GOOGLE_NO_ACCOUNT_CODES.has(n))
      return result(REASON.NO_ACCOUNT, MESSAGES.noGoogleAccount)
  }

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
    if (flow === AUTH_FLOW.APPLE) {
      // Endpoint missing / provider not set up on the server: one calm line.
      if (appleUnavailable(err)) {
        return result(REASON.UNAVAILABLE, MESSAGES.appleUnavailable)
      }
      if (err instanceof ApiError && APPLE_TOKEN_CODES.has(err.errorCode)) {
        return result(REASON.PROVIDER, MESSAGES.appleFailed)
      }
      // Anything else (plugin failure, 500...): never raw text.
      return result(REASON.UNKNOWN, MESSAGES.unknown)
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
function nativeLabel(err) {
  const n = codeOf(err)
  if (n == null || err instanceof ApiError) return null
  const name = NATIVE_CODE_NAMES[n]
  return name ? `${n} ${name}` : String(n)
}

export function logAuthError(flow, err) {
  const detail = {
    flow,
    name: err?.name,
    code: err?.code ?? null,
    // e.g. "10 DEVELOPER_ERROR" - the first thing to read in logcat / the
    // Safari inspector when "can't sign in" is reported.
    native: nativeLabel(err),
    status: err instanceof ApiError ? err.status : null,
    errorCode: err instanceof ApiError ? err.errorCode : null,
    message: textOf(err).replace(TOKEN_LIKE, '[token]').slice(0, 200),
  }
  console.warn('[auth]', detail)
  return detail
}
