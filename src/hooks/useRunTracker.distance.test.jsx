import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const geo = vi.hoisted(() => ({ cb: null }))

vi.mock('../utils/geo', () => ({
  isNative: true,
  platform: 'android',
  watchPosition: vi.fn(async (cb) => {
    geo.cb = cb
    return 1
  }),
  clearWatch: vi.fn(),
}))
vi.mock('./useWakeLock', () => ({
  useWakeLock: () => ({ request: vi.fn(), release: vi.fn() }),
}))
vi.mock('../utils/runNotification', () => ({
  startRunNotification: vi.fn(),
  updateRunNotification: vi.fn(),
  pauseRunNotification: vi.fn(),
  stopRunNotification: vi.fn(),
}))
vi.mock('../utils/vehicleAlerts', () => ({
  VEHICLE_NOTIFICATION_HEADER: 'x',
  alertVehicleWarning: vi.fn(),
  alertVehicleDiscarded: vi.fn(),
  resetVehicleAlertCooldown: vi.fn(),
}))

import { useRunTracker } from './useRunTracker'

beforeEach(() => {
  vi.clearAllMocks()
  geo.cb = null
  localStorage.clear()
  Object.defineProperty(navigator, 'geolocation', {
    value: {},
    configurable: true,
  })
})

const T0 = 1_700_000_000_000
const M = 1 / 111_320
const fix = (i, { accuracy, north = 0, speed = null, step = 3 }) => ({
  coords: {
    latitude: 27.7 + north * M,
    longitude: 85.3,
    accuracy,
    speed,
    altitude: null,
    heading: null,
  },
  timestamp: T0 + i * step * 1000,
})
async function send(fixes) {
  for (const f of fixes) await act(async () => geo.cb(f))
}
async function begin() {
  const hook = renderHook(() => useRunTracker())
  await act(async () => {
    hook.result.current.start(null)
  })
  await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))
  return hook
}
// Deterministic pseudo-noise.
const noise = (i, amp) => Math.sin(i * 12.9898) * amp

describe('credited distance (the tracker uses utils/distanceFilter.js)', () => {
  it('standing still for 10 min with 15 m accuracy credits under 20 m', async () => {
    const { result } = await begin()
    await send(
      Array.from({ length: 200 }, (_, i) =>
        fix(i, { accuracy: 15, north: noise(i, 11), speed: 0 })
      )
    )
    expect(result.current.distance).toBeLessThan(20)
  })

  it('a 1.4 m/s walk with 15 m accuracy is credited within 5% (raw hops would be ~3x)', async () => {
    const { result } = await begin()
    const n = 100
    await send(
      Array.from({ length: n }, (_, i) =>
        fix(i, {
          accuracy: 15,
          north: i * 3 * 1.4 + noise(i, 9),
          speed: 1.4,
        })
      )
    )
    const truth = (n - 1) * 3 * 1.4
    expect(result.current.distance).toBeGreaterThan(truth * 0.95)
    expect(result.current.distance).toBeLessThan(truth * 1.05)
  })

  it('the route keeps every raw point; only the credited length is filtered', async () => {
    const { result } = await begin()
    await send(
      Array.from({ length: 30 }, (_, i) =>
        fix(i, { accuracy: 6, north: i * 4.2, speed: 1.4 })
      )
    )
    expect(result.current.path.length).toBe(30)
  })

  it('pause then resume: the walk during the pause is not credited', async () => {
    const { result } = await begin()
    await send(
      Array.from({ length: 20 }, (_, i) =>
        fix(i, { accuracy: 5, north: i * 9, speed: 3 })
      )
    )
    const before = result.current.distance
    act(() => result.current.pause())
    await act(async () => {
      result.current.resume()
    })
    await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))
    // resumed 500 m further along; then walks on
    await send(
      Array.from({ length: 20 }, (_, i) =>
        fix(30 + i, { accuracy: 5, north: 700 + i * 9, speed: 3 })
      )
    )
    const after = result.current.distance
    expect(after - before).toBeLessThan(19 * 9 * 1.1)
    expect(after - before).toBeGreaterThan(19 * 9 * 0.8)
  })

  it('exposes calibration numbers for the debug panel (raw vs counted, drift, histogram)', async () => {
    const { result } = await begin()
    await send(
      Array.from({ length: 60 }, (_, i) =>
        fix(i, { accuracy: 12, north: noise(i, 8), speed: 0.3 })
      )
    )
    const info = result.current.getDebugInfo()
    expect(info.distance.rawMeters).toBeGreaterThan(0)
    expect(info.distance.countedMeters).toBeLessThan(5)
    expect(info.distance.driftDrops).toBeGreaterThan(5)
    expect(info.distance.histogram.reduce((a, b) => a + b, 0)).toBeGreaterThan(
      8
    )
  })

  it('calibration is only logged when the debug flag is on', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const run = async () => {
      const { result } = await begin()
      await send(
        Array.from({ length: 6 }, (_, i) =>
          fix(i, { accuracy: 8, north: i * 4, speed: 1.4 })
        )
      )
      act(() => {
        result.current.stop()
      })
    }
    await run()
    expect(spy).not.toHaveBeenCalledWith(
      '[distance-calibration]',
      expect.anything()
    )
    localStorage.setItem('fahhkit_anticheat_debug', '1')
    geo.cb = null
    await run()
    expect(spy).toHaveBeenCalledWith(
      '[distance-calibration]',
      expect.objectContaining({ rawPathMeters: expect.any(Number) })
    )
    spy.mockRestore()
  })
})
