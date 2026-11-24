// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreFromPreferences, TOKEN_KEY, USER_KEY } from './authStorage'
import { Preferences } from '@capacitor/preferences'

// The native app: geo.isNative is true and Preferences is observable.
vi.mock('./geo', () => ({ isNative: true }))
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    get: vi.fn(async () => ({ value: null })),
  },
}))

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const jwt = (expInMs) =>
  `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor((Date.now() + expInMs) / 1000) })}.sig`

function prefs(store) {
  return {
    get: vi.fn(async ({ key }) => ({ value: store[key] ?? null })),
    remove: vi.fn(async ({ key }) => void delete store[key]),
  }
}

beforeEach(() => localStorage.clear())

describe('restoreFromPreferences', () => {
  it('restores the session when the WebView lost localStorage', async () => {
    const token = jwt(3600_000)
    const p = prefs({ [TOKEN_KEY]: token, [USER_KEY]: '{"id":7}' })
    expect(await restoreFromPreferences(p)).toBe('restored')
    expect(localStorage.getItem(TOKEN_KEY)).toBe(token)
    expect(localStorage.getItem(USER_KEY)).toBe('{"id":7}')
  })

  it('keeps a just-expired session: the backend still refreshes it for 7 days', async () => {
    const token = jwt(-3600_000)
    const p = prefs({ [TOKEN_KEY]: token })
    expect(await restoreFromPreferences(p)).toBe('restored')
    expect(localStorage.getItem(TOKEN_KEY)).toBe(token)
  })

  it('drops a saved session that is past expiry AND the refresh grace window', async () => {
    const p = prefs({ [TOKEN_KEY]: jwt(-8 * 24 * 3600_000) })
    expect(await restoreFromPreferences(p)).toBe('none')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(p.remove).toHaveBeenCalled()
  })

  it('leaves a normal launch alone', async () => {
    localStorage.setItem(TOKEN_KEY, 'abc')
    const p = prefs({})
    expect(await restoreFromPreferences(p)).toBe('local')
    expect(p.get).not.toHaveBeenCalled()
  })

  it('migrates an existing localStorage login into Preferences without signing out', async () => {
    const token = jwt(3600_000)
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, '{"id":7}')
    expect(await restoreFromPreferences(prefs({}))).toBe('local')
    // still signed in, and now also stored natively
    expect(localStorage.getItem(TOKEN_KEY)).toBe(token)
    expect(Preferences.set).toHaveBeenCalledWith({
      key: TOKEN_KEY,
      value: token,
    })
    expect(Preferences.set).toHaveBeenCalledWith({
      key: USER_KEY,
      value: '{"id":7}',
    })
  })

  it('app restart: a native copy alone is enough to stay signed in', async () => {
    const token = jwt(3600_000)
    localStorage.clear() // WebView storage wiped between launches
    expect(await restoreFromPreferences(prefs({ [TOKEN_KEY]: token }))).toBe(
      'restored'
    )
    expect(localStorage.getItem(TOKEN_KEY)).toBe(token)
  })
})
