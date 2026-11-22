import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn(() => Promise.resolve())
vi.mock('./geo', () => ({ isNative: true, platform: 'android' }))
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    start: () => Promise.resolve(),
    update,
    pause: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  }),
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
}))

beforeEach(() => {
  vi.useFakeTimers()
  update.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('updateRunNotification throttle', () => {
  it('sends at most one distance update per 5 s, latest values win', async () => {
    const { updateRunNotification, stopRunNotification } =
      await import('./runNotification')
    stopRunNotification() // reset the limiter
    vi.setSystemTime(100000)
    updateRunNotification({ distanceMeters: 10 })
    updateRunNotification({ distanceMeters: 20 })
    updateRunNotification({ distanceMeters: 30 })
    expect(update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1][0].distanceMeters).toBe(30)
  })
  it('title changes go out immediately and stop cancels the queued update', async () => {
    const { updateRunNotification, stopRunNotification } =
      await import('./runNotification')
    stopRunNotification()
    vi.setSystemTime(500000)
    updateRunNotification({ distanceMeters: 1 })
    updateRunNotification({ distanceMeters: 2 }) // queued
    updateRunNotification({ title: 'Vehicle detected' }) // immediate
    expect(update).toHaveBeenCalledTimes(2)
    updateRunNotification({ distanceMeters: 3 }) // queued again
    stopRunNotification()
    vi.advanceTimersByTime(10000)
    expect(update).toHaveBeenCalledTimes(2)
  })
})
