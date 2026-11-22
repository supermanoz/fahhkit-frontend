import { describe, expect, it } from 'vitest'
import { jitterThresholdMeters, shouldCommitFix } from './idleGps'

const fix = (accuracy) => ({ accuracy })

describe('shouldCommitFix', () => {
  it('always commits the first fix', () => {
    expect(
      shouldCommitFix({ prev: null, fix: fix(10), movedM: 0, elapsedMs: 0 })
    ).toBe(true)
  })
  it('drops jitter inside the accuracy circle', () => {
    expect(
      shouldCommitFix({ prev: {}, fix: fix(10), movedM: 2, elapsedMs: 1000 })
    ).toBe(false)
  })
  it('commits real movement', () => {
    expect(
      shouldCommitFix({ prev: {}, fix: fix(10), movedM: 9, elapsedMs: 1000 })
    ).toBe(true)
  })
  it('still sends a heartbeat when standing still', () => {
    expect(
      shouldCommitFix({ prev: {}, fix: fix(10), movedM: 0, elapsedMs: 8000 })
    ).toBe(true)
  })
  it('is much more conservative while a menu covers the map', () => {
    expect(
      shouldCommitFix({
        prev: {},
        fix: fix(10),
        movedM: 12,
        elapsedMs: 2000,
        menuOpen: true,
      })
    ).toBe(false)
    expect(
      shouldCommitFix({
        prev: {},
        fix: fix(10),
        movedM: 30,
        elapsedMs: 2000,
        menuOpen: true,
      })
    ).toBe(true)
  })
  it('threshold is clamped to 3-8 m', () => {
    expect(jitterThresholdMeters(1)).toBe(3)
    expect(jitterThresholdMeters(500)).toBe(8)
    expect(jitterThresholdMeters(undefined)).toBe(3)
  })
})
