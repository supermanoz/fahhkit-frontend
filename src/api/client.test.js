// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/googleSession', () => ({ googleSignOut: vi.fn() }))

const b64 = (o) =>
  btoa(JSON.stringify(o))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
const jwt = (expInMs) =>
  `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor((Date.now() + expInMs) / 1000) })}.sig`
const res = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (data === undefined ? null : { data }),
})

const NETWORK_DOWN = 'network-down'
let client
let routes

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_SHELL', 'true')
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
  vi.stubEnv('VITE_API_FALLBACK_URL', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  routes = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts) => {
      const path = String(url).replace('http://localhost:8080', '')
      const r = routes[path]
      if (!r) return res(404)
      if (r === NETWORK_DOWN) throw new TypeError('Failed to fetch')
      return typeof r === 'function' ? r(opts) : r
    })
  )
  client = await import('./client')
  client.setToken(jwt(60 * 60 * 1000))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('session recovery', () => {
  it('403 on an action while the session is alive: error, NOT a logout', async () => {
    routes['/v1/pvp/x'] = res(403)
    routes['/v1/user/find/logged-in'] = res(200, { id: 1 })
    await expect(client.getJson('/v1/pvp/x')).rejects.toMatchObject({
      status: 403,
    })
    expect(client.getToken()).toBeTruthy()
  })

  it('403 and the server confirms the session is dead: signed out once, with a logged reason', async () => {
    routes['/v1/anything'] = res(403)
    routes['/v1/user/find/logged-in'] = res(403)
    await expect(client.getJson('/v1/anything')).rejects.toMatchObject({
      status: 403,
    })
    expect(client.getToken()).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('redirect to login'),
      ''
    )
  })

  it('network error / timeout / 5xx never sign the player out', async () => {
    routes['/v1/a'] = NETWORK_DOWN
    await expect(client.getJson('/v1/a')).rejects.toMatchObject({ status: 0 })
    routes['/v1/b'] = res(503)
    await expect(client.getJson('/v1/b')).rejects.toMatchObject({ status: 503 })
    // 401 + the verification call itself failing: still not a logout.
    routes['/v1/c'] = res(401)
    routes['/v1/user/find/logged-in'] = NETWORK_DOWN
    await expect(client.getJson('/v1/c')).rejects.toMatchObject({ status: 401 })
    expect(client.getToken()).toBeTruthy()
  })

  it('an expired token with no refresh endpoint is signed out on its first 401', async () => {
    client.setToken(jwt(-60 * 1000))
    routes['/v1/a'] = res(401)
    await expect(client.getJson('/v1/a')).rejects.toMatchObject({ status: 401 })
    expect(client.getToken()).toBeNull()
  })

  it('parallel 401s share ONE refresh, then retry with the new token', async () => {
    const fresh = jwt(2 * 60 * 60 * 1000)
    const seen = []
    routes['/v1/auth/refresh'] = () => res(200, { tokenId: fresh })
    routes['/v1/data'] = (opts) => {
      seen.push(opts.headers.Authorization)
      return opts.headers.Authorization === `Bearer ${fresh}`
        ? res(200, 'ok')
        : res(401)
    }
    const out = await Promise.all([
      client.getJson('/v1/data'),
      client.getJson('/v1/data'),
      client.getJson('/v1/data'),
    ])
    expect(out).toEqual(['ok', 'ok', 'ok'])
    const refreshCalls = fetch.mock.calls.filter(([u]) =>
      String(u).endsWith('/v1/auth/refresh')
    )
    expect(refreshCalls).toHaveLength(1)
    expect(client.getToken()).toBe(fresh)
  })

  it('sign-in errors (wrong password) never touch the session', async () => {
    routes['/v1/authenticate'] = res(403)
    await expect(client.postJson('/v1/authenticate', {})).rejects.toMatchObject(
      { status: 403 }
    )
    expect(client.getToken()).toBeTruthy()
  })
})
