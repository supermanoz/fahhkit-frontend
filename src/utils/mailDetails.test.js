import { describe, expect, it } from 'vitest'
import { mailData, mailFacts } from './mailDetails'

const rows = (type, data) =>
  Object.fromEntries(mailFacts({ type, data }).map((r) => [r.label, r.value]))

describe('mailFacts', () => {
  it('RUN_RESULT: shows facts, hides the always-null coinsEarned', () => {
    const r = rows('RUN_RESULT', {
      mode: 'CONQUER',
      status: 'ACCEPTED',
      distanceMeters: 5230,
      durationSeconds: 1865,
      score: 1200,
      xpEarned: 80,
      coinsEarned: null,
      territoriesClaimed: 3,
    })
    expect(r).toEqual({
      Mode: 'Conquer',
      Result: 'Counted',
      Distance: '5.23 km',
      Time: '31:05',
      Score: '1,200',
      'XP earned': '80',
      'Territories claimed': '3',
    })
  })
  it('RUN_RESULT rejected: no zero / null rows', () => {
    const r = rows('RUN_RESULT', {
      mode: 'TRAINING',
      status: 'REJECTED',
      distanceMeters: 800,
      score: 0,
      xpEarned: null,
      coinsEarned: 0,
      territoriesClaimed: 0,
    })
    expect(r).toEqual({
      Mode: 'Training',
      Result: 'Not counted',
      Distance: '800 m',
    })
  })
  it.each(['WIN', 'LOSE', 'DRAW', 'REFUND'])('PVP_RESULT %s', (result) => {
    const r = rows('PVP_RESULT', {
      result,
      opponentName: 'Sita',
      ownRaceTimeSeconds: 600,
      opponentRaceTimeSeconds: null,
      stakeAmount: 50,
      payoutAmount: result === 'WIN' ? 100 : 0,
      newBalance: 1520,
    })
    expect(r.Result).toBe(
      { WIN: 'Win', LOSE: 'Loss', DRAW: 'Draw', REFUND: 'Refunded' }[result]
    )
    expect(r['Your time']).toBe('10:00')
    expect(r['Their time']).toBeUndefined()
    expect(r.Payout).toBe(result === 'WIN' ? '100' : '0')
    expect(r['New balance']).toBe('1,520')
  })
  it('CLUB_WAR_RESULT', () => {
    const r = rows('CLUB_WAR_RESULT', {
      result: 'WIN',
      clubName: 'A',
      opponentClubName: 'B',
      ownScore: 10,
      opponentScore: 7,
      trophyChange: -12,
    })
    expect(r['Opponent club']).toBe('B')
    expect(r.Score).toBe('10 – 7')
    expect(r.Trophies).toBe('−12')
    expect(
      rows('CLUB_WAR_RESULT', { trophyChange: null }).Trophies
    ).toBeUndefined()
  })
  it('TERRITORY_CAPTURED / LOST, LEVEL_UP, REWARD', () => {
    expect(rows('TERRITORY_CAPTURED', { areaSqm: 1234.6 }).Area).toBe(
      '1,235 m²'
    )
    expect(
      rows('TERRITORY_LOST', { areaSqm: 90, byUserName: 'Ram' })['Taken by']
    ).toBe('Ram')
    expect(rows('LEVEL_UP', { newLevel: 12, xpTotal: 5400 })).toEqual({
      'New level': '12',
      'Total XP': '5,400',
    })
    expect(rows('REWARD', { coins: 20, itemId: null })).toEqual({ Coins: '20' })
    expect(rows('REWARD', { coins: 100, itemId: 41 }).Item).toBeTruthy()
  })
  it('never shows "null"/"undefined"/NaN and never throws on junk', () => {
    const junk = { a: 1 }
    for (const type of [
      'RUN_RESULT',
      'PVP_RESULT',
      'CLUB_WAR_RESULT',
      'TERRITORY_LOST',
      'LEVEL_UP',
      'REWARD',
    ]) {
      const all = mailFacts({
        type,
        data: {
          mode: 'null',
          result: {},
          newLevel: 'abc',
          coins: 'x',
          clubName: 'null',
        },
      })
      expect(JSON.stringify(all)).not.toMatch(/null|undefined|NaN/)
      expect(mailFacts({ type, data: junk })).toEqual([])
      expect(mailFacts({ type })).toEqual([])
    }
  })
  it('unknown / missing type has no rows and does not crash', () => {
    expect(mailFacts({ type: 'SOMETHING_NEW', data: { x: 1 } })).toEqual([])
    expect(mailFacts(null)).toEqual([])
    expect(mailFacts({})).toEqual([])
  })
  it('reads the payload JSON string when data is absent', () => {
    expect(mailData({ payload: '{"coins":5}' })).toEqual({ coins: 5 })
    expect(mailData({ payload: 'not json' })).toEqual({})
    expect(mailData({ data: [1] })).toEqual({})
  })
})

import { formatArea, mailDisplayBody } from './mailDetails'
import { isMailClaimable } from './mailTypes'

describe('territory text', () => {
  it('formats areas readably', () => {
    expect(formatArea(163845)).toBe('16.4 ha')
    expect(formatArea(100000)).toBe('100,000 m²')
    expect(formatArea(9876.4)).toBe('9,876 m²')
    expect(formatArea(0)).toBeNull()
  })
  it('rewrites the server sentence: area + display name', () => {
    expect(
      mailDisplayBody({
        type: 'TERRITORY_LOST',
        body: 'Manoj Basnet took 163845 m² of your territory.',
        data: { byUserName: 'Manoj Basnet', areaSqm: 163845 },
      })
    ).toBe('Manoj took 16.4 ha of your territory.')
    expect(
      mailDisplayBody({
        type: 'TERRITORY_CAPTURED',
        body: 'You claimed 1234 m² of territory.',
      })
    ).toBe('You claimed 1,234 m² of territory.')
    expect(mailDisplayBody({ body: null })).toBe('')
  })
  it('isMailClaimable needs a claim-capable type + unclaimed attachment', () => {
    const att = { claimed: false }
    expect(
      isMailClaimable({
        type: 'STORE_ITEM_GRANT',
        status: 'UNREAD',
        attachment: att,
      })
    ).toBe(true)
    expect(
      isMailClaimable({
        type: 'STORE_ITEM_GRANT',
        status: 'CLAIMED',
        attachment: att,
      })
    ).toBe(false)
    expect(isMailClaimable({ type: 'STORE_ITEM_GRANT', status: 'READ' })).toBe(
      false
    )
    expect(
      isMailClaimable({ type: 'RUN_RESULT', status: 'UNREAD', attachment: att })
    ).toBe(false)
    expect(isMailClaimable(null)).toBe(false)
  })
})
