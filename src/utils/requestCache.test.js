import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  dedupe,
  cached,
  peek,
  invalidate,
  clearRequestCache,
} from './requestCache'

beforeEach(() => {
  clearRequestCache()
  vi.useRealTimers()
})

describe('dedupe', () => {
  it('shares one promise for concurrent callers, then lets a new call through', async () => {
    const fn = vi.fn(() => Promise.resolve(1))
    const [a, b] = await Promise.all([dedupe('k', fn), dedupe('k', fn)])
    expect([a, b]).toEqual([1, 1])
    expect(fn).toHaveBeenCalledTimes(1)
    await dedupe('k', fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('a rejection is shared and not cached', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('x')))
    await expect(
      Promise.all([dedupe('e', fn), dedupe('e', fn)])
    ).rejects.toThrow('x')
    expect(fn).toHaveBeenCalledTimes(1)
    await expect(dedupe('e', fn)).rejects.toThrow('x')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('cached', () => {
  it('serves within the TTL, refetches after it, peek shows stale', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    expect(await cached('c', fn, { ttlMs: 1000 })).toBe('a')
    expect(await cached('c', fn, { ttlMs: 1000 })).toBe('a')
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1500)
    expect(peek('c').value).toBe('a')
    expect(await cached('c', fn, { ttlMs: 1000 })).toBe('b')
  })
  it('invalidate drops matching keys only', async () => {
    await cached('store:1', () => Promise.resolve(1))
    await cached('mail:1', () => Promise.resolve(2))
    invalidate('store:')
    expect(peek('store:1')).toBeNull()
    expect(peek('mail:1')).not.toBeNull()
  })
  it('stays bounded', async () => {
    for (let i = 0; i < 100; i++)
      await cached(`k${i}`, () => Promise.resolve(i))
    expect(peek('k0')).toBeNull()
    expect(peek('k99')).not.toBeNull()
  })
})
