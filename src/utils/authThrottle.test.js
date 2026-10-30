import { describe, expect, it } from 'vitest'
import {
  createAuthThrottle,
  MAX_CONSECUTIVE_FAILURES,
  COOLDOWN_MS,
} from './authThrottle'

describe('createAuthThrottle', () => {
  it('has no cooldown before any failures', () => {
    const throttle = createAuthThrottle()
    expect(throttle.cooldownRemainingMs()).toBe(0)
  })

  it('does not cool down before reaching the failure threshold', () => {
    let now = 0
    const throttle = createAuthThrottle(() => now)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1)
      throttle.recordFailure()
    expect(throttle.cooldownRemainingMs()).toBe(0)
  })

  it('starts a cooldown once consecutive failures reach the threshold', () => {
    let now = 0
    const throttle = createAuthThrottle(() => now)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1)
      throttle.recordFailure()
    expect(throttle.cooldownRemainingMs()).toBe(COOLDOWN_MS)
    now += COOLDOWN_MS / 2
    expect(throttle.cooldownRemainingMs()).toBe(COOLDOWN_MS / 2)
    now += COOLDOWN_MS / 2
    expect(throttle.cooldownRemainingMs()).toBe(0)
  })

  it('a success resets the failure count and clears any cooldown', () => {
    let now = 0
    const throttle = createAuthThrottle(() => now)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1)
      throttle.recordFailure()
    expect(throttle.cooldownRemainingMs()).toBeGreaterThan(0)
    throttle.recordSuccess()
    expect(throttle.cooldownRemainingMs()).toBe(0)
    // Failure count was reset too, not just the cooldown - one more failure
    // alone shouldn't immediately re-trigger it.
    throttle.recordFailure()
    expect(throttle.cooldownRemainingMs()).toBe(0)
  })

  it('a fresh round of failures after a cooldown expires starts a new cooldown', () => {
    let now = 0
    const throttle = createAuthThrottle(() => now)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1)
      throttle.recordFailure()
    now += COOLDOWN_MS
    expect(throttle.cooldownRemainingMs()).toBe(0)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1)
      throttle.recordFailure()
    expect(throttle.cooldownRemainingMs()).toBe(COOLDOWN_MS)
  })
})
