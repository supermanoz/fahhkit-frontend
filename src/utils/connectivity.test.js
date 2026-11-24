import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OFFLINE_DEBOUNCE_MS,
  PROBE_EVERY_OFFLINE_MS,
  __resetForTests,
  __setFetchForTests,
  getConnectivity,
  probe,
  reportNetworkFailure,
  reportNetworkSuccess,
  setProbeUrlProvider,
  subscribeConnectivity,
} from './connectivity'

beforeEach(() => {
  vi.useFakeTimers()
  __resetForTests()
  setProbeUrlProvider(() => 'https://api.test/v1/ping')
})
afterEach(() => {
  vi.useRealTimers()
})

const failing = () => Promise.reject(new TypeError('Failed to fetch'))
const working = () => Promise.resolve({ type: 'opaque' })

describe('connectivity store', () => {
  it('starts online and unsettled', () => {
    expect(getConnectivity()).toEqual({ online: true, settled: false })
  })

  it('a successful probe settles online immediately', async () => {
    __setFetchForTests(working)
    expect(await probe()).toBe(true)
    expect(getConnectivity()).toEqual({ online: true, settled: true })
  })

  it('a failed probe goes offline only after the debounce', async () => {
    __setFetchForTests(failing)
    expect(await probe()).toBe(false)
    expect(getConnectivity().online).toBe(true) // not yet
    await vi.advanceTimersByTimeAsync(OFFLINE_DEBOUNCE_MS - 1)
    expect(getConnectivity().online).toBe(true)
    await vi.advanceTimersByTimeAsync(2)
    expect(getConnectivity().online).toBe(false)
  })

  it('a flap (fail then succeed within the debounce) never shows offline', async () => {
    const seen = []
    subscribeConnectivity((s) => seen.push(s.online))
    __setFetchForTests(failing)
    await probe()
    await vi.advanceTimersByTimeAsync(800)
    __setFetchForTests(working)
    await probe()
    await vi.advanceTimersByTimeAsync(OFFLINE_DEBOUNCE_MS * 2)
    expect(getConnectivity().online).toBe(true)
    expect(seen).not.toContain(false)
  })

  it('while offline it re-probes and recovers on its own', async () => {
    __setFetchForTests(failing)
    await probe()
    await vi.advanceTimersByTimeAsync(OFFLINE_DEBOUNCE_MS + 1)
    expect(getConnectivity().online).toBe(false)
    __setFetchForTests(working)
    await vi.advanceTimersByTimeAsync(PROBE_EVERY_OFFLINE_MS + 10)
    expect(getConnectivity().online).toBe(true)
  })

  it('any successful API response brings it online at once', async () => {
    __setFetchForTests(failing)
    await probe()
    await vi.advanceTimersByTimeAsync(OFFLINE_DEBOUNCE_MS + 1)
    expect(getConnectivity().online).toBe(false)
    reportNetworkSuccess()
    expect(getConnectivity().online).toBe(true)
  })

  it('an unconfirmed request failure triggers a probe, not an instant offline', async () => {
    const fetchSpy = vi.fn(working)
    __setFetchForTests(fetchSpy)
    reportNetworkFailure()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(getConnectivity().online).toBe(true)
  })

  it('concurrent probes share one request', async () => {
    const fetchSpy = vi.fn(working)
    __setFetchForTests(fetchSpy)
    await Promise.all([probe(), probe(), probe()])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
