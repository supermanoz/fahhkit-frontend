import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const plugin = vi.hoisted(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id')
  return { initialize: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }
})
vi.mock('@codetrix-studio/capacitor-google-auth', () => ({
  GoogleAuth: plugin,
}))
vi.mock('../utils/geo', () => ({ isNative: true, platform: 'android' }))

import GoogleSignInButton from './GoogleSignInButton'

describe('native Google sign-in', () => {
  it('signs out first on every attempt so the chooser shows, and ends up as B', async () => {
    const order = []
    plugin.signOut.mockImplementation(async () => order.push('signOut'))
    plugin.signIn
      .mockImplementationOnce(async () => {
        order.push('signIn')
        return { authentication: { idToken: 'tokenA' } }
      })
      .mockImplementationOnce(async () => {
        order.push('signIn')
        return { authentication: { idToken: 'tokenB' } }
      })
    const onCredential = vi.fn()
    render(<GoogleSignInButton onCredential={onCredential} />)
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: /continue with google/i })

    await user.click(button)
    await user.click(button)

    expect(order).toEqual(['signOut', 'signIn', 'signOut', 'signIn'])
    expect(onCredential.mock.calls.map((c) => c[0])).toEqual([
      'tokenA',
      'tokenB',
    ])
  })
})
