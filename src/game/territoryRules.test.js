// @vitest-environment node
// Runs the track fixtures shared with the backend (territoryFixtures.json; the
// backend's TerritoryRuleFixturesTest runs the identical file against the real
// server pipeline) through the client port in territoryRules.js.
import { describe, expect, it, beforeEach } from 'vitest'
import fixtures from './territoryFixtures.json'
import {
  DEFAULT_TERRITORY_RULES,
  closureHint,
  evaluateTrack,
  getTerritoryRules,
  initTerritoryRules,
  isLoopOpen,
  minAreaHint,
  resetTerritoryRules,
  setTerritoryRules,
} from './territoryRules'

const BASE = Date.UTC(2026, 0, 1, 7)
const toPoints = (t) =>
  t.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    timestamp: BASE + p.t * 1000,
  }))

beforeEach(() => resetTerritoryRules())

describe('shared server fixtures', () => {
  for (const track of fixtures.tracks) {
    it(`${track.name}: ${track.description}`, () => {
      const got = evaluateTrack(toPoints(track))
      const exp = track.expected
      expect(got.outcome).toBe(exp.outcome)
      expect(got.keptPoints).toBe(exp.keptPoints)
      if (exp.areaSqMeters != null) {
        // within 1% / 1 m of the recorded number
        expect(got.areaSqMeters).toBeGreaterThan(exp.areaSqMeters * 0.99)
        expect(got.areaSqMeters).toBeLessThan(exp.areaSqMeters * 1.01)
        expect(
          Math.abs(got.perimeterMeters - exp.perimeterMeters)
        ).toBeLessThan(Math.max(1, exp.perimeterMeters * 0.01))
        expect(
          Math.abs(got.closureGapMeters - exp.closureGapMeters)
        ).toBeLessThan(0.5)
      }
    })
  }
})

describe('isLoopOpen follows the server verdict', () => {
  const by = (name) => toPoints(fixtures.tracks.find((t) => t.name === name))
  it('closed / within 20 m / rescued sub-loop are NOT open', () => {
    expect(isLoopOpen(by('square-100-closed'))).toBe(false)
    expect(isLoopOpen(by('square-100-gap-20'))).toBe(false)
    expect(isLoopOpen(by('lead-in-and-cooldown'))).toBe(false)
  })
  it('26 m gap with nothing to rescue and a never-closed path are open', () => {
    expect(isLoopOpen(by('square-100-gap-26'))).toBe(true)
    expect(isLoopOpen(by('square-100-open'))).toBe(true)
  })
})

describe('rules config', () => {
  it('defaults are the server values', () => {
    expect(DEFAULT_TERRITORY_RULES).toMatchObject({
      closureThresholdMeters: 25,
      minEnclosedAreaSqMeters: 2000,
      simplifyToleranceMeters: 3,
      minPoints: 10,
      maxAcceptableAccuracyMeters: 20,
      maxSegmentSpeedMetersPerSecond: 20,
      maxSustainedSpeedMetersPerSecond: 12,
      maxSustainedSpeedViolationRatio: 0.3,
      maxConsecutiveViolationSeconds: 5,
    })
  })
  it('remote values override; junk is ignored', () => {
    setTerritoryRules({ closureThresholdMeters: 40, minPoints: 'x', bogus: 1 })
    expect(getTerritoryRules().closureThresholdMeters).toBe(40)
    expect(getTerritoryRules().minPoints).toBe(10)
    expect(closureHint()).toContain('40 m')
  })
  it('a 26 m gap closes once the server raises the threshold', () => {
    const pts = toPoints(
      fixtures.tracks.find((t) => t.name === 'square-100-gap-26')
    )
    expect(evaluateTrack(pts).outcome).toBe('LOOP_NOT_CLOSED')
    setTerritoryRules({ closureThresholdMeters: 30 })
    expect(evaluateTrack(pts).outcome).toBe('CLOSED')
  })
  it('falls back to built-ins when the endpoint fails', async () => {
    await initTerritoryRules(() => Promise.reject(new Error('404')))
    expect(getTerritoryRules()).toEqual(DEFAULT_TERRITORY_RULES)
  })
  it('uses the endpoint values when present', async () => {
    await initTerritoryRules(async () => ({ minEnclosedAreaSqMeters: 3000 }))
    expect(getTerritoryRules().minEnclosedAreaSqMeters).toBe(3000)
    expect(minAreaHint()).toContain('3,000')
  })
})
