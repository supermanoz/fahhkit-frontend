// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import { useUnlockReveal } from './useUnlockReveal'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useUnlockReveal', () => {
  it('reveals briefly when the same hero goes locked -> unlocked', () => {
    const { result, rerender } = renderHook(
      ({ k, l }) => useUnlockReveal(k, l, 500),
      { initialProps: { k: 'a', l: true } }
    )
    expect(result.current).toBe(false)
    rerender({ k: 'a', l: false })
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(600))
    expect(result.current).toBe(false)
  })
  it('already-unlocked on first show, or swapping heroes, never reveals', () => {
    const { result, rerender } = renderHook(
      ({ k, l }) => useUnlockReveal(k, l),
      { initialProps: { k: 'a', l: false } }
    )
    expect(result.current).toBe(false)
    rerender({ k: 'b', l: true })
    rerender({ k: 'c', l: false })
    expect(result.current).toBe(false)
  })
})
