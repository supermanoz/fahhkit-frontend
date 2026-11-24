// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../api/welcomeBonus', () => ({
  getWelcomeBonusStatus: vi.fn(),
  acknowledgeWelcomeBonus: vi.fn(),
}))
import {
  getWelcomeBonusStatus,
  acknowledgeWelcomeBonus,
} from '../api/welcomeBonus'
import { useWelcomeBonus } from './useWelcomeBonus'

const fresh = { amount: 50, granted: true, acknowledged: false }
afterEach(cleanup)

describe('useWelcomeBonus', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('shows once after the first login, with the server amount', async () => {
    getWelcomeBonusStatus.mockResolvedValue(fresh)
    const { result } = renderHook(() =>
      useWelcomeBonus({ userId: 1, blocked: false })
    )
    await waitFor(() => expect(result.current.visible).toBe(true))
    expect(result.current.amount).toBe(50)
  })

  it('does not show when the server says acknowledged, and skips the network next time', async () => {
    getWelcomeBonusStatus.mockResolvedValue({ ...fresh, acknowledged: true })
    const { result, rerender } = renderHook(
      ({ id }) => useWelcomeBonus({ userId: id, blocked: false }),
      { initialProps: { id: 7 } }
    )
    await waitFor(() => expect(result.current.state.phase).toBe('done'))
    expect(result.current.visible).toBe(false)
    getWelcomeBonusStatus.mockClear()
    rerender({ id: null })
    rerender({ id: 7 })
    await waitFor(() => expect(result.current.state.phase).toBe('done'))
    expect(getWelcomeBonusStatus).not.toHaveBeenCalled()
  })

  it('second login: acknowledging closes it and it never returns', async () => {
    getWelcomeBonusStatus.mockResolvedValue(fresh)
    acknowledgeWelcomeBonus.mockResolvedValue({ ...fresh, acknowledged: true })
    const { result, rerender } = renderHook(
      ({ id }) => useWelcomeBonus({ userId: id, blocked: false }),
      { initialProps: { id: 1 } }
    )
    await waitFor(() => expect(result.current.visible).toBe(true))
    await act(() => result.current.acknowledge())
    expect(result.current.visible).toBe(false)
    getWelcomeBonusStatus.mockClear()
    rerender({ id: null })
    rerender({ id: 1 }) // login again
    await waitFor(() => expect(result.current.state.phase).toBe('done'))
    expect(result.current.visible).toBe(false)
    expect(getWelcomeBonusStatus).not.toHaveBeenCalled()
  })

  it('waits while blocked (run/rollout) and appears when clear', async () => {
    getWelcomeBonusStatus.mockResolvedValue(fresh)
    const { result, rerender } = renderHook(
      ({ b }) => useWelcomeBonus({ userId: 1, blocked: b }),
      { initialProps: { b: true } }
    )
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(result.current.visible).toBe(false)
    expect(result.current.holdsQueue).toBe(true)
    rerender({ b: false })
    await waitFor(() => expect(result.current.visible).toBe(true))
  })

  it('failed acknowledge keeps it open, grants nothing, no cache; retry works', async () => {
    getWelcomeBonusStatus.mockResolvedValue(fresh)
    acknowledgeWelcomeBonus.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 0 })
    )
    const { result } = renderHook(() =>
      useWelcomeBonus({ userId: 1, blocked: false })
    )
    await waitFor(() => expect(result.current.visible).toBe(true))
    await act(() => result.current.acknowledge())
    expect(result.current.visible).toBe(true)
    expect(result.current.state.ack).toBe('failed')
    expect(localStorage.getItem('welcome_bonus_ack_1')).toBeNull()
    acknowledgeWelcomeBonus.mockResolvedValue({})
    await act(() => result.current.acknowledge())
    expect(result.current.visible).toBe(false)
    expect(localStorage.getItem('welcome_bonus_ack_1')).toBe('1')
  })

  it('a missing endpoint (HTTP error) silently disables it', async () => {
    getWelcomeBonusStatus.mockRejectedValue(
      Object.assign(new Error('nf'), { status: 404 })
    )
    const { result } = renderHook(() =>
      useWelcomeBonus({ userId: 1, blocked: false })
    )
    await waitFor(() => expect(result.current.state.phase).toBe('unavailable'))
    expect(result.current.visible).toBe(false)
    expect(result.current.holdsQueue).toBe(false)
  })

  it('logged out: nothing', () => {
    const { result } = renderHook(() =>
      useWelcomeBonus({ userId: null, blocked: false })
    )
    expect(result.current.visible).toBe(false)
    expect(getWelcomeBonusStatus).not.toHaveBeenCalled()
  })
})
