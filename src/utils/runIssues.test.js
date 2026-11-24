import { describe, expect, it } from 'vitest'
import { describeGpsShortfall, RunIssueKind } from './runIssues'
import * as copy from '../constants/runMessages'

const pts = (n) => Array.from({ length: n }, () => ({}))

describe('describeGpsShortfall (a run lost to GPS quality)', () => {
  it('no fix at all: "couldn\'t find your location", with a way to retry', () => {
    const r = describeGpsShortfall({ fixCount: 0, points: [] })
    expect(r.kind).toBe(RunIssueKind.NO_FIX)
    expect(r.message).toMatch(/location is on/i)
    expect(r.message).toMatch(/try again/i)
  })

  it('mostly imprecise fixes and nothing measured: "GPS signal was weak"', () => {
    const r = describeGpsShortfall({
      fixCount: 40,
      lowAccuracyFixCount: 36,
      points: pts(3),
      distance: 20,
    })
    expect(r.kind).toBe(RunIssueKind.WEAK_GPS)
    expect(r.title).toBe('GPS signal was weak')
    expect(r.message).toMatch(/try again/i)
  })

  it('good GPS but a very short run is NOT a GPS problem', () => {
    expect(
      describeGpsShortfall({
        fixCount: 40,
        lowAccuracyFixCount: 2,
        points: pts(10),
        distance: 40,
      })
    ).toBeNull()
  })

  it('weak fixes but a real distance was measured: not a GPS shortfall', () => {
    expect(
      describeGpsShortfall({
        fixCount: 100,
        lowAccuracyFixCount: 60,
        points: pts(40),
        distance: 900,
      })
    ).toBeNull()
  })

  it('too few fixes to judge: does not blame the GPS', () => {
    expect(
      describeGpsShortfall({
        fixCount: 3,
        lowAccuracyFixCount: 3,
        points: [],
        distance: 0,
      })
    ).toBeNull()
  })
})

describe('run messages never accuse', () => {
  const all = Object.entries(copy).filter(([, v]) => typeof v === 'string')
  it('has copy to check', () => expect(all.length).toBeGreaterThan(10))
  for (const [name, text] of all) {
    it(`${name}`, () => {
      expect(text).not.toMatch(
        /cheat|scooter|speedster|sus\b|nice try|fake|laptop|vehicle|riding|drove|driving/i
      )
    })
  }
  it('GPS-quality messages are not fraud messages', () => {
    for (const t of [
      copy.WEAK_GPS_TITLE,
      copy.WEAK_GPS_COPY,
      copy.NO_FIX_TITLE,
      copy.NO_FIX_COPY,
    ]) {
      expect(t).not.toMatch(/pace|speed|fast|reject|flag/i)
    }
  })
  it('real over-speed decisions say what was measured and mention weak GPS', () => {
    for (const t of [
      copy.SERVER_REJECTED_COPY,
      copy.SERVER_REJECTED_TERRITORY_COPY,
      copy.OVER_SPEED_DISCARDED_COPY,
    ]) {
      expect(t).toMatch(/above running pace/)
      expect(t).toMatch(/weak GPS/)
    }
  })
})
