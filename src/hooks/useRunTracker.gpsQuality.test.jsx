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
const fix = (i, { accuracy, north = 0, speed = null }) => ({
  coords: {
    latitude: 27.7 + north / 111_320,
    longitude: 85.3,
    accuracy,
    speed,
    altitude: null,
    heading: null,
  },
  timestamp: T0 + i * 3000,
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

describe('a run lost to GPS quality ends with a neutral GPS message, not a fraud one', () => {
  it('every fix worse than 20 m -> "GPS signal was weak"', async () => {
    const { result } = await begin()
    await send(Array.from({ length: 12 }, (_, i) => fix(i, { accuracy: 35 })))
    act(() => {
      result.current.stop()
    })
    expect(result.current.runIssue).toMatchObject({
      kind: 'weak-gps',
      title: 'GPS signal was weak',
    })
    expect(result.current.runIssue.message).toMatch(/try again/i)
    act(() => result.current.clearRunIssue())
    expect(result.current.runIssue).toBeNull()
  })

  it('no fix at all -> "couldn\'t find your location"', async () => {
    const { result } = await begin()
    act(() => {
      result.current.stop()
    })
    expect(result.current.runIssue.kind).toBe('no-fix')
  })

  it('a normal short run with good GPS has no GPS issue', async () => {
    const { result } = await begin()
    await send(
      Array.from({ length: 8 }, (_, i) =>
        fix(i, { accuracy: 5, north: i * 6, speed: 2 })
      )
    )
    act(() => {
      result.current.stop()
    })
    expect(result.current.runIssue).toBeNull()
  })
})

describe('GPS wobble stays out of the trace', () => {
  it('a phone standing still with 15 m fixes jittering ~12 m is not recorded as movement', async () => {
    const { result } = await begin()
    const jitter = [0, 9, -8, 11, -10, 7, -9, 12, -11, 8, -7, 10]
    await send(
      jitter.map((north, i) => fix(i, { accuracy: 15, north, speed: 0 }))
    )
    // first fix + at most a resync fix: nowhere near one point per fix
    expect(result.current.path.length).toBeLessThanOrEqual(4)
    expect(result.current.distance).toBeLessThan(40)
  })

  it('a real walk with 15 m accuracy is still recorded (the chip says we move)', async () => {
    const { result } = await begin()
    await send(
      Array.from({ length: 12 }, (_, i) =>
        fix(i, { accuracy: 15, north: i * 4.2, speed: 1.4 })
      )
    )
    expect(result.current.path.length).toBe(12)
    expect(result.current.distance).toBeGreaterThan(30)
  })
})
