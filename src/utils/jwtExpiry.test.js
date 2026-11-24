import { describe, expect, it } from 'vitest'
import {
  REFRESH_GRACE_MS,
  isTokenExpired,
  isTokenUsable,
  tokenExpiryMs,
} from './jwtExpiry'

const b64 = (o) =>
  btoa(JSON.stringify(o))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const jwt = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
const NOW = 1_800_000_000_000

describe('jwtExpiry', () => {
  it('reads exp in ms', () => {
    expect(tokenExpiryMs(jwt({ exp: 1_800_000_100 }))).toBe(1_800_000_100_000)
  })
  it('missing token = signed out', () => {
    expect(isTokenUsable(null)).toBe(false)
    expect(isTokenUsable('')).toBe(false)
  })
  it('past expiry + refresh grace = signed out; future or within grace = usable', () => {
    const graceS = REFRESH_GRACE_MS / 1000
    expect(isTokenUsable(jwt({ exp: NOW / 1000 - graceS - 1 }), NOW)).toBe(
      false
    )
    expect(isTokenUsable(jwt({ exp: NOW / 1000 + 60 }), NOW)).toBe(true)
    // expired an hour ago: the backend still refreshes it
    expect(isTokenUsable(jwt({ exp: NOW / 1000 - 3600 }), NOW)).toBe(true)
    expect(isTokenExpired(jwt({ exp: NOW / 1000 - 1 }), NOW)).toBe(true)
    expect(isTokenExpired(jwt({ exp: NOW / 1000 + 60 }), NOW)).toBe(false)
  })
  it('an opaque or unreadable token is usable until the server says otherwise', () => {
    expect(isTokenUsable('mock-token', NOW)).toBe(true)
    expect(isTokenUsable('a.b.c', NOW)).toBe(true)
    expect(isTokenUsable(jwt({ sub: 'x' }), NOW)).toBe(true)
  })
})
