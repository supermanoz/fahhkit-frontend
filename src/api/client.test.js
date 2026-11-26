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
  client.__setProbeDelayForTests(1)
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

  it('a one-off 403 on the check itself (server race) does not sign the player out', async () => {
    routes['/v1/anything'] = res(403)
    let calls = 0
    routes['/v1/user/find/logged-in'] = () =>
      ++calls === 1 ? res(403) : res(200, { id: 1 })
    await expect(client.getJson('/v1/anything')).rejects.toMatchObject({
      status: 403,
    })
    expect(calls).toBe(2)
    expect(client.getToken()).toBeTruthy()
  })

  it('a rejected /find/logged-in is only trusted after repeated rejections', async () => {
    routes['/v1/user/find/logged-in'] = res(401)
    await expect(
      client.getJson('/v1/user/find/logged-in')
    ).rejects.toMatchObject({ status: 401 })
    expect(client.getToken()).toBeNull()
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

  it('a token past expiry AND the 7-day refresh grace, with no refresh endpoint, is signed out on its first 401', async () => {
    client.setToken(jwt(-8 * 24 * 60 * 60 * 1000))
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

describe('token refresh (POST /v1/auth/refresh, Bearer = current token)', () => {
  const refreshCalls = () =>
    fetch.mock.calls.filter(([u]) => String(u).endsWith('/v1/auth/refresh'))

  it('refresh success: new token stored, request retried once with it', async () => {
    const fresh = jwt(2 * 60 * 60 * 1000)
    const old = client.getToken()
    routes['/v1/auth/refresh'] = (opts) => {
      expect(opts.headers.Authorization).toBe(`Bearer ${old}`)
      return res(200, { tokenType: 'Bearer', tokenId: fresh, expiresIn: 'x' })
    }
    let calls = 0
    routes['/v1/data'] = (opts) => {
      calls++
      return opts.headers.Authorization === `Bearer ${fresh}`
        ? res(200, 'ok')
        : res(401)
    }
    await expect(client.getJson('/v1/data')).resolves.toBe('ok')
    expect(calls).toBe(2) // one rejected, ONE retry
    expect(client.getToken()).toBe(fresh)
  })

  it('rotation: every refresh replaces the stored token and the next one is sent', async () => {
    const t1 = jwt(2 * 60 * 60 * 1000)
    const t2 = jwt(3 * 60 * 60 * 1000)
    const sent = []
    let n = 0
    routes['/v1/auth/refresh'] = (opts) => {
      sent.push(opts.headers.Authorization)
      return res(200, { tokenId: [t1, t2][n++] })
    }
    expect(await client.refreshSession()).toBe('refreshed')
    expect(client.getToken()).toBe(t1)
    expect(await client.refreshSession()).toBe('refreshed')
    expect(client.getToken()).toBe(t2)
    expect(sent[1]).toBe(`Bearer ${t1}`)
  })

  it('an already-expired (inside grace) token is refreshed BEFORE the call, no logout', async () => {
    const fresh = jwt(60 * 60 * 1000)
    client.setToken(jwt(-60 * 60 * 1000))
    routes['/v1/auth/refresh'] = res(200, { tokenId: fresh })
    routes['/v1/data'] = (opts) =>
      opts.headers.Authorization === `Bearer ${fresh}`
        ? res(200, 'ok')
        : res(403)
    await expect(client.getJson('/v1/data')).resolves.toBe('ok')
    expect(refreshCalls()).toHaveLength(1)
    expect(client.getToken()).toBe(fresh)
  })

  it('refresh rejected with 401: signed out exactly once, even with parallel requests', async () => {
    routes['/v1/auth/refresh'] = res(401)
    routes['/v1/data'] = res(403)
    const results = await Promise.allSettled([
      client.getJson('/v1/data'),
      client.getJson('/v1/data'),
      client.getJson('/v1/data'),
    ])
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(client.getToken()).toBeNull()
    expect(refreshCalls()).toHaveLength(1)
    const redirects = console.warn.mock.calls.filter(([m]) =>
      String(m).includes('redirect to login')
    )
    expect(redirects).toHaveLength(1)
    // authoritative: no second-opinion probe
    expect(
      fetch.mock.calls.some(([u]) => String(u).includes('/find/logged-in'))
    ).toBe(false)
  })

  it('offline during refresh keeps the session (network error, timeout)', async () => {
    routes['/v1/auth/refresh'] = NETWORK_DOWN
    routes['/v1/data'] = res(403)
    const token = client.getToken()
    await expect(client.getJson('/v1/data')).rejects.toMatchObject({
      status: 403,
    })
    expect(client.getToken()).toBe(token)
  })

  it('refresh answering 5xx or an empty body keeps the session', async () => {
    const token = client.getToken()
    routes['/v1/data'] = res(401)
    routes['/v1/auth/refresh'] = res(503)
    await expect(client.getJson('/v1/data')).rejects.toMatchObject({
      status: 401,
    })
    routes['/v1/auth/refresh'] = res(200, {})
    await expect(client.getJson('/v1/data')).rejects.toMatchObject({
      status: 401,
    })
    expect(client.getToken()).toBe(token)
  })

  it('a refresh finishing after the player switched account is dropped', async () => {
    const other = jwt(90 * 60 * 1000)
    const stale = jwt(2 * 60 * 60 * 1000)
    routes['/v1/auth/refresh'] = () => {
      client.setToken(other) // account switch while the refresh is in flight
      return res(200, { tokenId: stale })
    }
    await client.refreshSession()
    expect(client.getToken()).toBe(other)
  })
})

describe('error body and self-service delete', () => {
  const body = (status, errorCode, errorMessage) => ({
    ok: false,
    status,
    json: async () => ({ status, errorCode, errorMessage }),
  })
  it('ApiError carries the backend errorCode', async () => {
    routes['/v1/auth/apple'] = body(400, 'NONCE_MISMATCH', 'bad nonce')
    const err = await client
      .postJson('/v1/auth/apple', { identityToken: 'x' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(client.ApiError)
    expect(err.status).toBe(400)
    expect(err.errorCode).toBe('NONCE_MISMATCH')
  })
  it('errorCode is null when the body has none', async () => {
    routes['/v1/x'] = res(500)
    const err = await client.getJson('/v1/x').catch((e) => e)
    expect(err.errorCode).toBeNull()
  })
  it('deleteMyAccount sends DELETE /v1/user/me with the Bearer token and no body', async () => {
    const { deleteMyAccount } = await import('./user')
    const token = client.getToken()
    let seen
    routes['/v1/user/me'] = (opts) => {
      seen = opts
      return res(200, null)
    }
    await deleteMyAccount()
    expect(seen.method).toBe('DELETE')
    expect(seen.headers.Authorization).toBe(`Bearer ${token}`)
    expect(seen.body).toBeUndefined()
  })
})
