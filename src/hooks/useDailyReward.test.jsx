// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../api/dailyReward', () => ({
  getDailyRewardStatus: vi.fn(),
  claimDailyReward: vi.fn(),
}))
import { getDailyRewardStatus, claimDailyReward } from '../api/dailyReward'
import { useDailyReward } from './useDailyReward'

const rewards = Array.from({ length: 7 }, (_, i) => ({
  day: i + 1,
  coins: 5 * (i + 1),
  xp: 0,
  item: null,
}))
const status = (claimable) => ({
  claimable,
  nextClaimAt: claimable ? null : '2099-01-01T00:00:00Z',
  streak: 3,
  todayIndex: 4,
  rewards,
  serverTime: new Date().toISOString(),
})
const claimResult = {
  granted: rewards[3],
  streak: 4,
  todayIndex: 4,
  balance: 1520,
  nextClaimAt: '2099-01-01T00:00:00Z',
  serverTime: new Date().toISOString(),
}

afterEach(cleanup)

describe('useDailyReward', () => {
  beforeEach(() => vi.resetAllMocks())

  it('opening the popup never touches the balance (no onClaimed, no claim call)', async () => {
    getDailyRewardStatus.mockResolvedValue(status(true))
    const onClaimed = vi.fn()
    const { result } = renderHook(() =>
      useDailyReward({ userId: 1, blocked: false, onClaimed })
    )
    await waitFor(() => expect(result.current.state.open).toBe(true))
    expect(onClaimed).not.toHaveBeenCalled()
    expect(claimDailyReward).not.toHaveBeenCalled()
  })

  it('balance callback fires only after the server confirms, with the server result', async () => {
    getDailyRewardStatus.mockResolvedValue(status(true))
    let release
    claimDailyReward.mockReturnValue(new Promise((r) => (release = r)))
    const onClaimed = vi.fn()
    const { result } = renderHook(() =>
      useDailyReward({ userId: 1, blocked: false, onClaimed })
    )
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    act(() => {
      result.current.claim()
      result.current.claim() // double tap
    })
    expect(result.current.state.phase).toBe('claiming')
    expect(onClaimed).not.toHaveBeenCalled() // in flight: nothing granted yet
    expect(claimDailyReward).toHaveBeenCalledTimes(1)
    await act(async () => release(claimResult))
    expect(onClaimed).toHaveBeenCalledTimes(1)
    expect(onClaimed).toHaveBeenCalledWith(claimResult)
    expect(result.current.state.result.balance).toBe(1520)
  })

  it('a failed claim grants nothing, shows a message and re-syncs status', async () => {
    getDailyRewardStatus.mockResolvedValue(status(true))
    claimDailyReward.mockRejectedValue(
      Object.assign(new Error('boom'), { status: 500 })
    )
    const onClaimed = vi.fn()
    const { result } = renderHook(() =>
      useDailyReward({ userId: 1, blocked: false, onClaimed })
    )
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    const before = getDailyRewardStatus.mock.calls.length
    await act(async () => {
      await result.current.claim()
    })
    expect(onClaimed).not.toHaveBeenCalled()
    expect(result.current.state.result).toBeNull()
    expect(result.current.state.error).toBe('boom')
    expect(getDailyRewardStatus.mock.calls.length).toBe(before + 1) // re-synced
  })

  it('already-claimed (409) re-syncs to the server truth, no grant', async () => {
    getDailyRewardStatus
      .mockResolvedValueOnce(status(true))
      .mockResolvedValue(status(false))
    claimDailyReward.mockRejectedValue(
      Object.assign(new Error('x'), { status: 409 })
    )
    const onClaimed = vi.fn()
    const { result } = renderHook(() =>
      useDailyReward({ userId: 1, blocked: false, onClaimed })
    )
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    await act(async () => {
      await result.current.claim()
    })
    expect(onClaimed).not.toHaveBeenCalled()
    expect(result.current.state.status.claimable).toBe(false)
    expect(result.current.state.error).toMatch(/already/i)
  })

  it('never opens while blocked or logged out', async () => {
    getDailyRewardStatus.mockResolvedValue(status(true))
    const { result } = renderHook(() =>
      useDailyReward({ userId: 1, blocked: true })
    )
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(result.current.state.open).toBe(false)
    renderHook(() => useDailyReward({ userId: null, blocked: false }))
    expect(getDailyRewardStatus).toHaveBeenCalledTimes(1)
  })

  it('a manual open counts as the session showing: no auto-popup afterwards', async () => {
    getDailyRewardStatus.mockResolvedValue(status(true))
    const { result, rerender } = renderHook(
      ({ blocked }) => useDailyReward({ userId: 1, blocked }),
      { initialProps: { blocked: false } }
    )
    await waitFor(() => expect(result.current.state.open).toBe(true)) // auto
    act(() => result.current.close())
    act(() => result.current.open()) // manual
    act(() => result.current.close())
    rerender({ blocked: true })
    rerender({ blocked: false })
    await act(async () => {
      await result.current.retry()
    })
    expect(result.current.state.open).toBe(false)
  })
})
