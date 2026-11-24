import { describe, expect, it } from 'vitest'
import {
  dailyRewardReducer as reduce,
  initialDailyRewardState as init,
  tileState,
  shouldAutoOpen,
  hasClaimableDot,
  formatCountdown,
  grantMismatch,
  formatNext,
  formatBadge,
  chestState,
  splitCoins,
} from './dailyRewardState'

const NOW = Date.parse('2026-11-23T08:00:00Z')
const rewards = Array.from({ length: 7 }, (_, i) => ({
  day: i + 1,
  coins: 5,
  xp: 0,
  item: null,
}))
const claimable = {
  claimable: true,
  nextClaimAt: null,
  streak: 3,
  todayIndex: 4,
  rewards,
  serverTime: '2026-11-23T08:00:10Z',
}
const waiting = {
  ...claimable,
  claimable: false,
  nextClaimAt: '2026-11-24T08:00:00Z',
}

describe('dailyRewardReducer', () => {
  it('claimable status -> ready, with server clock skew', () => {
    const s = reduce(init, { type: 'CHECK_OK', status: claimable, now: NOW })
    expect(s.phase).toBe('ready')
    expect(s.skew).toBe(10_000)
  })

  it('not claimable -> waiting, no popup', () => {
    const s = reduce(init, { type: 'CHECK_OK', status: waiting, now: NOW })
    expect(s.phase).toBe('waiting')
    expect(shouldAutoOpen(s, { blocked: false, shownThisSession: false })).toBe(
      false
    )
  })

  it('claim success stores result and flips to claimed/not claimable', () => {
    let s = reduce(init, { type: 'CHECK_OK', status: claimable, now: NOW })
    s = reduce(s, { type: 'CLAIM_START' })
    expect(s.phase).toBe('claiming')
    s = reduce(s, {
      type: 'CLAIM_OK',
      now: NOW,
      result: {
        granted: { day: 4, coins: 20 },
        streak: 4,
        todayIndex: 4,
        balance: 99,
        nextClaimAt: '2026-11-24T08:00:00Z',
        serverTime: '2026-11-23T08:00:00Z',
      },
    })
    expect(s.phase).toBe('claimed')
    expect(s.status.claimable).toBe(false)
    expect(s.status.streak).toBe(4)
    expect(s.result.balance).toBe(99)
  })

  it('claim failure returns to ready with a message (retryable)', () => {
    let s = reduce(init, { type: 'CHECK_OK', status: claimable, now: NOW })
    s = reduce(s, { type: 'CLAIM_START' })
    s = reduce(s, { type: 'CLAIM_FAIL', message: 'offline' })
    expect(s.phase).toBe('ready')
    expect(s.error).toBe('offline')
  })

  it('a status refresh mid-claim cannot clobber the claim', () => {
    let s = reduce(init, { type: 'CHECK_OK', status: claimable, now: NOW })
    s = reduce(s, { type: 'CLAIM_START' })
    expect(reduce(s, { type: 'CHECK_OK', status: claimable, now: NOW })).toBe(s)
  })

  it('failed first check -> error; failed recheck keeps known status', () => {
    expect(reduce(init, { type: 'CHECK_FAIL', message: 'x' }).phase).toBe(
      'error'
    )
    const ok = reduce(init, { type: 'CHECK_OK', status: waiting, now: NOW })
    expect(reduce(ok, { type: 'CHECK_FAIL', message: 'x' }).phase).toBe(
      'waiting'
    )
  })

  it('dismissal sticks until a new claimable window arrives', () => {
    let s = reduce(init, { type: 'CHECK_OK', status: claimable, now: NOW })
    s = reduce(s, { type: 'OPEN' })
    s = reduce(s, { type: 'CLOSE' })
    s = reduce(s, { type: 'CHECK_OK', status: claimable, now: NOW })
    expect(s.dismissed).toBe(true)
    expect(shouldAutoOpen(s, { blocked: false, shownThisSession: false })).toBe(
      false
    )
    expect(hasClaimableDot(s)).toBe(true)
    // claimed, then the next day opens up again
    s = reduce(s, { type: 'CHECK_OK', status: waiting, now: NOW })
    s = reduce(s, { type: 'CHECK_OK', status: claimable, now: NOW })
    expect(s.dismissed).toBe(false)
  })
})

