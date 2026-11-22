// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreFromPreferences, TOKEN_KEY, USER_KEY } from './authStorage'

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

  it('drops an already-expired saved session instead of restoring it', async () => {
    const p = prefs({ [TOKEN_KEY]: jwt(-1000) })
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
})
