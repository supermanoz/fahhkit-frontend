import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePortalTransition } from './usePortalTransition'

// Drives the cloud portal state machine with fake timers + frames.
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  })
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => vi.useRealTimers())

const tick = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('usePortalTransition', () => {
  it('enter: pre -> in -> swap once -> hold -> out -> idle, within 1.4s', async () => {
    const { result } = renderHook(() => usePortalTransition())
    const onCovered = vi.fn()
    let done
    act(() => {
      done = result.current.start('enter', onCovered)
    })
    expect(result.current.state.phase).toBe('pre')
    expect(result.current.active).toBe(true)
    await tick(40) // two frames
    expect(result.current.state.phase).toBe('in')
    expect(onCovered).not.toHaveBeenCalled()
    await tick(600)
    expect(onCovered).toHaveBeenCalledTimes(1) // swapped while covered
    expect(result.current.state.phase).toBe('hold')
    await tick(100)
    expect(result.current.state.phase).toBe('out')
    await tick(700)
    expect(result.current.state.phase).toBe('idle')
    expect(await done).toBe('done')
    expect(onCovered).toHaveBeenCalledTimes(1)
  })

  it('total entering time is at most 1.4s', async () => {
    const { result } = renderHook(() => usePortalTransition())
    act(() => {
      result.current.start('enter', () => {})
    })
    await tick(1400)
    expect(result.current.state.phase).toBe('idle')
  })

  it('leaving is shorter (~0.8s) than entering', async () => {
    const { result } = renderHook(() => usePortalTransition())
    act(() => {
      result.current.start('exit', () => {})
    })
    await tick(900)
    expect(result.current.state.phase).toBe('idle')
  })

  it('rapid taps: a second start while running is ignored (input locked)', async () => {
    const { result } = renderHook(() => usePortalTransition())
    const first = vi.fn()
    const second = vi.fn()
    let r2
    act(() => {
      result.current.start('enter', first)
      r2 = result.current.start('enter', second)
    })
    expect(await r2).toBe('ignored')
    await tick(1500)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('Back before the swap aborts cleanly: the page behind never changes', async () => {
    const { result } = renderHook(() => usePortalTransition())
    const onCovered = vi.fn()
    let done
    act(() => {
      done = result.current.start('enter', onCovered)
    })
    await tick(200) // still sliding in
    let cancelled
    act(() => {
      cancelled = result.current.cancel()
    })
    expect(cancelled).toBe(true)
    expect(result.current.state.phase).toBe('out') // quick fade away
    await tick(400)
    expect(result.current.state.phase).toBe('idle')
    expect(await done).toBe('aborted')
    expect(onCovered).not.toHaveBeenCalled()
  })

  it('Back after the swap just finishes at once (no stuck clouds)', async () => {
    const { result } = renderHook(() => usePortalTransition())
    const onCovered = vi.fn()
    act(() => {
      result.current.start('enter', onCovered)
    })
    await tick(650)
    expect(onCovered).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.cancel()
    })
    expect(result.current.state.phase).toBe('idle')
  })

  it('cancel with nothing running is a no-op', () => {
    const { result } = renderHook(() => usePortalTransition())
    expect(result.current.cancel()).toBe(false)
  })

  it('going to the background mid-transition applies the swap and drops the clouds', async () => {
    const { result } = renderHook(() => usePortalTransition())
    const onCovered = vi.fn()
    act(() => {
      result.current.start('enter', onCovered)
    })
    await tick(200)
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    })
    expect(onCovered).toHaveBeenCalledTimes(1)
    expect(result.current.state.phase).toBe('idle')
  })

  it('unmounting mid-transition leaves no timers or pending work', async () => {
    const { result, unmount } = renderHook(() => usePortalTransition())
    const onCovered = vi.fn()
    act(() => {
      result.current.start('enter', onCovered)
    })
    unmount()
    await tick(2000)
    expect(onCovered).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a failing swap never leaves the clouds up', async () => {
    const { result } = renderHook(() => usePortalTransition())
    act(() => {
      result.current.start('enter', () => {
        throw new Error('boom')
      })
    })
    await tick(1400)
    expect(result.current.state.phase).toBe('idle')
  })

  it('reduced motion: a <=200ms crossfade', async () => {
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }))
    const { result } = renderHook(() => usePortalTransition())
    const onCovered = vi.fn()
    act(() => {
      result.current.start('enter', onCovered)
    })
    await tick(250)
    expect(onCovered).toHaveBeenCalledTimes(1)
    expect(result.current.state.phase).toBe('idle')
  })

  it('can run again after finishing', async () => {
    const { result } = renderHook(() => usePortalTransition())
    act(() => {
      result.current.start('exit', () => {})
    })
    await tick(900)
    const again = vi.fn()
    act(() => {
      result.current.start('exit', again)
    })
    await tick(900)
    expect(again).toHaveBeenCalledTimes(1)
  })
})
