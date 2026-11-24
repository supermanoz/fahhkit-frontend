import { describe, expect, it } from 'vitest'
import { isGpsWobble, MAX_CONSECUTIVE_WOBBLE_DROPS } from './gpsQuality'

const M = 1 / 111_320
const at = (north, t, accuracy, speed) => ({
  lat: 27.7 + north * M,
  lng: 85.3,
  timestamp: 1_700_000_000_000 + t * 1000,
  accuracy,
  speed,
})

describe('isGpsWobble', () => {
  it('no previous fix / no chip speed: never wobble (nothing to judge by)', () => {
    expect(isGpsWobble(null, at(5, 3, 15, 0))).toBe(false)
    expect(isGpsWobble(at(0, 0, 15, 0), at(30, 3, 15, null))).toBe(false)
    expect(isGpsWobble(at(0, 0, 15, 0), at(30, 3, 15, undefined))).toBe(false)
  })

  it('standing still: an imprecise hop inside the uncertainty is wobble', () => {
    expect(isGpsWobble(at(0, 0, 15, 0), at(9, 3, 15, 0.1))).toBe(true)
  })

  it('...but not when the chip says we are moving', () => {
    expect(isGpsWobble(at(0, 0, 15, 1.4), at(9, 3, 15, 1.4))).toBe(false)
  })

  it('...and not for precise fixes: a hop between two good fixes is real', () => {
    expect(isGpsWobble(at(0, 0, 4, 0), at(3, 3, 4, 0.1))).toBe(false)
  })

  it('an impossible hop (>10 m/s, far above the chip speed) on imprecise fixes is wobble', () => {
    expect(isGpsWobble(at(0, 0, 15, 1.4), at(40, 3, 15, 1.4))).toBe(true)
  })

  it('a real vehicle is NOT hidden: the chip speed matches the hop', () => {
    expect(isGpsWobble(at(0, 0, 15, 12), at(36, 3, 15, 12))).toBe(false)
  })

  it('a fast hop between precise fixes is never wobble (mock/teleport is handled elsewhere)', () => {
    expect(isGpsWobble(at(0, 0, 3, 1), at(60, 3, 3, 1))).toBe(false)
  })

  it('iOS "unknown" speed (-1) is not a speed', () => {
    expect(isGpsWobble(at(0, 0, 15, 0), at(9, 3, 15, -1))).toBe(false)
  })

  it('resyncs after a bounded number of drops', () => {
    expect(MAX_CONSECUTIVE_WOBBLE_DROPS).toBeLessThanOrEqual(8)
  })
})
