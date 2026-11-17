import { describe, expect, it } from 'vitest'
import { computeRunDurationSeconds, formatDurationLabel } from './run'

describe('computeRunDurationSeconds', () => {
  it('equals plain elapsed time when pausedMs is 0 (every run before pause existed)', () => {
    const startedAt = 1_700_000_000_000
    const endedAt = startedAt + 20 * 60 * 1000 // 20 minutes
    expect(computeRunDurationSeconds(startedAt, endedAt, 0)).toBe(20 * 60)
  })

  it('subtracts paused time from elapsed, so moving time stays honest', () => {
    const startedAt = 1_700_000_000_000
    // 30 minutes wall clock, 5 of which were a single pause.
    const endedAt = startedAt + 30 * 60 * 1000
    const pausedMs = 5 * 60 * 1000
    expect(computeRunDurationSeconds(startedAt, endedAt, pausedMs)).toBe(
      25 * 60
    )
  })

  it('sums multiple separate pauses, not just the last one', () => {
    const startedAt = 0
    const endedAt = 40 * 60 * 1000
    const pausedMs = 3 * 60 * 1000 + 7 * 60 * 1000 // two breaks
    expect(computeRunDurationSeconds(startedAt, endedAt, pausedMs)).toBe(
      30 * 60
    )
  })

  it('never goes negative even if pausedMs somehow exceeds elapsed', () => {
    expect(computeRunDurationSeconds(0, 1000, 5000)).toBe(0)
  })
})

describe('formatDurationLabel', () => {
  it.each([
    [0, '0s'],
    [25, '25s'],
    [59, '59s'],
    [60, '1m 0s'],
    [720, '12m 0s'],
    [2845, '47m 25s'],
    [3599, '59m 59s'],
    [3600, '1h 0m 0s'],
    [3608, '1h 0m 8s'],
    [3725, '1h 2m 5s'],
    [3912, '1h 5m 12s'],
    [36000, '10h 0m 0s'],
    [59.6, '1m 0s'],
  ])('%s s -> %s', (input, expected) => {
    expect(formatDurationLabel(input)).toBe(expected)
  })

  it('guards null, undefined, NaN and negatives', () => {
    for (const bad of [null, undefined, NaN, 'abc', -5, Infinity]) {
      expect(formatDurationLabel(bad)).toBe('0s')
    }
  })
})
