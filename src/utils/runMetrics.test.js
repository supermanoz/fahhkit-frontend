import { describe, expect, it } from 'vitest'
import {
  elevationGainOf,
  runExtraStats,
  shareExtraStats,
  stepsOf,
} from './runMetrics'

describe('steps / elevation display', () => {
  it('shows steps and elevation when present', () => {
    const rows = runExtraStats({
      steps: 5400,
      elevationGainMeters: 41.6,
      elevationLossMeters: 38.2,
    })
    expect(rows).toEqual([
      { key: 'steps', label: 'Steps', value: '5,400' },
      { key: 'gain', label: 'Elev. gain', value: '42 m' },
      { key: 'loss', label: 'Elev. loss', value: '38 m' },
    ])
  })
  it('hides everything the server left null (never "0" or "null")', () => {
    expect(
      runExtraStats({
        steps: null,
        elevationGainMeters: null,
        elevationLossMeters: null,
      })
    ).toEqual([])
    expect(runExtraStats({})).toEqual([])
    expect(runExtraStats(null)).toEqual([])
  })
  it('0 steps is "no data", but a flat 0 m elevation is a real value', () => {
    expect(stepsOf({ steps: 0 })).toBeNull()
    expect(elevationGainOf({ elevationGainMeters: 0 })).toBe(0)
    expect(
      runExtraStats({
        steps: 0,
        elevationGainMeters: 0,
        elevationLossMeters: 0,
      }).map((r) => r.key)
    ).toEqual(['gain', 'loss'])
  })
  it('garbage values are ignored', () => {
    expect(
      runExtraStats({
        steps: 'abc',
        elevationGainMeters: -3,
        elevationLossMeters: NaN,
      })
    ).toEqual([])
  })
  it('the share image gets steps and climb only', () => {
    expect(
      shareExtraStats({
        steps: 100,
        elevationGainMeters: 5,
        elevationLossMeters: 9,
      })
    ).toEqual([
      { label: 'Steps', value: '100' },
      { label: 'Climb', value: '5 m' },
    ])
    expect(shareExtraStats({})).toEqual([])
  })
})
