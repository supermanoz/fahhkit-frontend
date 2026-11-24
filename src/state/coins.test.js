import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/territory', () => ({
  getTerritoryProfile: vi.fn(),
}))
vi.mock('../utils/appActivity', () => {
  let active = true
  const fns = new Set()
  return {
    isAppActive: () => active,
    onAppActivityChange: (f) => (fns.add(f), () => fns.delete(f)),
    __set: (v) => {
      active = v
      fns.forEach((f) => f())
    },
  }
})

import * as store from './coins'
import * as activity from '../utils/appActivity'

let fetch
beforeEach(() => {
  vi.useFakeTimers()
  fetch = vi.fn().mockResolvedValue(100)
  store.__resetForTests({ fetch })
  store.bindUser('u1')
})
afterEach(() => vi.useRealTimers())

describe('fahhcoin store', () => {
  it('claim answer updates every reader at once', () => {
    const seen = vi.fn()
    store.subscribe(() => seen(store.getCoins()))
    store.setCoins(1520, 'daily-claim')
    expect(store.getCoins()).toBe(1520)
    expect(seen).toHaveBeenCalledWith(1520)
  })

  it('dedupes in-flight refreshes and throttles to one per 5s', async () => {
    await Promise.all([store.refresh(), store.refresh(), store.refresh()])
    expect(fetch).toHaveBeenCalledTimes(1)
    await store.refresh()
    expect(fetch).toHaveBeenCalledTimes(1) // inside the gap
    vi.advanceTimersByTime(5001)
    await store.refresh()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('a forced refresh inside the gap runs once when it ends', async () => {
    await store.refresh()
    store.refresh({ force: true })
    store.refresh({ force: true })
    await vi.advanceTimersByTimeAsync(5100)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('a failed refresh keeps the last known balance', async () => {
    store.setCoins(300)
    fetch.mockRejectedValueOnce(new Error('offline'))
    await store.refresh()
    expect(store.getCoins()).toBe(300)
  })

  it('a bad value never zeroes the balance', async () => {
    store.setCoins(300)
    fetch.mockResolvedValueOnce(undefined)
    await store.refresh()
    expect(store.getCoins()).toBe(300)
  })

  it('an older read cannot overwrite a newer claim answer', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const p = store.refresh()
    store.setCoins(1520, 'daily-claim') // claim answered meanwhile
    resolve(1500) // stale profile read lands afterwards
    await p
    expect(store.getCoins()).toBe(1520)
  })

  it('returning to the app refetches', async () => {
    await store.refresh()
    const off = store.startResumeRefresh()
    vi.advanceTimersByTime(6000)
    activity.__set(false)
    activity.__set(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(2)
    off()
  })

  it('a different user never sees the previous balance', () => {
    store.setCoins(300)
    store.bindUser('u2')
    expect(store.getCoins()).toBeNull()
  })

  it('two consumers show the same number after a claim and after a PvP result', () => {
    const a = () => store.getCoins()
    const b = () => store.getCoins()
    store.setCoins(1500, 'profile')
    store.setCoins(1520, 'daily-claim')
    expect([a(), b()]).toEqual([1520, 1520])
    store.setCoins(1520 + 40, 'pvp-result')
    expect([a(), b()]).toEqual([1560, 1560])
  })

  it('applyDelta writes now; a read that started before it is ignored', async () => {
    store.setCoins(100, 'profile')
    let resolve
    fetch.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const p = store.refresh()
    store.applyDelta(-20, 'club-donate')
    resolve(100) // stale: does not include the donation
    await p
    expect(store.getCoins()).toBe(80)
  })

  it('logout resets the balance; so does an account switch', () => {
    store.setCoins(300, 'profile')
    store.bindUser(null)
    expect(store.getCoins()).toBeNull()
    store.bindUser('u2')
    store.setCoins(5, 'profile')
    store.bindUser('u3')
    expect(store.getCoins()).toBeNull()
  })

  it('logs every update with source, old and new', () => {
    store.setCoins(10, 'profile')
    store.applyDelta(5, 'test')
    expect(store.coinLog.slice(-2)).toMatchObject([
      { source: 'profile', old: null, next: 10 },
      { source: 'test', old: 10, next: 15 },
    ])
  })

  it('a mail balance older than the last write is ignored', () => {
    store.setCoins(500, 'profile')
    expect(store.setCoinsIfNewer(900, Date.now() - 60000, 'mail-pvp')).toBe(
      false
    )
    expect(store.getCoins()).toBe(500)
    expect(store.setCoinsIfNewer(900, Date.now() + 1000, 'mail-pvp')).toBe(true)
    expect(store.getCoins()).toBe(900)
  })
})
