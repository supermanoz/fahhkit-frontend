// @vitest-environment jsdom
// An ACTIVE RUN must keep tracking at full accuracy when the app is hidden /
// backgrounded (screen locked): GPS watch, timers, distance and the Live
// Activity / notification updates all continue. Hiding the app may only pause
// animations, polling and map redraws (utils/appActivity.js).
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { buildTrack } from '../test/gpsTracks'

const geo = vi.hoisted(() => ({ cb: null, opts: null }))
const notif = vi.hoisted(() => ({
  start: vi.fn(),
  update: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
}))
const clearWatch = vi.hoisted(() => vi.fn())

vi.mock('@capacitor/app', () => ({
  App: { addListener: () => Promise.resolve({ remove() {} }) },
}))
vi.mock('../utils/geo', () => ({
  isNative: true,
  platform: 'ios',
  watchPosition: vi.fn(async (cb, _err, opts) => {
    geo.cb = cb
    geo.opts = opts
    return 7
  }),
  clearWatch,
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
  alertVehicleWarning: vi.fn(),
  alertVehicleDiscarded: vi.fn(),
  resetVehicleAlertCooldown: vi.fn(),
}))

import { useRunTracker } from './useRunTracker'
import { isAppActive } from '../utils/appActivity'

let hidden = false
function setHidden(value) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.clearAllMocks()
  geo.cb = null
  geo.opts = null
  hidden = false
  localStorage.clear()
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
  Object.defineProperty(navigator, 'geolocation', {
    value: {},
    configurable: true,
  })
})
afterEach(() => setHidden(false))

async function feed(fixes) {
  for (const fix of fixes) {
    await act(async () => {
      geo.cb({
        coords: {
          latitude: fix.lat,
          longitude: fix.lng,
          accuracy: fix.accuracy,
          speed: 3,
          altitude: null,
          heading: null,
        },
        timestamp: fix.timestamp,
      })
    })
  }
}

describe('active run vs. app hidden', () => {
  it('starts the watch at full accuracy', async () => {
    const { result } = renderHook(() => useRunTracker())
    await act(async () => {
      result.current.start(null)
    })
    await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))
    expect(geo.opts).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 })
  })

  it('keeps the watch, accepts points, accumulates distance and updates the Live Activity while hidden', async () => {
    const { result } = renderHook(() => useRunTracker())
    await act(async () => {
      result.current.start(null)
    })
    await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))

    const fixes = buildTrack([{ seconds: 120, speed: 3 }], { stepSeconds: 3 })
    await feed(fixes.slice(0, 10))
    const before = result.current.distance
    expect(before).toBeGreaterThan(0)

    act(() => setHidden(true)) // screen locked / app backgrounded
    expect(isAppActive()).toBe(false)
    expect(clearWatch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('tracking')

    notif.update.mockClear()
    const pointsBefore = result.current.path.length
    await feed(fixes.slice(10, 30))
    expect(clearWatch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('tracking')
    expect(result.current.distance).toBeGreaterThan(before)
    expect(result.current.path.length).toBeGreaterThan(pointsBefore)
    expect(notif.update).toHaveBeenCalled() // Live Activity keeps updating
    expect(notif.stop).not.toHaveBeenCalled()
  })

  it('the run timer keeps ticking while hidden', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useRunTracker())
      await act(async () => {
        result.current.start(null)
      })
      act(() => setHidden(true))
      const t0 = result.current.elapsedSeconds
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })
      expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(t0 + 4)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('run tracking is structurally independent of app visibility', () => {
  it('useRunTracker and the native geo layer never import the visibility gates', () => {
    for (const file of ['useRunTracker.js', '../utils/geo.js']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(src).not.toMatch(/appActivity|visibleInterval|useAppActive/)
    }
  })
})
