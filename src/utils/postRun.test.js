import { describe, expect, it } from 'vitest'
import {
  CHEAT_COPY_NEUTRAL,
  POST_RUN_MODE,
  TERRITORY_CHECKING,
  isTerritoryMode,
  postRunModeOf,
  shouldShowRunRewards,
  showsRejection,
  submittedCopy,
} from './postRun'

describe('postRunModeOf', () => {
  it('maps a finished run to its mode', () => {
    expect(postRunModeOf({})).toBe('conquer')
    expect(postRunModeOf(null)).toBe('conquer')
    expect(postRunModeOf({ isTraining: true })).toBe('training')
    expect(postRunModeOf({ isRace: true })).toBe('pvp')
    expect(postRunModeOf({ isWar: true })).toBe('club_war')
    // a pending run (not yet submitted) carries ids instead of flags
    expect(postRunModeOf({ challengeId: 'c1' })).toBe('pvp')
    expect(postRunModeOf({ clubWarId: 'w1' })).toBe('club_war')
  })
  it('club war beats pvp beats training (same routing order as the server)', () => {
    expect(postRunModeOf({ isWar: true, isRace: true })).toBe('club_war')
    expect(postRunModeOf({ isRace: true, isTraining: true })).toBe('pvp')
  })
})

describe('territory text is Conquer only', () => {
  it('only Conquer checks territory', () => {
    expect(isTerritoryMode(POST_RUN_MODE.CONQUER)).toBe(true)
    for (const m of [
      POST_RUN_MODE.TRAINING,
      POST_RUN_MODE.PVP,
      POST_RUN_MODE.CLUB_WAR,
    ]) {
      expect(isTerritoryMode(m)).toBe(false)
    }
  })
  it('accepts the server and UI spellings; unknown is never territory', () => {
    for (const m of ['conquer', 'territory', 'TERRITORY_CAPTURE'])
      expect(isTerritoryMode(m)).toBe(true)
    for (const m of [
      'TRAINING',
      'training',
      'PVP',
      'CLUB_WAR',
      'BOSS_FIGHT',
      'boss',
      '',
      null,
      undefined,
    ])
      expect(isTerritoryMode(m)).toBe(false)
  })
  it('no non-territory mode ever shows a territory message', () => {
    for (const m of [
      POST_RUN_MODE.TRAINING,
      POST_RUN_MODE.PVP,
      POST_RUN_MODE.CLUB_WAR,
    ]) {
      for (const warPoints of [null, 120]) {
        const { title, note } = submittedCopy(m, { warPoints })
        expect(`${title} ${note ?? ''}`).not.toMatch(/territor|loop|claim/i)
        expect(`${title} ${note ?? ''}`).not.toContain(TERRITORY_CHECKING)
      }
    }
  })
})

describe('submittedCopy', () => {
  it('Training: says plainly that nothing is at stake (and never mentions territory)', () => {
    const c = submittedCopy('training')
    expect(c.title).toBe('Run submitted!')
    expect(c.note).toMatch(/Nothing is at stake/)
    expect(c.note).not.toMatch(/territor|loop|claim/i)
  })
  it('PvP: waiting for the rival', () => {
    const c = submittedCopy('pvp')
    expect(c.title).toBe('Run submitted!')
    expect(c.note).toMatch(/Waiting for your rival/)
  })
  it('Club War: counting, then the real points', () => {
    expect(submittedCopy('club_war').note).toMatch(/Counting your points/)
    expect(submittedCopy('club_war', { warPoints: 1234 }).note).toBe(
      '⚔️ 1,234 war points added.'
    )
    expect(submittedCopy('club_war', { warPoints: 0 }).note).toBe(
      '⚔️ 0 war points added.'
    )
  })
})

describe('showsRejection', () => {
  const loop = { outcome: 'REJECTED', rejectionReason: 'LOOP_NOT_CLOSED' }
  const cheat = { outcome: 'CHEAT_DETECTED' }
  it('Conquer shows every rejection', () => {
    expect(showsRejection('conquer', loop)).toBe(true)
    expect(showsRejection('conquer', cheat)).toBe(true)
  })
  it('every other mode hides territory reasons but still flags a cheat', () => {
    for (const m of ['training', 'pvp', 'club_war']) {
      expect(showsRejection(m, loop)).toBe(false)
      expect(showsRejection(m, { outcome: 'TERRITORY_NOT_ROLLED_OUT' })).toBe(
        false
      )
      expect(showsRejection(m, cheat)).toBe(true)
    }
  })
  it('the neutral cheat copy never mentions territory', () => {
    expect(
      `${CHEAT_COPY_NEUTRAL.title} ${CHEAT_COPY_NEUTRAL.message}`
    ).not.toMatch(/territor/i)
  })
})

describe('shouldShowRunRewards', () => {
  const route = [{}, {}, {}]
  const run = { id: 7, points: route }
  const base = { resultOpen: false, run, dismissedId: null, settledId: 7 }

  it('waits for the result popup to close (never layered on it)', () => {
    expect(shouldShowRunRewards({ ...base, resultOpen: true })).toBe(false)
    expect(shouldShowRunRewards(base)).toBe(true)
  })
  it('waits for the reward lookup even when a score has already arrived', () => {
    // The socket's score push can beat the XP refresh: opening now would
    // show "+0 XP" and an empty bar.
    expect(
      shouldShowRunRewards({ ...base, settledId: null, hasScore: true })
    ).toBe(false)
    expect(shouldShowRunRewards({ ...base, settledId: 6, hasXp: true })).toBe(
      false
    )
  })
  it('opens for xp, score, or just a route', () => {
    expect(shouldShowRunRewards({ ...base, hasXp: true })).toBe(true)
    expect(shouldShowRunRewards({ ...base, hasScore: true })).toBe(true)
    expect(shouldShowRunRewards(base)).toBe(true)
  })
  it('a run with no rewards and no route shows nothing', () => {
    expect(
      shouldShowRunRewards({ ...base, run: { id: 7, points: [{}] } })
    ).toBe(false)
    expect(shouldShowRunRewards({ ...base, run: { id: 7, points: [] } })).toBe(
      false
    )
  })
  it('never re-opens for a run already dismissed, and needs a run', () => {
    expect(shouldShowRunRewards({ ...base, dismissedId: 7 })).toBe(false)
    expect(shouldShowRunRewards({ ...base, run: null })).toBe(false)
    expect(
      shouldShowRunRewards({ ...base, dismissedId: 6, run: { ...run, id: 7 } })
    ).toBe(true)
  })
})
