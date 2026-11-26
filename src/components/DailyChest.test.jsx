// @vitest-environment jsdom
/* eslint-disable react/prop-types -- test harness, no prop-types dependency */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react'

vi.mock('../api/dailyReward', () => ({
  getDailyRewardStatus: vi.fn(),
  claimDailyReward: vi.fn(),
}))
import { getDailyRewardStatus } from '../api/dailyReward'
import { useDailyReward } from '../hooks/useDailyReward'
import DailyRewardModal from './DailyRewardModal'
import { DailyHudChest } from './DailyChest'

const rewards = Array.from({ length: 7 }, (_, i) => ({
  day: i + 1,
  coins: 5 * (i + 1),
  xp: 0,
  item: null,
}))
const inMs = (ms) => new Date(Date.now() + ms).toISOString()
const claimableStatus = () => ({
  claimable: true,
  nextClaimAt: null,
  streak: 3,
  todayIndex: 4,
  rewards,
  serverTime: new Date().toISOString(),
})
const waitingStatus = (ms = (12 * 3600 + 30 * 60) * 1000 + 5000) => ({
  ...claimableStatus(),
  claimable: false,
  nextClaimAt: inMs(ms),
})

// The same wiring GamePage has: one hook feeding card, HUD chest and popup.
function Harness({ blocked = false }) {
  const dr = useDailyReward({ userId: 1, blocked, onClaimed: () => {} })
  return (
    <>
      <DailyHudChest dr={dr} onOpen={dr.open} />
      <DailyRewardModal
        open={dr.state.open}
        onClose={dr.close}
        state={dr.state}
        balance={100}
        onClaim={dr.claim}
        onRetry={dr.retry}
        onSkipAnim={dr.skipAnim}
        onAnimDone={dr.animDone}
      />
    </>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  window.matchMedia =
    window.matchMedia ||
    (() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }))
})

afterEach(cleanup)

const hud = () => screen.queryByTestId('daily-reward-hud')

describe('HUD daily reward chest', () => {
  it('claimable: open chest with the red dot; tap opens the popup (manual open)', async () => {
    getDailyRewardStatus.mockResolvedValue(claimableStatus())
    // blocked would hide it, so let auto-popup show once, close, then tap.
    render(<Harness />)
    expect(await screen.findByTestId('daily-reward-modal')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByTestId('daily-reward-modal')).toBeNull()
    )
    const chest = hud()
    expect(chest.getAttribute('data-chest')).toBe('claimable')
    expect(
      chest.querySelector('[data-testid="daily-chest-dot"]')
    ).not.toBeNull()
    expect(screen.queryByTestId('daily-hud-badge')).toBeNull()
    // Ready = the stronger version: sweep + 5 sparkles.
    expect(chest.querySelector('.dc-hud-glow')).toBeNull() // no ring/circle
    expect(chest.querySelector('.dc-hud-sweep')).not.toBeNull()
    expect(chest.querySelectorAll('.dc-hud-spark')).toHaveLength(5)
    fireEvent.click(chest)
    expect(await screen.findByTestId('daily-reward-modal')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled()
  })

  it('claimed: closed dimmed chest, "12h" badge, no dot; popup shows streak + disabled Claim', async () => {
    getDailyRewardStatus.mockResolvedValue(waitingStatus())
    render(<Harness />)
    const chest = await screen.findByTestId('daily-reward-hud')
    expect(chest.getAttribute('data-chest')).toBe('claimed')
    expect(chest.querySelector('[data-testid="daily-chest-dot"]')).toBeNull()
    expect(screen.getByTestId('daily-hud-badge').textContent).toBe('12h')
    // Shiny while cooling down too: sweep + 3 sparkles, no pulse class
    // dimming; the timer pill is a sibling of the sparkles, not covered.
    expect(chest.querySelector('.dc-hud-glow')).toBeNull() // no ring/circle
    expect(chest.querySelector('.dc-hud-sweep')).not.toBeNull()
    expect(chest.querySelectorAll('.dc-hud-spark')).toHaveLength(3)
    expect(chest.getAttribute('aria-label')).toMatch(/next in 12h 30m/i)
    expect(screen.queryByTestId('daily-reward-modal')).toBeNull() // no auto-popup
    fireEvent.click(chest)
    expect(await screen.findByTestId('daily-reward-modal')).toBeTruthy()
    expect(screen.getByTestId('daily-streak').textContent).toMatch(
      /3-day streak/
    )
    expect(screen.getByTestId('daily-claim-disabled')).toBeDisabled()
    expect(screen.getByTestId('daily-countdown')).toBeTruthy()
  })

  it('error: neutral chest, tap retries the status', async () => {
    getDailyRewardStatus.mockRejectedValue(new Error('offline')) // no HTTP status = offline
    render(<Harness />)
    const chest = await screen.findByTestId('daily-reward-hud')
    expect(chest.getAttribute('data-chest')).toBe('neutral')
    getDailyRewardStatus.mockResolvedValue(waitingStatus())
    const calls = getDailyRewardStatus.mock.calls.length
    fireEvent.click(chest)
    await waitFor(() =>
      expect(getDailyRewardStatus.mock.calls.length).toBeGreaterThan(calls)
    )
    await waitFor(() =>
      expect(hud().getAttribute('data-chest')).toBe('claimed')
    )
  })

  it('hidden while loading, when the backend has no endpoint, and when blocked', async () => {
    let resolve
    getDailyRewardStatus.mockReturnValue(new Promise((r) => (resolve = r)))
    const first = render(<Harness />)
    expect(hud()).toBeNull() // loading
    await act(async () => resolve(claimableStatus()))
    first.unmount()

    getDailyRewardStatus.mockRejectedValue(
      Object.assign(new Error('nope'), { status: 404 })
    )
    const second = render(<Harness />)
    await waitFor(() => expect(getDailyRewardStatus).toHaveBeenCalledTimes(2))
    expect(hud()).toBeNull() // unavailable
    second.unmount()

    getDailyRewardStatus.mockResolvedValue(claimableStatus())
    render(<Harness blocked />)
    await waitFor(() => expect(getDailyRewardStatus).toHaveBeenCalledTimes(3))
    expect(hud()).toBeNull() // run / post-run screens own the screen
  })

  it('flips to claimable by itself when the countdown ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      getDailyRewardStatus.mockResolvedValueOnce(waitingStatus(3000))
      getDailyRewardStatus.mockResolvedValue(claimableStatus())
      render(<Harness />)
      const chest = await screen.findByTestId('daily-reward-hud')
      expect(chest.getAttribute('data-chest')).toBe('claimed')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500)
      })
      await waitFor(() =>
        expect(hud().getAttribute('data-chest')).toBe('claimable')
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('the Me tab no longer has a daily reward card', () => {
    expect(screen.queryByTestId('daily-reward-row')).toBeNull()
  })
})
