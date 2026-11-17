import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ platform: 'ios' }))
const plugin = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('@capacitor-community/apple-sign-in', () => ({
  SignInWithApple: plugin,
}))
vi.mock('./geo', () => ({
  get platform() {
    return state.platform
  },
  get isNative() {
    return state.platform !== 'web'
  },
}))

import {
  authorizeWithApple,
  generateNonce,
  isAppleCancel,
  isIosAppleSignInEnabled,
  sha256Hex,
  sha256HexSync,
} from './appleSignIn'

const sha = (s) => createHash('sha256').update(s).digest('hex')

beforeEach(() => {
  plugin.authorize.mockReset()
  vi.unstubAllEnvs()
  state.platform = 'ios'
})

describe('isIosAppleSignInEnabled', () => {
  it('is off by default, even on iOS', () => {
    expect(isIosAppleSignInEnabled()).toBe(false)
  })
  it('is on only for iOS with the flag set', () => {
    vi.stubEnv('VITE_IOS_APPLE_SIGNIN', 'true')
    expect(isIosAppleSignInEnabled()).toBe(true)
    state.platform = 'android'
    expect(isIosAppleSignInEnabled()).toBe(false)
    state.platform = 'web'
    expect(isIosAppleSignInEnabled()).toBe(false)
  })
})

describe('nonce helpers', () => {
  it('generates distinct random hex nonces', () => {
    const a = generateNonce()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(generateNonce()).not.toBe(a)
  })
  it('SHA-256 (subtle and pure-JS) matches node crypto', async () => {
    for (const text of ['', 'abc', 'x'.repeat(200), 'héllo wörld']) {
      expect(await sha256Hex(text)).toBe(sha(text))
      expect(sha256HexSync(text)).toBe(sha(text))
    }
  })
})

describe('authorizeWithApple', () => {
  const response = (over = {}) => ({
    response: {
      user: 'sub',
      email: null,
      givenName: null,
      familyName: null,
      identityToken: 'id.token.jwt',
      authorizationCode: 'auth-code',
      ...over,
    },
  })

  it('sends Apple the HASH of the nonce and returns the RAW nonce', async () => {
    plugin.authorize.mockResolvedValue(response())
    const result = await authorizeWithApple()
    const opts = plugin.authorize.mock.calls[0][0]
    expect(opts.scopes).toBe('email name')
    expect(opts.nonce).toBe(sha(result.nonce))
    expect(opts.nonce).not.toBe(result.nonce)
  })

  it('first authorization: includes name and email', async () => {
    plugin.authorize.mockResolvedValue(
      response({
        givenName: 'Ada',
        familyName: 'Lovelace',
        email: 'ada@privaterelay.appleid.com',
      })
    )
    expect(await authorizeWithApple()).toMatchObject({
      identityToken: 'id.token.jwt',
      authorizationCode: 'auth-code',
      fullName: 'Ada Lovelace',
      email: 'ada@privaterelay.appleid.com',
    })
  })

  it('returning user: no name or email', async () => {
    plugin.authorize.mockResolvedValue(response())
    const result = await authorizeWithApple()
    expect(result.fullName).toBeUndefined()
    expect(result.email).toBeUndefined()
  })

  it('rejects when Apple returns no identity token', async () => {
    plugin.authorize.mockResolvedValue(response({ identityToken: '' }))
    await expect(authorizeWithApple()).rejects.toThrow(/identity token/)
  })
})

describe('isAppleCancel', () => {
  it('recognises error 1001 and cancel messages only', () => {
    expect(isAppleCancel({ code: '1001' })).toBe(true)
    expect(isAppleCancel({ code: 1001 })).toBe(true)
    expect(
      isAppleCancel({ message: 'The operation was canceled (1001)' })
    ).toBe(true)
    expect(isAppleCancel({ code: '1000', message: 'Unknown error' })).toBe(
      false
    )
    expect(isAppleCancel(undefined)).toBe(false)
  })
})
