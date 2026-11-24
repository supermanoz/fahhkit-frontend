import { describe, expect, it } from 'vitest'
import {
  createDistanceFilter,
  DISTANCE_FILTER_CONFIG,
  FilterState,
  histogramLabels,
} from './distanceFilter'

const M = 1 / 111_320
const fix = (north, t, accuracy = 5, speed = null, east = 0) => ({
  lat: 27.7 + north * M,
  lng: 85.3 + east * (M / 0.885),
  timestamp: 1_700_000_000_000 + t * 1000,
  accuracy,
  speed,
})

describe('DISTANCE_FILTER_CONFIG', () => {
  it('names every threshold, with sane values', () => {
    const c = DISTANCE_FILTER_CONFIG
    expect(c.anchorMinRadiusM).toBe(8)
    expect(c.anchorAccuracyFactor).toBe(1.5)
    expect(c.movingSpeedMs).toBe(0.6)
    expect(c.sustainedFixes).toBe(3)
    expect(c.maxSpeedMs).toBe(8)
    expect(c.stepQuietSeconds).toBe(10)
    expect(c.dropAccuracyM).toBe(30)
    expect(Object.isFrozen(c)).toBe(true)
  })
})

describe('stationary anchor', () => {
  it('drift inside the radius adds nothing', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 15, 0))
    let total = 0
    for (let i = 1; i <= 100; i += 1)
      total += f.process(fix(i % 2 ? 12 : -10, i * 3, 15, 0)).meters
    expect(total).toBe(0)
    expect(f.getStats().driftDrops).toBe(100)
  })

  it('beyond the radius but the chip says still (<0.3 m/s): not believed, even if sustained', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 5, 0.1))
    let total = 0
    for (let i = 1; i <= 8; i += 1)
      total += f.process(fix(30 + i, i * 3, 5, 0.1)).meters
    expect(total).toBe(0)
  })

  it('a real walk starting from rest credits the start (nothing lost at the beginning)', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 6, 0))
    let total = 0
    for (let i = 1; i <= 60; i += 1)
      total += f.process(fix(i * 4.2, i * 3, 6, 1.4)).meters
    // true: 60 hops x 4.2 m = 252 m
    expect(total).toBeGreaterThan(252 * 0.97)
    expect(total).toBeLessThan(252 * 1.03)
    expect(f.getState()).toBe(FilterState.MOVING)
  })

  it('without a chip speed, 3+ fixes in a consistent direction confirm movement', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 5, null))
    let total = 0
    for (let i = 1; i <= 20; i += 1)
      total += f.process(fix(i * 5, i * 3, 5, null)).meters
    expect(total).toBeGreaterThan(70)
    expect(f.getState()).toBe(FilterState.MOVING)
  })

  it('scattered displacement in random directions is NOT sustained movement', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 5, null))
    const offsets = [
      [20, 0],
      [0, 20],
      [-20, 0],
      [0, -20],
      [18, 18],
      [-18, -18],
      [20, -20],
      [-20, 20],
    ]
    let total = 0
    offsets.forEach(([n, e], i) => {
      total += f.process(fix(n, (i + 1) * 3, 5, null, e)).meters
    })
    expect(total).toBe(0)
  })

  it('stopping (3 fixes at ~0 speed) returns to stationary and stops crediting', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 6, 0))
    for (let i = 1; i <= 20; i += 1) f.process(fix(i * 4, i * 3, 6, 1.4))
    expect(f.getState()).toBe(FilterState.MOVING)
    let total = 0
    for (let i = 21; i <= 40; i += 1)
      total += f.process(fix(80 + (i % 2 ? 6 : -5), i * 3, 12, 0)).meters
    expect(f.getState()).toBe(FilterState.STATIONARY)
    expect(total).toBeLessThan(5)
  })
})