describe('shouldAutoOpen', () => {
  const ready = reduce(init, { type: 'CHECK_OK', status: claimable, now: NOW })
  it('opens when idle and claimable', () => {
    expect(
      shouldAutoOpen(ready, { blocked: false, shownThisSession: false })
    ).toBe(true)
  })
  it('never when blocked (run / post-run / rollout / logged out)', () => {
    expect(
      shouldAutoOpen(ready, { blocked: true, shownThisSession: false })
    ).toBe(false)
  })
  it('only once per session', () => {
    expect(
      shouldAutoOpen(ready, { blocked: false, shownThisSession: true })
    ).toBe(false)
  })
  it('no dot after claiming', () => {
    const claimed = { ...ready, phase: 'claimed' }
    expect(hasClaimableDot(claimed)).toBe(false)
  })
})

describe('tileState', () => {
  it('claimable: earlier days claimed, today highlighted, rest locked', () => {
    const t = [1, 2, 3, 4, 5, 6, 7].map((d) => tileState(claimable, d))
    expect(t).toEqual([
      'claimed',
      'claimed',
      'claimed',
      'today',
      'locked',
      'locked',
      'locked',
    ])
  })
  it('waiting: today index is already claimed', () => {
    expect(tileState(waiting, 4)).toBe('claimed')
    expect(tileState(waiting, 5)).toBe('locked')
  })
})

describe('formatCountdown', () => {
  it('formats hh:mm:ss and clamps at zero', () => {
    expect(formatCountdown(3_723_000)).toBe('01:02:03')
    expect(formatCountdown(-5)).toBe('00:00:00')
  })
})

describe('server-driven claim flow', () => {
  const claimedResult = {
    granted: { day: 4, coins: 20, xp: 0, item: null },
    streak: 4,
    todayIndex: 4,
    balance: 1520,
    nextClaimAt: '2026-11-24T08:00:00Z',
    serverTime: '2026-11-23T08:00:00Z',
  }
  const ready = reduce(init, { type: 'CHECK_OK', status: claimable, now: NOW })

  it('the reward is only present after the server confirmed the claim', () => {
    expect(ready.result).toBeNull()
    expect(ready.anim).toBe('none')
    const claiming = reduce(ready, { type: 'CLAIM_START' })
    expect(claiming.result).toBeNull()
    const ok = reduce(claiming, {
      type: 'CLAIM_OK',
      result: claimedResult,
      now: NOW,
    })
    expect(ok.result.balance).toBe(1520)
    expect(ok.anim).toBe('playing')
  })

  it('a failed claim grants nothing, keeps the message across the re-sync', () => {
    let s = reduce(ready, { type: 'CLAIM_START' })
    s = reduce(s, { type: 'CLAIM_FAIL', message: 'Network down' })
    expect(s.result).toBeNull()
    expect(s.anim).toBe('none')
    expect(s.phase).toBe('ready')
    // the re-sync (GET status) must not wipe the explanation
    s = reduce(s, { type: 'CHECK_OK', status: claimable, now: NOW })
    expect(s.error).toBe('Network down')
    // retrying clears it
    s = reduce(s, { type: 'CLAIM_START' })
    expect(s.error).toBeNull()
  })

  it('already-claimed failure re-syncs to the not-claimable status', () => {
    let s = reduce(ready, { type: 'CLAIM_START' })
    s = reduce(s, { type: 'CLAIM_FAIL', message: 'already' })
    s = reduce(s, { type: 'CHECK_OK', status: waiting, now: NOW })
    expect(s.status.claimable).toBe(false)
    expect(s.result).toBeNull()
  })

  it('the celebration can be skipped, and only once it is playing', () => {
    let s = reduce(reduce(ready, { type: 'CLAIM_START' }), {
      type: 'CLAIM_OK',
      result: claimedResult,
      now: NOW,
    })
    expect(s.anim).toBe('playing')
    s = reduce(s, { type: 'ANIM_SKIP' })
    expect(s.anim).toBe('done')
    expect(s.result.balance).toBe(1520) // skipping never changes the result
    expect(reduce(ready, { type: 'ANIM_SKIP' })).toBe(ready)
  })

  it('reduced motion goes straight to done', () => {
    const s = reduce(reduce(ready, { type: 'CLAIM_START' }), {
      type: 'CLAIM_OK',
      result: claimedResult,
      now: NOW,
      reduced: true,
    })
    expect(s.anim).toBe('done')
  })

  it('flags a grant that differs from the status listing', () => {
    expect(grantMismatch(claimable, { coins: 6, xp: 0, item: null })).toBe(true)
    expect(grantMismatch(claimable, { coins: 5, xp: 0 })).toBe(false)
    const s = reduce(reduce(ready, { type: 'CLAIM_START' }), {
      type: 'CLAIM_OK',
      result: { ...claimedResult, granted: { coins: 6, xp: 0, item: null } },
      now: NOW,
    })
    expect(s.mismatch).toBe(true)
  })
})

