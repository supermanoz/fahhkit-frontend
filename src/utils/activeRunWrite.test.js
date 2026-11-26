// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __setDbForTests, createMemoryDb } from './offlineDb'
import {
  LOCAL_EVERY_MS,
  clearActiveRun,
  flushActiveRun,
  loadActiveRun,
  saveActiveRun,
} from './run'
import { clearStorageProblem, getStorageProblem } from './storageHealth'

const KEY = 'fahhkit_active_run'
const rec = (n, extra = {}) => ({
  startedAt: '2026-03-10T06:00:00.000Z',
  points: Array.from({ length: n }, (_, i) => ({ lat: i, lng: i })),
  ...extra,
})
let setItem

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  localStorage.clear()
  __setDbForTests(createMemoryDb())
  clearActiveRun()
  clearStorageProblem()
  setItem = vi.spyOn(Storage.prototype, 'setItem')
})
afterEach(() => {
  clearActiveRun()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const stored = () => JSON.parse(localStorage.getItem(KEY) || 'null')

describe('active-run persistence (crash recovery)', () => {
  it('writes the first record at once, then coalesces point-by-point saves', () => {
    saveActiveRun(rec(1))
    expect(setItem).toHaveBeenCalledTimes(1)
    for (let n = 2; n <= 30; n++) saveActiveRun(rec(n))
    expect(setItem).toHaveBeenCalledTimes(1) // 29 saves, no extra writes yet
    vi.advanceTimersByTime(LOCAL_EVERY_MS + 1)
    expect(setItem).toHaveBeenCalledTimes(2)
    expect(stored().points).toHaveLength(30) // the LATEST state, nothing lost
  })
  it('stop and pause are written immediately', () => {
    saveActiveRun(rec(1))
    saveActiveRun(rec(5, { paused: true }))
    expect(stored().points).toHaveLength(5)
    saveActiveRun(rec(9, { stopped: true }))
    expect(stored().points).toHaveLength(9)
  })
  it('loadActiveRun sees a pending (not yet written) record', () => {
    saveActiveRun(rec(1))
    saveActiveRun(rec(7))
    expect(loadActiveRun().points).toHaveLength(7)
  })
  it('flushActiveRun (app hidden / closing) writes the pending record', () => {
    saveActiveRun(rec(1))
    saveActiveRun(rec(8))
    expect(stored().points).toHaveLength(1)
    flushActiveRun()
    expect(stored().points).toHaveLength(8)
  })
  it('clearing the run cancels a pending write (a finished run never comes back)', () => {
    saveActiveRun(rec(1))
    saveActiveRun(rec(4))
    clearActiveRun()
    vi.advanceTimersByTime(LOCAL_EVERY_MS * 3)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(loadActiveRun()).toBeNull()
  })
  it('a full phone is reported (not silent) and cleared by the next good write', () => {
    setItem.mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    saveActiveRun(rec(1))
    expect(getStorageProblem()).toBe('full')
    vi.advanceTimersByTime(LOCAL_EVERY_MS + 1)
    saveActiveRun(rec(2))
    expect(getStorageProblem()).toBeNull()
  })
})
