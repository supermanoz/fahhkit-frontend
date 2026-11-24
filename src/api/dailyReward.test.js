import { describe, expect, it } from 'vitest'
import { normalizeClaimResult } from './dailyReward'

describe('normalizeClaimResult', () => {
  it('maps the first backend build`s `reward` to `granted`', () => {
    const r = normalizeClaimResult({
      reward: { day: 4, coins: 20 },
      balance: 5,
    })
    expect(r.granted).toEqual({ day: 4, coins: 20 })
    expect(r.balance).toBe(5)
  })
  it('keeps `granted` when present', () => {
    expect(normalizeClaimResult({ granted: { coins: 1 } }).granted.coins).toBe(
      1
    )
  })
})
