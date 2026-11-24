// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../api/dailyReward', () => ({
  getDailyRewardStatus: vi.fn(),
  claimDailyReward: vi.fn(),
}))
vi.mock('../api/territory', () => ({
  getTerritoryProfile: vi.fn(),
}))
import { getDailyRewardStatus, claimDailyReward } from '../api/dailyReward'
import { useDailyReward } from '../hooks/useDailyReward'
import { __resetForTests, setCoins, bindUser, useCoins } from './coins'

const rewards = Array.from({ length: 7 }, (_, i) => ({
  day: i + 1,
  coins: 20,
  xp: 0,
  item: null,
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  __resetForTests({ fetch: vi.fn().mockResolvedValue(1000) })
  bindUser('u1')
  setCoins(1500)
})

describe('claim → one balance', () => {
  it('HUD reader and popup result show the same server balance; double tap pays once', async () => {
    getDailyRewardStatus.mockResolvedValue({
      claimable: true,
      nextClaimAt: null,
      streak: 3,
      todayIndex: 4,
      rewards,
      serverTime: new Date().toISOString(),
    })
    claimDailyReward.mockResolvedValue({
      granted: rewards[3],
      streak: 4,
      todayIndex: 4,
      balance: 1520,
      nextClaimAt: '2099-01-01T00:00:00Z',
      serverTime: new Date().toISOString(),
    })
    const { result } = renderHook(() => {
      const hud = useCoins()
      const daily = useDailyReward({
        userId: 'u1',
        blocked: false,
        // the same wiring GamePage uses
        onClaimed: (r) => setCoins(r.balance),
      })
      return { hud, daily }
    })
    await waitFor(() => expect(result.current.daily.state.phase).toBe('ready'))
    expect(result.current.hud).toBe(1500)
    act(() => {
      result.current.daily.claim()
      result.current.daily.claim()
    })
    await waitFor(() =>
      expect(result.current.daily.state.phase).toBe('claimed')
    )
    expect(claimDailyReward).toHaveBeenCalledTimes(1)
    expect(result.current.hud).toBe(1520)
    expect(result.current.daily.state.result.balance).toBe(1520)
  })
})
