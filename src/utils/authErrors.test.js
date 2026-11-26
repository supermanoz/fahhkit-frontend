import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import {
  AUTH_FLOW,
  FIELD_MESSAGES,
  MESSAGES,
  REASON,
  describeAuthError,
  isCancelled,
  logAuthError,
} from './authErrors'

const plugin = (code, message = 'Something went wrong') =>
  Object.assign(new Error(message), { code: String(code) })

afterEach(() => vi.restoreAllMocks())

describe('cancelled sign-in is silent', () => {
  it.each([
    ['Google Android 12501', plugin(12501), AUTH_FLOW.GOOGLE],
    [
      'Google iOS -5',
      plugin(-5, 'The user canceled the sign-in flow.'),
      AUTH_FLOW.GOOGLE,
    ],
    ['Apple 1001', plugin(1001), AUTH_FLOW.APPLE],
    [
      'Apple message only',
      new Error(
        'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)'
      ),
      AUTH_FLOW.APPLE,
    ],
    ['web popup closed', new Error('popup_closed_by_user'), AUTH_FLOW.GOOGLE],
  ])('%s', (_name, err, flow) => {
    const r = describeAuthError(err, { flow })
    expect(r.silent).toBe(true)
    expect(r.message).toBeNull()
    expect(r.reason).toBe(REASON.CANCELLED)
  })

  it('never treats a server error as a cancel', () => {
    expect(isCancelled(new ApiError('cancelled by admin', 400))).toBe(false)
  })
})

describe('no internet / timeout', () => {
  it.each([
    ['ApiError status 0', new ApiError('x', 0)],
    ['fetch failure', new TypeError('Failed to fetch')],
    ['Safari fetch failure', new TypeError('Load failed')],
    ['Play Services NETWORK_ERROR', plugin(7)],
    ['timeout', new Error('Export timed out')],
  ])('%s', (_n, err) => {
    for (const flow of Object.values(AUTH_FLOW)) {
      const r = describeAuthError(err, { flow })
      expect(r.reason).toBe(REASON.NETWORK)
      expect(r.message).toBe(MESSAGES.network)
      expect(r.kind).toBe('warning')
    }
  })

  it('a programming TypeError is NOT reported as a network problem', () => {
    const r = describeAuthError(
      new TypeError("Cannot read properties of undefined (reading 'x')")
    )
    expect(r.reason).toBe(REASON.UNKNOWN)
  })
})

describe('Google / Apple setup or token problems', () => {
  it('plugin codes and the old technical wording never reach the player', () => {
    for (const code of [10, 12500, 16, 8, 9999]) {
      const r = describeAuthError(plugin(code), { flow: AUTH_FLOW.GOOGLE })
      expect(r.message).toBeTruthy()
      expect(r.message).not.toMatch(/code|\d{2,}/i)
    }
    const apple = describeAuthError(plugin(1000), { flow: AUTH_FLOW.APPLE })
    // Apple: a plugin failure is the generic line, never provider wording.
    expect(apple.message).toBe(MESSAGES.unknown)
  })
  it('Apple: missing endpoint or unconfigured provider is "not available"', () => {
    for (const status of [404, 405, 501, 503]) {
      const r = describeAuthError(new ApiError('Not Found', status), {
        flow: AUTH_FLOW.APPLE,
      })
      expect(r.reason).toBe(REASON.UNAVAILABLE)
      expect(r.message).toBe(MESSAGES.appleUnavailable)
    }
    for (const msg of [
      'Apple client id is not configured',
      'apple.oauth.client.ids not set',
      'OAuth provider is not configured!',
    ]) {
      const r = describeAuthError(new ApiError(msg, 400), {
        flow: AUTH_FLOW.APPLE,
      })
      expect(r.message).toBe(MESSAGES.appleUnavailable)
      expect(r.message).not.toMatch(/client|oauth|configured/i)
    }
  })
  it('Apple: other failures are generic and never leak server text or tokens', () => {
    const leaky = new ApiError(
      'java.lang.NullPointerException at x.y eyJhbGciOi.eyJzdWIi.sig',
      500
    )
    const r = describeAuthError(leaky, { flow: AUTH_FLOW.APPLE })
    expect(r.reason).toBe(REASON.UNKNOWN)
    expect(r.message).toBe(MESSAGES.unknown)
    expect(r.message).not.toMatch(/java|eyJ|NullPointer/)
  })
  it('Apple: a cancelled sheet is silent', () => {
    const r = describeAuthError(plugin(1001), { flow: AUTH_FLOW.APPLE })
    expect(r.silent).toBe(true)
    expect(r.message).toBeNull()
  })
  it('Google keeps its own provider line', () => {
    expect(
      describeAuthError(new ApiError('Not Found', 404), {
        flow: AUTH_FLOW.GOOGLE,
      }).message
    ).toBe(MESSAGES.provider('Google'))
  })
  it('server rejecting the token (401/403/400/500) is the same friendly line', () => {
    for (const status of [400, 401, 403, 500]) {
      const r = describeAuthError(
        new ApiError('The provided token has expired!', status),
        {
          flow: AUTH_FLOW.GOOGLE,
        }
      )
      expect(r.reason).toBe(REASON.PROVIDER)
      expect(r.message).not.toMatch(/token|expired|401|403/i)
    }
  })
  it('a missing token (plain Error) is the provider line', () => {
    expect(
      describeAuthError(new Error('Google returned no sign-in token.'), {
        flow: AUTH_FLOW.GOOGLE,
      }).reason
    ).toBe(REASON.PROVIDER)
  })
})

