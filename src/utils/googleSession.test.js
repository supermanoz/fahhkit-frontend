import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  initialize: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@codetrix-studio/capacitor-google-auth', () => ({
  GoogleAuth: plugin,
}))
vi.mock('./geo', () => ({ isNative: true, platform: 'android' }))

import { googleSignOut } from './googleSession'
import {
  clearSession,
  setToken,
  setUser,
  getToken,
  getUser,
} from '../api/client'

function installStorage() {
  const make = () => {
    const m = new Map()
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i],
      get length() {
        return m.size
      },
      ...Object.fromEntries([]),
    }
  }
  const ls = make()
  // Object.keys(localStorage) must list entries, like a real Storage.
  const proxy = new Proxy(ls, {
    ownKeys: () => [...Array(ls.length).keys()].map((i) => ls.key(i)),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })
  globalThis.localStorage = proxy
  globalThis.sessionStorage = make()
}

beforeEach(() => {
  vi.clearAllMocks()
  installStorage()
  globalThis.window = {
    google: { accounts: { id: { disableAutoSelect: vi.fn() } } },
  }
})

describe('googleSignOut', () => {
  it('signs the native plugin out and disables GSI auto-select', async () => {
    plugin.signOut.mockResolvedValue({})
    await googleSignOut()
    expect(plugin.signOut).toHaveBeenCalledTimes(1)
    expect(window.google.accounts.id.disableAutoSelect).toHaveBeenCalled()
  })

  it('never throws when the plugin has no account', async () => {
    plugin.signOut.mockRejectedValue(new Error('not signed in'))
    await expect(googleSignOut()).resolves.toBeUndefined()
  })
})

describe('clearSession', () => {
  it('wipes the player but keeps device settings', () => {
    setToken('tokenA')
    setUser({ id: 1, name: 'A' })
    localStorage.setItem('fahhkit_active_run', '{"startedAt":1}')
    localStorage.setItem('fahhkit_club_war_last_9', 'x')
    localStorage.setItem('fahhkit_territory_music_muted', '1')
    localStorage.setItem('fahhkit_announcement_notices_seen', '[]')
    clearSession()
    expect(getToken()).toBeNull()
    expect(getUser()).toBeNull()
    expect(localStorage.getItem('fahhkit_active_run')).toBeNull()
    expect(localStorage.getItem('fahhkit_club_war_last_9')).toBeNull()
    expect(localStorage.getItem('fahhkit_territory_music_muted')).toBe('1')
    expect(localStorage.getItem('fahhkit_announcement_notices_seen')).toBe('[]')
  })
})
