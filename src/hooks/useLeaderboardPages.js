import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CLIENT_LIMIT,
  PAGE_SIZE,
  pageFromServer,
  sliceClientPage,
} from '../utils/leaderboardPaging'

// 20 rows per page for one leaderboard source.
//   source = { key, kind: 'server', fetchPage(page, size) -> Spring Page }
//          | { key, kind: 'client', fetchAll(limit) -> list }
// - Page 1 loads when the board becomes `active` (screen open) or the source
//   key changes (tab / Global-District switch); that also resets to page 1 and
//   drops the cache so a reopened screen is fresh.
// - Next/Prev load a page only on tap. Pages already loaded are cached, so
//   going back never refetches.
// - The previous page stays on screen while the next one loads; a failed load
//   keeps the current page and exposes `error` + `retry`.
// - Stale answers (the source changed meanwhile) are dropped.
export function useLeaderboardPages(source, { active = true } = {}) {
  const sourceRef = useRef(source)
  sourceRef.current = source
  const key = source?.key
  const cacheRef = useRef(new Map()) // page -> { rows, hasNext }
  const allRef = useRef(null) // client kind: the whole list
  const genRef = useRef(0)
  const [state, setState] = useState({
    page: 1,
    rows: [],
    hasNext: false,
    loading: false,
    error: null,
  })

  const fetchPageData = useCallback(async (page) => {
    const src = sourceRef.current
    if (src.kind === 'client') {
      if (!allRef.current) allRef.current = await src.fetchAll(CLIENT_LIMIT)
      return sliceClientPage(allRef.current, page)
    }
    return pageFromServer(await src.fetchPage(page, PAGE_SIZE), page)
  }, [])

  const go = useCallback(
    async (page) => {
      const gen = genRef.current
      const cached = cacheRef.current.get(page)
      if (cached) {
        setState({ page, ...cached, loading: false, error: null })
        return
      }
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const data = await fetchPageData(page)
        if (gen !== genRef.current) return
        cacheRef.current.set(page, data)
        setState({ page, ...data, loading: false, error: null })
      } catch (err) {
        if (gen !== genRef.current) return
        setState((s) => ({
          ...s,
          loading: false,
          error: {
            message: err?.message || 'Could not load the leaderboard.',
            page,
          },
        }))
      }
    },
    [fetchPageData]
  )

  useEffect(() => {
    genRef.current += 1
    cacheRef.current = new Map()
    allRef.current = null
    setState({ page: 1, rows: [], hasNext: false, loading: false, error: null })
    if (active && key) go(1)
  }, [key, active, go])

  const next = useCallback(() => {
    if (state.hasNext && !state.loading) go(state.page + 1)
  }, [state.hasNext, state.loading, state.page, go])
  const prev = useCallback(() => {
    if (state.page > 1 && !state.loading) go(state.page - 1)
  }, [state.page, state.loading, go])
  const retry = useCallback(() => {
    go(state.error?.page ?? state.page)
  }, [state.error, state.page, go])

  // Every row loaded so far (any page) - to find the player's own rank.
  const loadedRows = [...cacheRef.current.values()].flatMap((p) => p.rows)

  return {
    page: state.page,
    rows: state.rows,
    loadedRows,
    hasPrev: state.page > 1,
    hasNext: state.hasNext,
    loading: state.loading,
    // nothing to show yet (first load, or after a reset)
    initialLoading: state.loading && state.rows.length === 0,
    error: state.error,
    next,
    prev,
    retry,
  }
}
