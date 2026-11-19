import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const state = vi.hoisted(() => ({ platform: 'ios' }))
const plugin = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('@capacitor-community/apple-sign-in', () => ({
  SignInWithApple: plugin,
}))
vi.mock('../utils/geo', () => ({
  get platform() {
    return state.platform
  },
  get isNative() {
    return state.platform !== 'web'
  },
}))

import AppleSignInButton from './AppleSignInButton'

const tokenResponse = (over = {}) => ({
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

afterEach(cleanup)
beforeEach(() => {
  plugin.authorize.mockReset()
  vi.unstubAllEnvs()
  state.platform = 'ios'
})

describe('AppleSignInButton visibility', () => {
  it('renders nothing on iOS while the flag is off', () => {
    const { container } = render(<AppleSignInButton onCredential={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders on iOS with the flag on', () => {
    vi.stubEnv('VITE_IOS_APPLE_SIGNIN', 'true')
    render(<AppleSignInButton onCredential={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Continue with Apple' })
    ).toBeInTheDocument()
  })
  it('renders nothing on Android even with the flag on', () => {
    vi.stubEnv('VITE_IOS_APPLE_SIGNIN', 'true')
    state.platform = 'android'
    const { container } = render(<AppleSignInButton onCredential={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders nothing on the web (no Services ID configured)', () => {
    vi.stubEnv('VITE_IOS_APPLE_SIGNIN', 'true')
    state.platform = 'web'
    const { container } = render(<AppleSignInButton onCredential={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('native Apple sign-in click', () => {
  beforeEach(() => vi.stubEnv('VITE_IOS_APPLE_SIGNIN', 'true'))
  const click = () =>
    userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Continue with Apple' }))

  it('first-time user: passes token, name, raw nonce, code and email', async () => {
    plugin.authorize.mockResolvedValue(
      tokenResponse({
        givenName: 'Ada',
        familyName: 'Lovelace',
        email: 'ada@example.com',
      })
    )
    const onCredential = vi.fn()
    render(<AppleSignInButton onCredential={onCredential} />)
    await click()
    await waitFor(() => expect(onCredential).toHaveBeenCalled())
    const [token, name, extra] = onCredential.mock.calls[0]
    expect(token).toBe('id.token.jwt')
    expect(name).toBe('Ada Lovelace')
    expect(extra).toMatchObject({
      authorizationCode: 'auth-code',
      email: 'ada@example.com',
    })
    expect(extra.nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(plugin.authorize.mock.calls[0][0].nonce).not.toBe(extra.nonce)
  })

  it('returning user: no name', async () => {
    plugin.authorize.mockResolvedValue(tokenResponse())
    const onCredential = vi.fn()
    render(<AppleSignInButton onCredential={onCredential} />)
    await click()
    await waitFor(() => expect(onCredential).toHaveBeenCalled())
    expect(onCredential.mock.calls[0][1]).toBeUndefined()
  })

  it('cancel (1001) is silent', async () => {
    plugin.authorize.mockRejectedValue({ code: '1001' })
    const onCredential = vi.fn()
    const onError = vi.fn()
    render(<AppleSignInButton onCredential={onCredential} onError={onError} />)
    await click()
    await waitFor(() => expect(plugin.authorize).toHaveBeenCalled())
    expect(onError).not.toHaveBeenCalled()
    expect(onCredential).not.toHaveBeenCalled()
  })

  it('other plugin failures surface a friendly message (never the plugin text)', async () => {
    plugin.authorize.mockRejectedValue({ code: '1000', message: 'No network' })
    const onError = vi.fn()
    render(<AppleSignInButton onCredential={vi.fn()} onError={onError} />)
    await click()
    await waitFor(() =>
      expect(onError.mock.calls[0][0]).toBe(
        "Apple sign-in isn't working right now. Try email sign-in or try again later."
      )
    )
    expect(onError.mock.calls[0][0]).not.toMatch(/No network|1000/)
  })
})
