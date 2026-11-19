import { describe, expect, it } from 'vitest'
import { isTokenUsable, tokenExpiryMs } from './jwtExpiry'

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
  it('expired = signed out; future = usable', () => {
    expect(isTokenUsable(jwt({ exp: NOW / 1000 - 1 }), NOW)).toBe(false)
    expect(isTokenUsable(jwt({ exp: NOW / 1000 + 60 }), NOW)).toBe(true)
  })
  it('an opaque or unreadable token is usable until the server says otherwise', () => {
    expect(isTokenUsable('mock-token', NOW)).toBe(true)
    expect(isTokenUsable('a.b.c', NOW)).toBe(true)
    expect(isTokenUsable(jwt({ sub: 'x' }), NOW)).toBe(true)
  })
})