describe('accuracy and plausibility', () => {
  it('fixes worse than 30 m never count', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 5, 1.4))
    const r = f.process(fix(500, 3, 45, 1.4))
    expect(r).toMatchObject({ meters: 0, dropped: true })
    expect(f.getStats().accuracyDropped).toBe(1)
  })

  it('a jump is capped at maxSpeed x dt (8 m/s)', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 2, 1.4))
    f.process(fix(4, 3, 2, 1.4))
    f.process(fix(8, 6, 2, 1.4))
    f.process(fix(12, 9, 2, 1.4))
    const before = f.getStats().countedMeters
    f.process(fix(600, 12, 2, 1.4)) // teleport in 3 s
    expect(f.getStats().countedMeters - before).toBeLessThanOrEqual(
      8 * 3 + 0.01
    )
  })

  it('imprecise fixes are credited from the chip speed, not the (inflated) hop', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 15, 1.4))
    for (let i = 1; i <= 10; i += 1)
      f.process(fix(i * 4.2 + (i % 2 ? 9 : -9), i * 3, 15, 1.4))
    const st = f.getStats()
    expect(st.countedMeters).toBeLessThan(st.rawMeters * 0.6)
    expect(st.countedMeters).toBeGreaterThan(30)
  })

  it('tiny zigzag between precise fixes does not add length', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 2, null))
    let total = 0
    for (let i = 1; i <= 40; i += 1)
      total += f.process(
        fix(i * 3 + (i % 2 ? 1.2 : -1.2), i * 3, 2, null)
      ).meters
    // true path 120 m; a raw sum of zigzag hops would be ~ 40 x 4 m = 160 m
    expect(total).toBeLessThan(120 * 1.05)
  })
})

describe('step sensor corroboration', () => {
  it('no steps for 10 s + low chip speed holds the anchor', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 8, 0.5))
    let total = 0
    for (let i = 1; i <= 30; i += 1)
      total += f.process(fix(i * 3, i * 3, 8, 0.55), {
        secondsSinceStep: 20,
      }).meters
    expect(total).toBe(0)
  })

  it('a missing sensor (null) skips the check and never blocks counting', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 8, 1.4))
    let total = 0
    for (let i = 1; i <= 30; i += 1)
      total += f.process(fix(i * 4.2, i * 3, 8, 1.4), {
        secondsSinceStep: null,
      }).meters
    expect(total).toBeGreaterThan(30 * 4.2 * 0.95)
  })

  it('steps seen recently do not hold the anchor', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 8, 1.4))
    let total = 0
    for (let i = 1; i <= 30; i += 1)
      total += f.process(fix(i * 4.2, i * 3, 8, 1.4), {
        secondsSinceStep: 0.4,
      }).meters
    expect(total).toBeGreaterThan(30 * 4.2 * 0.95)
  })
})

describe('rebase and calibration stats', () => {
  it('rebase (after a pause) starts fresh and still, at the new spot', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 6, 1.4))
    for (let i = 1; i <= 10; i += 1) f.process(fix(i * 4, i * 3, 6, 1.4))
    f.rebase(fix(900, 400, 6, 1.4))
    expect(f.getState()).toBe(FilterState.STATIONARY)
    const r = f.process(fix(902, 403, 6, 1.4))
    expect(r.meters).toBe(0) // the 900 m leap is not credited
  })

  it('reports raw vs counted, drift drops and the accuracy histogram', () => {
    const f = createDistanceFilter()
    f.process(fix(0, 0, 4, 0))
    f.process(fix(9, 3, 12, 0))
    f.noteRejectedFix(25)
    f.noteRejectedFix(45)
    const st = f.getStats()
    expect(st.rawMeters).toBeGreaterThan(8)
    expect(st.countedMeters).toBe(0)
    expect(st.driftDrops).toBe(1)
    expect(st.accuracyDropped).toBe(2)
    expect(st.histogram).toEqual([1, 0, 1, 0, 1, 1])
    expect(histogramLabels()).toEqual([
      '<=5',
      '<=10',
      '<=15',
      '<=20',
      '<=30',
      '>30',
    ])
  })
})
