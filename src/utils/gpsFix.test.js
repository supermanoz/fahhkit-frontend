import { describe, expect, it } from 'vitest'
import { MAX_FIX_ACCURACY_M, MAX_FIX_AGE_MS, isUsableFix } from './gpsFix'

const NOW = 1_700_000_000_000
const good = { lat: 27.7172, lng: 85.324, accuracy: 12, timestamp: NOW - 1000 }

describe('isUsableFix', () => {
  it('accepts a normal recent fix', () => {
    expect(isUsableFix(good, NOW)).toBe(true)
  })
  it('accepts a fix with no accuracy/timestamp info (older callers, mocks)', () => {
    expect(isUsableFix({ lat: 27.7, lng: 85.3 }, NOW)).toBe(true)
  })
  it('rejects nothing / non-numbers / NaN', () => {
    expect(isUsableFix(null, NOW)).toBe(false)
    expect(isUsableFix(undefined, NOW)).toBe(false)
    expect(isUsableFix({ lat: '27.7', lng: 85.3 }, NOW)).toBe(false)
    expect(isUsableFix({ lat: NaN, lng: 85.3 }, NOW)).toBe(false)
    expect(isUsableFix({ lat: 27.7 }, NOW)).toBe(false)
  })
  it('rejects 0,0 (a device with no real fix) but not a real 0 on one axis', () => {
    expect(isUsableFix({ lat: 0, lng: 0, accuracy: 10 }, NOW)).toBe(false)
    expect(isUsableFix({ lat: 0.0000001, lng: -0.0000001 }, NOW)).toBe(false)
    expect(isUsableFix({ lat: 0, lng: 36.8 }, NOW)).toBe(true) // equator, Nairobi-ish
  })
  it('rejects out-of-range coordinates', () => {
    expect(isUsableFix({ lat: 91, lng: 10 }, NOW)).toBe(false)
    expect(isUsableFix({ lat: 10, lng: -181 }, NOW)).toBe(false)
  })
  it('rejects a fix too inaccurate to name a city', () => {
    expect(isUsableFix({ ...good, accuracy: MAX_FIX_ACCURACY_M }, NOW)).toBe(
      true
    )
    expect(
      isUsableFix({ ...good, accuracy: MAX_FIX_ACCURACY_M + 1 }, NOW)
    ).toBe(false)
    expect(isUsableFix({ ...good, accuracy: Infinity }, NOW)).toBe(false)
  })
  it('rejects a stale (cached) fix', () => {
    expect(isUsableFix({ ...good, timestamp: NOW - MAX_FIX_AGE_MS }, NOW)).toBe(
      true
    )
    expect(
      isUsableFix({ ...good, timestamp: NOW - MAX_FIX_AGE_MS - 1 }, NOW)
    ).toBe(false)
  })
})
