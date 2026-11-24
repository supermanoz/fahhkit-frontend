import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ApiError } from '../api/client'
import { useRaceDetail } from './useRaceDetail'

const pending = { id: 'r1', status: 'PENDING', challengerId: 'me' }
const declined = { ...pending, status: 'DECLINED' }

// Let queued promise callbacks run.
const flush = () => act(async () => {})
const advance = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useRaceDetail', () => {
  it('declined challenge that is not in the list loads from the server (the stuck-loading bug)', async () => {
    const fetcher = vi.fn().mockResolvedValue(declined)
    const { result } = renderHook(() => useRaceDetail('r1', null, { fetcher }))
    expect(result.current.phase).toBe('loading')
    await flush()
    expect(result.current.phase).toBe('ready')
    expect(result.current.race.status).toBe('DECLINED')
    await advance(60000)
    expect(fetcher).toHaveBeenCalledTimes(1) // final state: polling stopped
  })

  it.each(['CANCELLED', 'EXPIRED', 'COMPLETED'])('%s is final', async (s) => {
    const fetcher = vi.fn().mockResolvedValue({ ...pending, status: s })
    const { result } = renderHook(() => useRaceDetail('r1', null, { fetcher }))
    await flush()
    expect(result.current.race.status).toBe(s)
    await advance(60000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('pending -> declined arrives via the socket (list copy) instantly', async () => {
    const fetcher = vi.fn().mockResolvedValue(pending)
    const { result, rerender } = renderHook(
      ({ item }) => useRaceDetail('r1', item, { fetcher }),
      { initialProps: { item: pending } }
    )
    await flush()
    expect(result.current.race.status).toBe('PENDING')
    rerender({ item: declined })
    expect(result.current.race.status).toBe('DECLINED')
    // The next list refresh drops declined races: the screen must keep it.
    rerender({ item: undefined })
    expect(result.current.race.status).toBe('DECLINED')
    // ...and a stale non-final copy must not bring it back.
    rerender({ item: pending })
    expect(result.current.race.status).toBe('DECLINED')
  })

  it('missed socket event: polling picks up the decline and stops', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(declined)
    const { result } = renderHook(() =>
      useRaceDetail('r1', pending, { fetcher })
    )
    await flush()
    expect(result.current.race.status).toBe('PENDING')
    await advance(3000)
    expect(result.current.race.status).toBe('DECLINED')
    const calls = fetcher.mock.calls.length
    await advance(60000)
    expect(fetcher).toHaveBeenCalledTimes(calls)
  })

  it('polling backs off while the race stays pending', async () => {
    const fetcher = vi.fn().mockResolvedValue(pending)
    renderHook(() => useRaceDetail('r1', pending, { fetcher }))
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await advance(3000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await advance(3999)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('404 -> notfound, never a spinner', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ApiError('Not found', 404))
    const { result } = renderHook(() =>
      useRaceDetail('gone', null, { fetcher })
    )
    await flush()
    expect(result.current.phase).toBe('notfound')
    expect(result.current.race).toBeNull()
  })

  it('loading times out after 10s into error, and Retry recovers', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ApiError('Network error', 0))
    const { result } = renderHook(() => useRaceDetail('r1', null, { fetcher }))
    await flush()
    expect(result.current.phase).toBe('loading')
    await advance(10000)
    expect(result.current.phase).toBe('error')
    fetcher.mockReset()
    fetcher.mockResolvedValue(declined)
    act(() => result.current.retry())
    await flush()
    expect(result.current.phase).toBe('ready')
    expect(result.current.race.status).toBe('DECLINED')
  })

  it('a server error with a known race keeps showing it', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ApiError('Server', 500))
    const { result } = renderHook(() =>
      useRaceDetail('r1', pending, { fetcher })
    )
    await flush()
    await advance(30000)
    expect(result.current.phase).toBe('ready')
    expect(result.current.race.status).toBe('PENDING')
  })
})
