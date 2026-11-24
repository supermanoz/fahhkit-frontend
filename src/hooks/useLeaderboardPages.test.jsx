// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLeaderboardPages } from './useLeaderboardPages'

const makeRows = (page, n = 20) =>
  Array.from({ length: n }, (_, i) => {
    const rank = (page - 1) * 20 + i + 1
    return { rank, userId: `u${rank}` }
  })
const serverPage = (page, totalPages = 3) => ({
  content: makeRows(page, page === totalPages ? 7 : 20),
  totalPages,
})
const serverSource = (fetchPage, key = 'individual:global') => ({
  key,
  kind: 'server',
  fetchPage,
})

describe('useLeaderboardPages (server paging)', () => {
  it('loads page 1 with 20 rows and does NOT fetch page 2 until Next', async () => {
    const fetchPage = vi.fn(async (p) => serverPage(p))
    const { result } = renderHook(() =>
      useLeaderboardPages(serverSource(fetchPage))
    )
    await waitFor(() => expect(result.current.rows).toHaveLength(20))
    expect(result.current.page).toBe(1)
    expect(result.current.rows[0].rank).toBe(1)
    expect(result.current.hasNext).toBe(true)
    expect(result.current.hasPrev).toBe(false)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(1, 20)

    act(() => result.current.next())
    await waitFor(() => expect(result.current.page).toBe(2))
    expect(result.current.rows[0].rank).toBe(21)
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenLastCalledWith(2, 20)
  })

  it('going back uses the cache (no refetch), and forward again too', async () => {
    const fetchPage = vi.fn(async (p) => serverPage(p))
    const { result } = renderHook(() =>
      useLeaderboardPages(serverSource(fetchPage))
    )
    await waitFor(() => expect(result.current.rows).toHaveLength(20))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.page).toBe(2))
    act(() => result.current.prev())
    await waitFor(() => expect(result.current.page).toBe(1))
    expect(result.current.rows[0].rank).toBe(1)
    act(() => result.current.next())
    await waitFor(() => expect(result.current.page).toBe(2))
    expect(fetchPage).toHaveBeenCalledTimes(2) // pages 1 and 2, once each
  })

  it('keeps the old page visible while the next one loads', async () => {
    let release
    const fetchPage = vi.fn(async (p) => {
      if (p === 2) await new Promise((r) => (release = r))
      return serverPage(p)
    })
    const { result } = renderHook(() =>
      useLeaderboardPages(serverSource(fetchPage))
    )
    await waitFor(() => expect(result.current.rows).toHaveLength(20))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.loading).toBe(true))
    expect(result.current.page).toBe(1)
    expect(result.current.rows[0].rank).toBe(1) // still page 1
    expect(result.current.initialLoading).toBe(false)
    await act(async () => release())
    await waitFor(() => expect(result.current.page).toBe(2))
  })

  it('a failed page keeps the current page, shows an error, and Retry works', async () => {
    let fail = true
    const fetchPage = vi.fn(async (p) => {
      if (p === 2 && fail) throw new Error('boom')
      return serverPage(p)
    })
    const { result } = renderHook(() =>
      useLeaderboardPages(serverSource(fetchPage))
    )
    await waitFor(() => expect(result.current.rows).toHaveLength(20))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.error.message).toBe('boom')
    expect(result.current.page).toBe(1)
    expect(result.current.rows[0].rank).toBe(1)
    fail = false
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.page).toBe(2))
    expect(result.current.error).toBeNull()
  })

  it('switching source resets to page 1 and drops the cache', async () => {
    const a = vi.fn(async (p) => serverPage(p))
    const b = vi.fn(async (p) => serverPage(p))
    const { result, rerender } = renderHook(
      ({ src }) => useLeaderboardPages(src),
      { initialProps: { src: serverSource(a, 'individual:global') } }
    )
    await waitFor(() => expect(result.current.rows).toHaveLength(20))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.page).toBe(2))
    rerender({ src: serverSource(b, 'club:global') })
    await waitFor(() => expect(b).toHaveBeenCalledWith(1, 20))
    expect(result.current.page).toBe(1)
  })

  it('reopening the screen (active false -> true) starts at page 1 again', async () => {
    const fetchPage = vi.fn(async (p) => serverPage(p))
    const src = serverSource(fetchPage)
    const { result, rerender } = renderHook(
      ({ active }) => useLeaderboardPages(src, { active }),
      { initialProps: { active: false } }
    )
    expect(fetchPage).not.toHaveBeenCalled() // nothing loads while closed
    rerender({ active: true })
    await waitFor(() => expect(result.current.rows).toHaveLength(20))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.page).toBe(2))
    rerender({ active: false })
    rerender({ active: true })
    await waitFor(() => expect(result.current.page).toBe(1))
    await waitFor(() => expect(result.current.rows[0]?.rank).toBe(1))
  })

  it('ignores a stale answer after the source changed', async () => {
    let releaseOld
    const oldFetch = vi.fn(
      () => new Promise((r) => (releaseOld = () => r(serverPage(1))))
    )
    const newFetch = vi.fn(async (p) => ({
      content: makeRows(p, 3),
      totalPages: 1,
    }))
    const { result, rerender } = renderHook(
      ({ src }) => useLeaderboardPages(src),
      { initialProps: { src: serverSource(oldFetch, 'old') } }
    )
    rerender({ src: serverSource(newFetch, 'new') })
    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    await act(async () => releaseOld())
    expect(result.current.rows).toHaveLength(3)
  })
})

describe('useLeaderboardPages (client paging for limit-only endpoints)', () => {
  it('fetches the list once and slices 20 per page', async () => {
    const all = makeRows(1, 45)
    const fetchAll = vi.fn(async () => all)
    const src = { key: 'individual:city', kind: 'client', fetchAll }
    const { result } = renderHook(() => useLeaderboardPages(src))
    await waitFor(() => expect(result.current.rows).toHaveLength(20))
    expect(fetchAll).toHaveBeenCalledWith(100)
    act(() => result.current.next())
    await waitFor(() => expect(result.current.page).toBe(2))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.page).toBe(3))
    expect(result.current.rows).toHaveLength(5)
    expect(result.current.hasNext).toBe(false)
    expect(fetchAll).toHaveBeenCalledTimes(1)
  })
})
