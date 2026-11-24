import { describe, expect, it } from 'vitest'
import { COIN_STATUS_CONTENT, normalizeCoinStatus } from './paymentStatus'

describe('normalizeCoinStatus', () => {
  it.each([
    ['PAID', 'PAID'],
    ['Completed', 'PAID'],
    ['PENDING', 'PENDING'],
    ['Initiated', 'PENDING'],
    ['CANCELLED', 'CANCELLED'],
    ['User canceled', 'CANCELLED'],
    ['user_canceled', 'CANCELLED'],
    ['Expired', 'EXPIRED'],
    ['Refunded', 'REFUNDED'],
    ['Partially refunded', 'REFUNDED'],
    ['FAILED', 'FAILED'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeCoinStatus(raw)).toBe(expected)
    expect(COIN_STATUS_CONTENT[expected]).toBeTruthy()
  })

  it.each([null, undefined, '', '  ', 'hacked', 42])('rejects %s', (raw) => {
    expect(normalizeCoinStatus(raw)).toBeNull()
  })
})
