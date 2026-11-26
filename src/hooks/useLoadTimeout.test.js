// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { SKELETON_TIMEOUT_MS, useLoadTimeout } from './useLoadTimeout'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useLoadTimeout', () => {
  it('is false while loading is fresh, true once it has run too long', () => {
    const { result } = renderHook(() => useLoadTimeout(true, 1000))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(999))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(2))
    expect(result.current).toBe(true)
  })

  it('never fires when loading finishes in time, and resets after it fires', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLoadTimeout(loading, 1000),
      { initialProps: { loading: true } }
    )
    act(() => vi.advanceTimersByTime(500))
    rerender({ loading: false })
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(false)

    rerender({ loading: true })
    act(() => vi.advanceTimersByTime(1100))
    expect(result.current).toBe(true)
    rerender({ loading: false }) // data arrived late: the skeleton is gone
    expect(result.current).toBe(false)
    rerender({ loading: true }) // Retry gets a fresh full timeout
    expect(result.current).toBe(false)
  })

  it('has a finite default', () => {
    expect(SKELETON_TIMEOUT_MS).toBeGreaterThan(0)
    expect(SKELETON_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})
