import { describe, expect, it } from 'vitest'
import { computeRunDurationSeconds } from './run'

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
