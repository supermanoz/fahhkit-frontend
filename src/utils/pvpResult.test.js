// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildPvpView,
  clearSession,
  coinChange,
  formatRaceTime,
  hasSeen,
  loadSession,
  markSeen,
  nextBackoff,
  outcomeOf,
  pointsOf,
  saveSession,
} from './pvpResult'

const ME = 'me'
const ch = (over) => ({
  id: 'c1',
  challengerId: ME,
  opponentId: 'r',
  status: 'IN_PROGRESS',
  stakeAmount: 100,
  ...over,
})

beforeEach(() => localStorage.clear())

describe('outcomeOf', () => {
  it('pending until the server resolves it', () => {
    expect(outcomeOf({ challenge: ch(), own: { won: null }, userId: ME })).toBe(
      'pending'
    )
  })
  it('win / lose by winnerId', () => {
    const base = { status: 'COMPLETED', resolutionType: 'WIN_BY_TIME' }
    expect(
      outcomeOf({ challenge: ch({ ...base, winnerId: ME }), userId: ME })
    ).toBe('win')
    expect(
      outcomeOf({ challenge: ch({ ...base, winnerId: 'r' }), userId: ME })
    ).toBe('lose')
  })
  it('draw and refund', () => {
    expect(
      outcomeOf({
        challenge: ch({ status: 'COMPLETED', resolutionType: 'TIE_REFUND' }),
        userId: ME,
      })
    ).toBe('draw')
    expect(
      outcomeOf({
        challenge: ch({
          status: 'EXPIRED',
          resolutionType: 'MUTUAL_FORFEIT_REFUND',
        }),
        userId: ME,
      })
    ).toBe('refund')
  })
  it('own.won alone is enough (opponent finished first)', () => {
    expect(outcomeOf({ challenge: null, own: { won: true }, userId: ME })).toBe(
      'win'
    )
  })
})

describe('buildPvpView', () => {
  it('own result known, rival not finished', () => {
    const v = buildPvpView({
      own: { raceTimeSeconds: 342, runValid: true, opponentSubmitted: false },
      challenge: ch(),
      userId: ME,
    })
    expect(v).toMatchObject({
      hasOwn: true,
      resolved: false,
      outcome: 'pending',
      raceTimeSeconds: 342,
      opponentSubmitted: false,
      stake: 100,
    })
  })
  it('flags an invalid run', () => {
    const v = buildPvpView({
      own: { runValid: false, invalidReason: 'DISTANCE_NOT_MET' },
      challenge: ch(),
      userId: ME,
    })
    expect(v.valid).toBe(false)
    expect(v.invalidReason).toBe('DISTANCE_NOT_MET')
  })
})

describe('helpers', () => {
  it('formats race time', () => {
    expect(formatRaceTime(342)).toBe('5:42')
    expect(formatRaceTime(3725)).toBe('1:02:05')
    expect(formatRaceTime(null)).toBe('--:--')
  })
  it('backs off to a cap', () => {
    let ms = 3000
    for (let i = 0; i < 10; i++) ms = nextBackoff(ms)
    expect(ms).toBe(15000)
  })
  it('coin change comes only from server balances', () => {
    expect(coinChange(2500, 2700)).toBe(200)
    expect(coinChange(2500, undefined)).toBeNull()
  })
  it('a seen race never reopens', () => {
    saveSession({ userId: ME, challengeId: 'c1', runId: 'r1' })
    expect(loadSession(ME)).toMatchObject({ challengeId: 'c1' })
    expect(loadSession('someone-else')).toBeNull()
    markSeen('c1')
    expect(hasSeen('c1')).toBe(true)
    expect(loadSession(ME)).toBeNull()
    clearSession()
  })
})

describe('pointsOf (server values only, never computed)', () => {
  it('nothing from the server -> null (row hidden)', () => {
    expect(pointsOf({ own: {}, challenge: ch(), userId: ME })).toBeNull()
    expect(pointsOf({ own: null, challenge: null, userId: ME })).toBeNull()
    expect(
      pointsOf({ own: { pointsEarned: 'x' }, challenge: ch(), userId: ME })
    ).toBeNull()
  })
  it('reads my pvpResult, signed, incl. zero and the optional breakdown', () => {
    expect(
      pointsOf({
        own: { pointsEarned: 30, pointsWin: 25, pointsRace: 5 },
        userId: ME,
      })
    ).toEqual({ total: 30, win: 25, race: 5 })
    expect(pointsOf({ own: { pointsEarned: -12 }, userId: ME }).total).toBe(-12)
    expect(pointsOf({ own: { pointsEarned: 0 }, userId: ME }).total).toBe(0)
  })
  it('falls back to MY side of the resolved challenge', () => {
    const c = ch({ challengerPointsEarned: 20, opponentPointsEarned: -8 })
    expect(pointsOf({ own: {}, challenge: c, userId: ME }).total).toBe(20)
    expect(pointsOf({ own: {}, challenge: c, userId: 'r' }).total).toBe(-8)
  })
  it('buildPvpView only exposes points once resolved', () => {
    const own = { pointsEarned: 10, won: true, resolutionType: 'WIN_BY_TIME' }
    expect(
      buildPvpView({ own, challenge: ch(), userId: ME }).points.total
    ).toBe(10)
    expect(
      buildPvpView({ own: { pointsEarned: 10 }, challenge: ch(), userId: ME })
        .points
    ).toBeNull()
  })
})
