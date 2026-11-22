import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CONCURRENT_DECODES,
  SPRITE_MEMORY_BUDGET,
  acquireSheet,
  residentBytes,
  resetSheetCacheForTests,
} from './spriteSheetCache'

// A fake decoder: every createImageBitmap call is held until the test lets
// it finish, so concurrency and cancellation can be observed.
let pending
let started
let closed

function sheetBitmap(url) {
  // 4000 x 4000 RGBA ~ 61 MB, like the real hero sheets.
  return { url, width: 4000, height: 4000, close: () => closed.push(url) }
}

beforeEach(() => {
  pending = []
  started = []
  closed = []
  vi.useFakeTimers()
  vi.stubGlobal('fetch', async (url) => ({ blob: async () => ({ url }) }))
  vi.stubGlobal(
    'createImageBitmap',
    (blob) =>
      new Promise((resolve) => {
        started.push(blob.url)
        pending.push(() => resolve(sheetBitmap(blob.url)))
      })
  )
})

afterEach(() => {
  resetSheetCacheForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Lets the fetch().then().then() chain reach createImageBitmap.
const flush = () => vi.advanceTimersByTimeAsync(0)
const finishAll = async () => {
  while (pending.length) pending.shift()()
  await flush()
}

describe('spriteSheetCache', () => {
  it('decodes at most MAX_CONCURRENT_DECODES sheets at a time', async () => {
    const handles = ['a', 'b', 'c', 'd'].map((u) => acquireSheet(u))
    await flush()
    expect(started).toHaveLength(MAX_CONCURRENT_DECODES)
    pending.shift()() // one finishes -> the next one starts
    await flush()
    expect(started).toHaveLength(MAX_CONCURRENT_DECODES + 1)
    await finishAll()
    await finishAll()
    await Promise.all(handles.map((h) => h.ready))
    expect(started).toHaveLength(4)
  })

  it('never decodes a sheet whose sprite was released before its turn', async () => {
    const keep = [acquireSheet('a'), acquireSheet('b')]
    const skipped = acquireSheet('c')
    skipped.release() // unmounted while still queued
    await flush()
    await finishAll()
    await finishAll()
    await Promise.all(keep.map((h) => h.ready))
    await expect(skipped.ready).rejects.toThrow()
    expect(started).not.toContain('c')
  })

  it('closes idle sheets immediately when the budget would be exceeded, never in-use ones', async () => {
    const a = acquireSheet('a')
    const b = acquireSheet('b')
    await flush()
    await finishAll()
    await Promise.all([a.ready, b.ready])
    a.release() // idle now (inside the grace period), b still in use
    expect(closed).toEqual([])
    // 'b' (61 MB, in use) + idle 'a' (61 MB) + a new 64 MB sheet > 192 MB
    // budget -> 'a' goes right away, without waiting for the grace timer.
    const c = acquireSheet('c')
    const d = acquireSheet('d')
    await flush()
    await finishAll()
    await finishAll()
    await Promise.all([c.ready, d.ready])
    expect(closed).toContain('a')
    expect(closed).not.toContain('b')
    expect(residentBytes()).toBeLessThanOrEqual(
      SPRITE_MEMORY_BUDGET + 64 * 1024 * 1024
    )
    b.release()
  })

  it('keeps a just-released sheet for a quick re-acquire, then frees it', async () => {
    const a = acquireSheet('a')
    await flush()
    await finishAll()
    await a.ready
    a.release()
    const again = acquireSheet('a') // remount within the grace period
    await flush()
    expect(started).toEqual(['a']) // not decoded a second time
    again.release()
    await vi.advanceTimersByTimeAsync(5000)
    expect(closed).toEqual(['a'])
  })
})
