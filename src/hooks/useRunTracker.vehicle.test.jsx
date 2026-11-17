import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { buildTrack } from '../test/gpsTracks'

const geo = vi.hoisted(() => ({ cb: null }))
const notif = vi.hoisted(() => ({
  start: vi.fn(),
  update: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
}))
const alerts = vi.hoisted(() => ({
  warn: vi.fn(),
  discarded: vi.fn(),
  reset: vi.fn(),
}))

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
  startRunNotification: notif.start,
  updateRunNotification: notif.update,
  pauseRunNotification: notif.pause,
  stopRunNotification: notif.stop,
}))
vi.mock('../utils/vehicleAlerts', () => ({
  VEHICLE_NOTIFICATION_HEADER: 'Vehicle detected',
  alertVehicleWarning: alerts.warn,
  alertVehicleDiscarded: alerts.discarded,
  resetVehicleAlertCooldown: alerts.reset,
}))

import { useRunTracker } from './useRunTracker'
import { VehicleState } from '../utils/vehicleDetection'

beforeEach(() => {
  vi.clearAllMocks()
  geo.cb = null
  localStorage.clear()
  Object.defineProperty(navigator, 'geolocation', {
    value: {},
    configurable: true,
  })
})

// Feed a synthetic track through the hook's watchPosition callback exactly
// like the (background) geolocation plugin would.
async function drive(result, fixes) {
  for (const fix of fixes) {
    await act(async () => {
      geo.cb({
        coords: {
          latitude: fix.lat,
          longitude: fix.lng,
          accuracy: fix.accuracy,
          speed: -1, // iOS-style "unknown"
          altitude: null,
          heading: null,
        },
        timestamp: fix.timestamp,
      })
    })
  }
}

describe('useRunTracker vehicle detection (native path)', () => {
  it('warns once (notification header + alert), then discards the run with nothing saved', async () => {
    const { result } = renderHook(() => useRunTracker())
    await act(async () => {
      result.current.start(null)
    })
    await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))

    // 20 s walking, then a car at 15 m/s.
    const fixes = buildTrack(
      [
        { seconds: 21, speed: 1.4 },
        { seconds: 90, speed: 15 },
      ],
      { stepSeconds: 3 }
    )
    let warned = false
    for (const fix of fixes) {
      await drive(result, [fix])
      if (result.current.vehicleState === VehicleState.VEHICLE && !warned) {
        warned = true
        expect(result.current.vehicleWarningDeadline).toBeGreaterThan(
          Date.now()
        )
        expect(alerts.warn).toHaveBeenCalledTimes(1)
        expect(notif.update).toHaveBeenCalledWith({
          title: 'Vehicle detected',
        })
      }
    }

    expect(warned).toBe(true)
    expect(alerts.warn).toHaveBeenCalledTimes(1) // one warning per episode
    expect(alerts.discarded).toHaveBeenCalledTimes(1)
    expect(result.current.vehicleDiscarded).toBe(true)
    expect(result.current.status).toBe('idle')
    expect(result.current.pendingRun).toBeNull()
    expect(notif.stop).toHaveBeenCalled()
    expect(localStorage.getItem('fahhkit_active_run')).toBeNull()

    act(() => result.current.dismissVehicleDiscarded())
    expect(result.current.vehicleDiscarded).toBe(false)
  })

  it('keeps counting distance for a normal jog and never alerts', async () => {
    const { result } = renderHook(() => useRunTracker())
    await act(async () => {
      result.current.start(null)
    })
    await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))
    await drive(result, buildTrack([{ seconds: 120, speed: 3 }]))
    expect(result.current.distance).toBeGreaterThan(300)
    expect(result.current.vehicleState).toBe(VehicleState.RUNNING)
    expect(alerts.warn).not.toHaveBeenCalled()
    expect(result.current.status).toBe('tracking')
  })
})