describe('splitCoins', () => {
  it('always sums exactly to the total', () => {
    for (const [t, n] of [
      [100, 8],
      [5, 8],
      [7, 3],
      [1, 8],
      [0, 8],
    ]) {
      expect(splitCoins(t, n).reduce((a, b) => a + b, 0)).toBe(t)
    }
  })
})

describe('chest helpers', () => {
  it('formatNext reads like "Next in 12h 30m"', () => {
    expect(formatNext((12 * 3600 + 30 * 60) * 1000)).toBe('12h 30m')
    expect(formatNext(45 * 60 * 1000 + 10_000)).toBe('45m 10s')
    expect(formatNext(9_000)).toBe('9s')
    expect(formatNext(-1)).toBe('0s')
  })
  it('chestState: neutral until known, then claimable / claimed', () => {
    expect(chestState(init)).toBe('neutral')
    expect(chestState({ ...init, phase: 'error' })).toBe('neutral')
    const ok = (st) => reduce(init, { type: 'CHECK_OK', status: st, now: NOW })
    expect(chestState(ok(claimable))).toBe('claimable')
    expect(chestState(ok(waiting))).toBe('claimed')
    expect(chestState({ ...ok(claimable), phase: 'claimed' })).toBe('claimed')
  })
})

describe('backend without the endpoint', () => {
  it('an HTTP error on the first load hides the feature (no permanent error)', () => {
    const s = reduce(init, { type: 'CHECK_FAIL', http: true, message: 'x' })
    expect(s.phase).toBe('unavailable')
  })
  it('a network failure still shows the retry state', () => {
    const s = reduce(init, { type: 'CHECK_FAIL', http: false, message: 'x' })
    expect(s.phase).toBe('error')
  })
  it('an HTTP error after a good status keeps what we know', () => {
    const ok = reduce(init, { type: 'CHECK_OK', status: waiting, now: NOW })
    expect(
      reduce(ok, { type: 'CHECK_FAIL', http: true, message: 'x' }).phase
    ).toBe('waiting')
  })
  it('recovers when the endpoint appears later', () => {
    const gone = reduce(init, { type: 'CHECK_FAIL', http: true, message: 'x' })
    const back = reduce(gone, { type: 'CHECK_OK', status: claimable, now: NOW })
    expect(back.phase).toBe('ready')
  })
})

describe('formatBadge', () => {
  it('is the tiny HUD badge: hours, then minutes, then seconds', () => {
    expect(formatBadge((12 * 3600 + 30 * 60) * 1000)).toBe('12h')
    expect(formatBadge(45 * 60 * 1000)).toBe('45m')
    expect(formatBadge(30_000)).toBe('30s')
  })
})
