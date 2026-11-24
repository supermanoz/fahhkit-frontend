import { describe, expect, it } from 'vitest'
import {
  MODE_INFO,
  STEPS,
  distanceAwayLabel,
  raceEndedView,
  estimateLabel,
  isLive,
  needCoinsLine,
  potSummary,
  raceOutcome,
  recordLabel,
  resolutionText,
  statusChip,
  timeLeftLabel,
  winRateLabel,
} from './pvpCopy'

describe('modes', () => {
  it('has a blue / green / slate tier, a pitch and an estimate per distance', () => {
    expect(Object.values(MODE_INFO).map((m) => m.tier)).toEqual([
      'blue',
      'green',
      'slate',
    ])
    for (const m of Object.values(MODE_INFO)) {
      expect(m.pitch.length).toBeGreaterThan(10)
      expect(estimateLabel(m.estMinutes)).toMatch(/^About \d+ min$/)
    }
  })
  it('labels the four steps', () => {
    expect(STEPS).toEqual(['Distance', 'Rival', 'Stake', 'Go'])
  })
})

describe('stake and coins', () => {
  it('pot is both stakes', () => {
    expect(potSummary('100')).toEqual({ stake: 100, pot: 200 })
    expect(potSummary(25)).toEqual({ stake: 25, pot: 50 })
  })
  it('rejects anything that is not a whole number of at least 1', () => {
    for (const v of ['', 'abc', '0', '-5', '1.5', null, undefined]) {
      expect(potSummary(v)).toBeNull()
    }
  })
  it('says what is missing in plain words', () => {
    expect(needCoinsLine(50, 0)).toBe('Need 50 coins - you have 0')
  })
})

describe('times and distances', () => {
  const NOW = Date.parse('2026-11-01T12:00:00Z')
  it('time left', () => {
    expect(timeLeftLabel('2026-11-01T12:30:00Z', NOW)).toBe('30 min left')
    expect(timeLeftLabel('2026-11-01T15:00:00Z', NOW)).toBe('3 h left')
    expect(timeLeftLabel('2026-11-03T12:00:00Z', NOW)).toBe('2 d left')
    expect(timeLeftLabel('2026-11-01T11:00:00Z', NOW)).toBe('Ending')
    expect(timeLeftLabel(null, NOW)).toBe('')
  })
  it('distance away', () => {
    expect(distanceAwayLabel(420.4)).toBe('420 m away')
    expect(distanceAwayLabel(1500)).toBe('1.5 km away')
    expect(distanceAwayLabel(NaN)).toBe('')
  })
})

describe('hub stats', () => {
  it('record and win rate, with friendly empty words', () => {
    expect(recordLabel(3, 1, 0)).toBe('3-1')
    expect(recordLabel(3, 1, 2)).toBe('3-1-2')
    expect(winRateLabel(3, 4)).toBe('75%')
    expect(winRateLabel(0, 0)).toBe('No races yet')
  })
})

describe('race outcomes', () => {
  const base = {
    stakeAmount: 100,
    resolutionType: 'WIN_BY_TIME',
    status: 'RESOLVED',
  }
  it('win / loss / draw with the coins it moved', () => {
    expect(raceOutcome({ ...base, winnerId: 'me' }, 'me')).toMatchObject({
      kind: 'win',
      headline: 'Victory',
      coins: 100,
    })
    expect(raceOutcome({ ...base, winnerId: 'them' }, 'me')).toMatchObject({
      kind: 'loss',
      headline: 'Defeat',
      coins: -100,
    })
    expect(
      raceOutcome(
        { ...base, winnerId: null, resolutionType: 'TIE_REFUND' },
        'me'
      )
    ).toMatchObject({ kind: 'draw', headline: 'Draw', coins: 0 })
  })
  it('never-run races', () => {
    for (const [status, kind] of [
      ['DECLINED', 'declined'],
      ['CANCELLED', 'cancelled'],
      ['EXPIRED', 'expired'],
    ]) {
      expect(raceOutcome({ stakeAmount: 50, status }, 'me').kind).toBe(kind)
    }
  })
  it('explains how it ended in plain words', () => {
    expect(resolutionText('WIN_BY_TIME')).toBe('faster time')
    expect(resolutionText('MUTUAL_FORFEIT_REFUND')).toMatch(/coins returned/)
    expect(resolutionText('nope')).toBe('')
  })
})

describe('status chips', () => {
  it('says what the race needs from me', () => {
    expect(statusChip({ status: 'PENDING' }, true)).toEqual({
      label: 'Your move',
      tone: 'gold',
    })
    expect(statusChip({ status: 'PENDING' }, false)).toEqual({
      label: 'Waiting',
      tone: 'slate',
    })
    expect(statusChip({ status: 'IN_PROGRESS' }, true)).toEqual({
      label: 'Run now',
      tone: 'green',
    })
    expect(statusChip({ status: 'IN_PROGRESS' }, false)).toEqual({
      label: 'Live',
      tone: 'blue',
    })
  })
  it('isLive', () => {
    expect(isLive({ status: 'PENDING' })).toBe(true)
    expect(isLive({ status: 'IN_PROGRESS' })).toBe(true)
    expect(isLive({ status: 'RESOLVED' })).toBe(false)
  })
})

describe('copy has no jargon', () => {
  it('player-facing strings avoid code words', () => {
    const all = [
      ...Object.values(MODE_INFO).map((m) => m.pitch),
      needCoinsLine(50, 0),
      resolutionText('WIN_BY_FORFEIT'),
    ].join(' ')
    expect(all).not.toMatch(/queue|api|status|resolution|forfeit_|WIN_BY/i)
  })
})

describe('raceEndedView', () => {
  const base = { challengerId: 'me', opponentId: 'aryan' }
  it('challenger sees the rival declined', () => {
    const v = raceEndedView(
      { ...base, status: 'DECLINED' },
      { userId: 'me', rivalName: 'Aryan' }
    )
    expect(v.message).toBe('Aryan declined your challenge.')
  })
  it('the challenged player sees that they declined', () => {
    const v = raceEndedView(
      { ...base, status: 'DECLINED' },
      { userId: 'aryan', rivalName: 'Me' }
    )
    expect(v.message).toBe("You declined Me's challenge.")
  })
  it('declinedByMe overrides the role guess', () => {
    const v = raceEndedView(
      { ...base, status: 'DECLINED' },
      { userId: 'me', rivalName: 'Aryan', declinedByMe: true }
    )
    expect(v.message).toMatch(/^You declined/)
  })
  it('cancelled past its expiry reads as expired', () => {
    const v = raceEndedView(
      { ...base, status: 'CANCELLED', expiresAt: '2020-01-01T00:00:00' },
      { userId: 'me', rivalName: 'Aryan' }
    )
    expect(v.kind).toBe('expired')
  })
  it('cancelled before expiry reads as cancelled', () => {
    const v = raceEndedView(
      { ...base, status: 'CANCELLED', expiresAt: '2999-01-01T00:00:00' },
      { userId: 'me', rivalName: 'Aryan' }
    )
    expect(v.kind).toBe('cancelled')
  })
  it('played / live races have no ended view', () => {
    for (const status of ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'])
      expect(raceEndedView({ ...base, status }, { userId: 'me' })).toBeNull()
  })
})