describe('account conflict', () => {
  it('OAuth: backend EMAIL_NOT_VERIFIED wording and 409', () => {
    const msg =
      "An account already exists with this email, but it isn't verified with this provider. Please verify your email..."
    expect(
      describeAuthError(new ApiError(msg, 400), { flow: AUTH_FLOW.GOOGLE })
        .message
    ).toBe(MESSAGES.conflict)
    expect(
      describeAuthError(new ApiError('x', 409), { flow: AUTH_FLOW.APPLE })
        .message
    ).toBe(MESSAGES.conflict)
  })
  it('sign-up: duplicate email / mobile', () => {
    const email = describeAuthError(
      new ApiError(
        'Email is already registered! If this is your email, reach out to us.',
        400
      ),
      { flow: AUTH_FLOW.SIGN_UP }
    )
    expect(email.message).toBe(MESSAGES.conflict)
    const mobile = describeAuthError(
      new ApiError(
        'Mobile number already registered! If this is your number, reach out to us.',
        400
      ),
      { flow: AUTH_FLOW.SIGN_UP }
    )
    expect(mobile.message).toBe(MESSAGES.mobileTaken)
  })
  it('sign-up: any 409 / "already exists" wording is a conflict (mobile is told apart)', () => {
    const email = describeAuthError(
      new ApiError('An account with this email already exists.', 409),
      { flow: AUTH_FLOW.SIGN_UP }
    )
    expect(email.message).toBe(MESSAGES.conflict)
    const mobile = describeAuthError(
      new ApiError('An account with this mobile number already exists.', 409),
      { flow: AUTH_FLOW.SIGN_UP }
    )
    expect(mobile.message).toBe(MESSAGES.mobileTaken)
    expect(
      describeAuthError(new ApiError('x', 409), { flow: AUTH_FLOW.SIGN_UP })
        .message
    ).toBe(MESSAGES.conflict)
  })
  it('a password account hit with no password set points to Google/Apple', () => {
    const r = describeAuthError(
      new ApiError(
        'This account signed up with Google/Apple and has no password set!',
        400
      )
    )
    expect(r.reason).toBe(REASON.USES_PROVIDER)
  })
})

describe('wrong email / password', () => {
  it('both backend wordings give the same line (never says which is wrong)', () => {
    const a = describeAuthError(new ApiError('Given credential is wrong!', 400))
    const b = describeAuthError(
      new ApiError('Mobile Number or Email does not exist!', 400)
    )
    expect(a.message).toBe(MESSAGES.credentials)
    expect(b.message).toBe(MESSAGES.credentials)
    expect(a.kind).toBe('error') // the one real blocking error -> red tint
  })
  it('reset flow: wrong emailed password gets its own line', () => {
    const r = describeAuthError(
      new ApiError('Given credential is wrong!', 400),
      {
        flow: AUTH_FLOW.SET_PASSWORD,
      }
    )
    expect(r.message).toBe(MESSAGES.oldPassword)
  })
  it('forgot flow: unknown account', () => {
    const r = describeAuthError(
      new ApiError('Mobile Number or Email does not exist!', 400),
      { flow: AUTH_FLOW.FORGOT }
    )
    expect(r.message).toBe(MESSAGES.notFound)
    expect(r.kind).toBe('warning')
  })
})

