import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STRIDE_M,
  INDOOR_ERROR,
  MAX_INDOOR_DURATION_SECONDS,
  estimateIndoorDistance,
  indoorElapsedSeconds,
  parseKmInput,
  strideFromHeight,
  validateIndoorRun,
} from './indoorRun'

const codes = (v) => v.errors.map((e) => e.code)

describe('indoorElapsedSeconds (epoch based)', () => {
  const T = 1_700_000_000_000
  it('is now - start, so a backgrounded app reads the right time', () => {
    expect(indoorElapsedSeconds({ startedAtMs: T }, T + 20 * 60_000)).toBe(1200)
  })
  it('finished pauses are taken out', () => {
    expect(
      indoorElapsedSeconds(
        { startedAtMs: T, pausedMs: 5 * 60_000 },
        T + 20 * 60_000
      )
    ).toBe(900)
  })
  it('an open pause freezes the clock at the moment it began', () => {
    expect(
      indoorElapsedSeconds(
        { startedAtMs: T, pausedAtMs: T + 10 * 60_000 },
        T + 99 * 60_000
      )
    ).toBe(600)
  })
  it('a finished run is frozen at its end', () => {
    expect(
      indoorElapsedSeconds(
        { startedAtMs: T, endedAtMs: T + 30 * 60_000 },
        T + 99 * 60_000
      )
    ).toBe(1800)
  })
  it('never negative / NaN', () => {
    expect(indoorElapsedSeconds({ startedAtMs: T }, T - 5000)).toBe(0)
    expect(indoorElapsedSeconds({}, T)).toBe(0)
  })
})

describe('distance estimate + stride', () => {
  it('prefers the pedometer distance (iOS)', () => {
    expect(
      estimateIndoorDistance({ steps: 1000, pedometerMeters: 820 })
    ).toEqual({ meters: 820, source: 'pedometer' })
  })
  it('else steps x stride (default 0.75 m)', () => {
    expect(estimateIndoorDistance({ steps: 1000 })).toEqual({
      meters: 1000 * DEFAULT_STRIDE_M,
      source: 'steps',
    })
    expect(estimateIndoorDistance({ steps: 1000, strideM: 1 }).meters).toBe(
      1000
    )
  })
  it('nothing to estimate from -> null', () => {
    expect(estimateIndoorDistance({})).toBeNull()
    expect(estimateIndoorDistance({ steps: 0, pedometerMeters: 0 })).toBeNull()
  })
  it('stride from height when known, default when not', () => {
    expect(strideFromHeight(175)).toBeCloseTo(0.7525, 3)
    expect(strideFromHeight(undefined)).toBe(DEFAULT_STRIDE_M)
    expect(strideFromHeight(40)).toBe(DEFAULT_STRIDE_M)
  })
})

describe('parseKmInput', () => {
  it.each([
    ['5', 5000],
    ['5.25', 5250],
    ['5,25', 5250],
    [' 5.2 km ', 5200],
  ])('%s -> %s m', (text, m) => expect(parseKmInput(text)).toBe(m))
  it.each(['', 'abc', '-3', '0', '1.2.3', null])('%s -> null', (t) =>
    expect(parseKmInput(t)).toBeNull()
  )
})

describe('validateIndoorRun', () => {
  const ok = { distanceMeters: 5000, durationSeconds: 30 * 60 } // 6:00 /km
  it('accepts a normal treadmill run', () => {
    const v = validateIndoorRun(ok)
    expect(v.ok).toBe(true)
    expect(v.paceMinPerKm).toBeCloseTo(6)
  })
  it('pace faster than 2:30 /km is refused (with a friendly message)', () => {
    const v = validateIndoorRun({ distanceMeters: 5000, durationSeconds: 600 })
    expect(codes(v)).toContain(INDOOR_ERROR.TOO_FAST)
    expect(v.errors[0].message).toMatch(/2:30/)
  })
  it('pace exactly at the limits is fine', () => {
    expect(
      validateIndoorRun({ distanceMeters: 1000, durationSeconds: 150 }).ok
    ).toBe(true) // 2:30
    expect(
      validateIndoorRun({ distanceMeters: 1000, durationSeconds: 1200 }).ok
    ).toBe(true) // 20:00
  })
  it('pace slower than 20:00 /km is refused', () => {
    expect(
      codes(validateIndoorRun({ distanceMeters: 1000, durationSeconds: 1300 }))
    ).toContain(INDOOR_ERROR.TOO_SLOW)
  })
  it('over the max duration is refused', () => {
    expect(
      codes(
        validateIndoorRun({
          distanceMeters: 40000,
          durationSeconds: MAX_INDOOR_DURATION_SECONDS + 60,
        })
      )
    ).toContain(INDOOR_ERROR.TOO_LONG)
  })
  it('too short / no distance / too little distance', () => {
    expect(
      codes(validateIndoorRun({ distanceMeters: 500, durationSeconds: 10 }))
    ).toContain(INDOOR_ERROR.TOO_SHORT)
    expect(
      codes(validateIndoorRun({ distanceMeters: null, durationSeconds: 600 }))
    ).toContain(INDOOR_ERROR.NO_DISTANCE)
    expect(
      codes(validateIndoorRun({ distanceMeters: 50, durationSeconds: 600 }))
    ).toContain(INDOOR_ERROR.TOO_LITTLE_DISTANCE)
  })
  it('stride must be 0.4-1.6 m when the phone was carried', () => {
    // 6000 steps in 40 min = 150 spm (carried): 5 km -> 0.83 m stride, fine
    expect(
      validateIndoorRun({
        distanceMeters: 5000,
        durationSeconds: 2400,
        steps: 6000,
      }).strideM
    ).toBeCloseTo(0.833, 2)
    const long = validateIndoorRun({
      distanceMeters: 12000,
      durationSeconds: 3600,
      steps: 6000,
    }) // 2 m stride
    expect(codes(long)).toContain(INDOOR_ERROR.STRIDE)
    const short = validateIndoorRun({
      distanceMeters: 1500,
      durationSeconds: 1800,
      steps: 5000,
    }) // 0.3 m
    expect(codes(short)).toContain(INDOOR_ERROR.STRIDE)
  })
  it('a phone that was not carried never blocks, and its steps are dropped', () => {
    const v = validateIndoorRun({
      distanceMeters: 5000,
      durationSeconds: 1800,
      steps: 30,
    })
    expect(v.ok).toBe(true)
    expect(v.stepsUsed).toBeNull()
  })
  it('no steps at all: pace rules only', () => {
    expect(validateIndoorRun({ ...ok, steps: null }).stepsUsed).toBeNull()
  })
})
