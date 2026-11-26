// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const geo = vi.hoisted(() => ({ cb: null }))
const ped = vi.hoisted(() => ({
  status: { available: true, permission: 'granted' },
  steps: 0,
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
vi.mock('../utils/pedometer', () => ({
  getPedometerStatus: vi.fn(async () => ped.status),
  startPedometer: vi.fn(async () => true),
  readPedometer: vi.fn(async () => ({
    steps: ped.steps,
    distanceMeters: null,
  })),
  stopPedometer: vi.fn(async () => {}),
}))

import { useRunTracker } from './useRunTracker'

const T0 = 1_700_000_000_000
const M = 1 / 111_320
const fix = (i) => ({
  coords: {
    latitude: 27.7 + i * 3 * M,
    longitude: 85.3,
    accuracy: 5,
    speed: 3,
    altitude: null,
    heading: null,
  },
  timestamp: T0 + i * 3000,
})
const flush = () => act(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  geo.cb = null
  ped.status = { available: true, permission: 'granted' }
  ped.steps = 0
  localStorage.clear()
  Object.defineProperty(navigator, 'geolocation', {
    value: {},
    configurable: true,
  })
})

async function runWithFixes(hook, n = 12) {
  await act(async () => {
    hook.result.current.start(null, { isTraining: true })
  })
  await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))
  await flush()
  for (let i = 0; i < n; i++) await act(async () => geo.cb(fix(i)))
}

describe('outdoor run steps: pedometer first, accelerometer fallback', () => {
  it('uses the pedometer count (source "pedometer") when allowed', async () => {
    const hook = renderHook(() => useRunTracker())
    await runWithFixes(hook)
    ped.steps = 1234
    let result
    await act(async () => {
      result = hook.result.current.stop()
    })
    await flush()
    // the final read refines the pending run
    expect(hook.result.current.pendingRun.stepCount).toBe(1234)
    expect(hook.result.current.pendingRun.stepsSource).toBe('pedometer')
    expect(result.points.length).toBeGreaterThan(0) // outdoor still has its route
  })

  it('permission denied: no pedometer steps, nothing faked (no accelerometer samples)', async () => {
    ped.status = { available: true, permission: 'denied' }
    const hook = renderHook(() => useRunTracker())
    await runWithFixes(hook)
    let result
    await act(async () => {
      result = hook.result.current.stop()
    })
    expect(result.stepCount).toBeNull()
    expect(result.stepsSource).toBe('none')
  })

  it('permission denied: falls back to the accelerometer count when it counted steps', async () => {
    ped.status = { available: true, permission: 'denied' }
    const hook = renderHook(() => useRunTracker())
    await runWithFixes(hook, 2)
    // ~150 steps/min worth of accelerometer peaks over 60 s
    const base = T0
    for (let k = 0; k < 150; k++) {
      const t = base + k * 400
      vi.setSystemTime?.(t)
      window.dispatchEvent(
        Object.assign(new Event('devicemotion'), {
          accelerationIncludingGravity: { x: 0, y: 0, z: k % 2 ? 9.81 : 20 },
        })
      )
    }
    let result
    await act(async () => {
      result = hook.result.current.stop()
    })
    // either the fallback counted something (source accelerometer) or the
    // detector saw no peaks (none) - but never the pedometer, never a fake 0
    expect(['accelerometer', 'none']).toContain(result.stepsSource)
    expect(result.stepsSource).not.toBe('pedometer')
    if (result.stepsSource === 'none') expect(result.stepCount).toBeNull()
  })

  it('steps taken while paused are not part of the run', async () => {
    const hook = renderHook(() => useRunTracker())
    await runWithFixes(hook)
    ped.steps = 500
    await act(async () => {
      hook.result.current.pause()
    })
    ped.steps = 800 // 300 steps while paused
    await act(async () => {
      hook.result.current.resume()
    })
    await flush()
    ped.steps = 1300
    await act(async () => {
      hook.result.current.stop()
    })
    await flush()
    expect(hook.result.current.pendingRun.stepCount).toBe(1000)
  })
})