describe('everything else', () => {
  it('429 is a gentle wait message', () => {
    expect(describeAuthError(new ApiError('slow down', 429)).message).toBe(
      MESSAGES.tooMany
    )
  })
  it('unknown server text is never passed through', () => {
    const r = describeAuthError(
      new ApiError('NullPointerException at com.x.Y.z(Y.java:42)', 500)
    )
    expect(r.message).toBe(MESSAGES.unknown)
    expect(r.message).not.toMatch(/Exception|Java/)
  })
  it('undefined / strings / objects fall back to the generic line', () => {
    for (const e of [undefined, null, 'boom', {}, 42]) {
      expect(describeAuthError(e).message).toBe(MESSAGES.unknown)
    }
  })
})

describe('messages', () => {
  it('has short, human field messages', () => {
    for (const m of Object.values(FIELD_MESSAGES)) {
      expect(m.length).toBeLessThan(60)
      expect(m).not.toMatch(/error|code|exception/i)
    }
  })
  it('no message leaks jargon', () => {
    const all = [
      MESSAGES.network,
      MESSAGES.provider('Google'),
      MESSAGES.conflict,
      MESSAGES.credentials,
      MESSAGES.oldPassword,
      MESSAGES.notFound,
      MESSAGES.usesProvider,
      MESSAGES.mobileTaken,
      MESSAGES.tooMany,
      MESSAGES.unknown,
    ]
    for (const m of all)
      expect(m).not.toMatch(/\(code|\d{3,}|token|plugin|401|403/i)
  })
})

describe('logAuthError', () => {
  it('logs technical detail to the console only, with tokens stripped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl'
    const detail = logAuthError(
      AUTH_FLOW.GOOGLE,
      Object.assign(new Error(`bad token ${jwt}`), { code: '10' })
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(detail.code).toBe('10')
    expect(JSON.stringify(warn.mock.calls)).not.toContain(jwt)
    expect(detail.message).toContain('[token]')
  })
})

describe('native Google error codes', () => {
  const g = (code, message = 'Something went wrong') =>
    describeAuthError(
      Object.assign(new Error(message), { code: String(code) }),
      {
        flow: AUTH_FLOW.GOOGLE,
      }
    )

  it('12501 cancelled is silent', () => {
    expect(g(12501, 'The user canceled the sign-in flow.').silent).toBe(true)
  })
  it('7 network / 15 timeout: check your connection', () => {
    for (const c of [7, 15]) expect(g(c).message).toBe(MESSAGES.network)
  })
  it('10 DEVELOPER_ERROR, 12500 and 8: "temporarily unavailable", no jargon', () => {
    for (const c of [10, 12500, 8]) {
      const r = g(c)
      expect(r.reason).toBe(REASON.UNAVAILABLE)
      expect(r.message).toBe(MESSAGES.signInUnavailable)
      expect(r.message).not.toMatch(/\d{2,}|developer|oauth|sha|client/i)
    }
  })
  it('16 no accounts: tells the player to add an account', () => {
    expect(g(16).reason).toBe(REASON.NO_ACCOUNT)
  })
  it('an unknown code still gets the provider line', () => {
    expect(g(9999).message).toBe(MESSAGES.provider('Google'))
  })
  it('the dev log carries the raw code, its name and message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const d = logAuthError(
      AUTH_FLOW.GOOGLE,
      Object.assign(new Error('Something went wrong'), { code: '10' })
    )
    expect(d.native).toBe('10 DEVELOPER_ERROR')
    expect(d.code).toBe('10')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Apple: backend errorCode mapping', () => {
  const api = (status, code) => new ApiError('server text', status, code)
  it.each([
    'NONCE_MISMATCH',
    'AUDIENCE_MISMATCH',
    'TOKEN_EXPIRED',
    'MALFORMED_TOKEN',
  ])('%s is the friendly "Apple sign-in failed" line', (code) => {
    const r = describeAuthError(api(400, code), { flow: AUTH_FLOW.APPLE })
    expect(r.message).toBe(MESSAGES.appleFailed)
    expect(r.silent).toBe(false)
    expect(r.message).not.toMatch(/NONCE|AUDIENCE|MALFORMED|server text/)
  })
  it('404 / 501 still win with the "not available right now" fallback', () => {
    for (const status of [404, 501]) {
      expect(
        describeAuthError(api(status, 'NONCE_MISMATCH'), {
          flow: AUTH_FLOW.APPLE,
        }).message
      ).toBe(MESSAGES.appleUnavailable)
    }
  })
  it('a network failure stays the network line', () => {
    expect(
      describeAuthError(new ApiError('down', 0), { flow: AUTH_FLOW.APPLE })
        .message
    ).toBe(MESSAGES.network)
  })
  it('an unknown code is the generic line', () => {
    expect(
      describeAuthError(api(400, 'SOMETHING_ELSE'), { flow: AUTH_FLOW.APPLE })
        .message
    ).toBe(MESSAGES.unknown)
  })
})
