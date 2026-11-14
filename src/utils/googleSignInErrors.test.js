import { describe, it, expect } from 'vitest'
import { ApiError } from '../api/client'
import {
  describeGoogleSignInError,
  describeOAuthServerError,
} from './googleSignInErrors'

// The native plugin rejects with Play Services' status code as `code` (a
// string), the message being a generic "Something went wrong".
const native = (code) =>
  Object.assign(new Error('Something went wrong'), { code: String(code) })

describe('describeGoogleSignInError', () => {
  it('maps the known Play Services codes', () => {
    expect(describeGoogleSignInError(native(10)).message).toMatch(/code 10/)
    expect(describeGoogleSignInError(native(12500)).message).toMatch(
      /code 12500/
    )
    expect(describeGoogleSignInError(native(7)).message).toMatch(/code 7/)
    expect(describeGoogleSignInError(native(16)).message).toMatch(/code 16/)
  })
  it('treats 12501 as a quiet cancel', () => {
    const r = describeGoogleSignInError(native(12501))
    expect(r.cancelled).toBe(true)
    expect(r.code).toBe(12501)
  })
  it('falls back to a generic line with whatever detail exists', () => {
    const r = describeGoogleSignInError(new Error('boom'))
    expect(r.cancelled).toBe(false)
    expect(r.message).toMatch(/Google sign-in failed.*boom/)
    expect(describeGoogleSignInError(undefined).message).toMatch(
      /Google sign-in failed/
    )
  })
})

describe('describeOAuthServerError', () => {
  it('explains 401 and 403 from the backend, keeping its message', () => {
    expect(
      describeOAuthServerError(
        new ApiError('Invalid token', 401),
        'Google',
        'x'
      )
    ).toMatch(/401.*allow-list.*Invalid token/)
    expect(
      describeOAuthServerError(new ApiError('Blocked', 403), 'Google', 'x')
    ).toMatch(/403.*Blocked/)
  })
  it('passes other errors through to the fallback / message', () => {
    expect(
      describeOAuthServerError(new TypeError('nope'), 'Google', 'fb')
    ).toBe('fb')
    expect(
      describeOAuthServerError(new ApiError('Nope', 500), 'Google', 'fb')
    ).toBe('Nope')
    expect(
      describeOAuthServerError(new ApiError('', 0), 'Google', 'fb')
    ).toMatch(/Could not reach/)
  })
})
