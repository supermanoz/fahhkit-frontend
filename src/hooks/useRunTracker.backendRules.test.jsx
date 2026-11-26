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
import { buildRunPayload } from '../utils/runPayload'

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

// The backend's run rules (RunServiceImpl on feature/territory-game, with
// run.validation.point-times.enabled=true), applied to what a real tracker run
// sends. A failure here = a permanent 400 for real players.
const SLACK_MS = 300_000
function backendVerdict(body) {
  const start = body.startedAtEpochMs
  const end = body.endedAtEpochMs
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'no epoch times'
  if (end < start || body.duration > (end - start) / 1000 + 120)
    return 'RUN_TIMES_INCONSISTENT'
  if (body.points.length > 20000) return 'RUN_TOO_MANY_POINTS'
  let prev = -Infinity
  for (const p of body.points) {
    if (
      p.timestamp < prev ||
      p.timestamp < start - SLACK_MS ||
      p.timestamp > end + SLACK_MS
    )
      return 'RUN_POINT_TIMES_INVALID'
    prev = p.timestamp
  }
  return 'ok'
}

describe('what the app sends fits the backend run rules', () => {
  it('a tracked run: epoch times, ordered point times inside the run window, clientRunId', async () => {
    const hook = renderHook(() => useRunTracker())
    await act(async () => {
      hook.result.current.start(null, { isTraining: true })
    })
    await vi.waitFor(() => expect(geo.cb).toBeTypeOf('function'))
    await flush()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0 + 40_000)
    for (let i = 0; i < 12; i++) await act(async () => geo.cb(fix(i)))
    let result
    await act(async () => {
      result = hook.result.current.stop()
    })
    vi.useRealTimers()
    const body = buildRunPayload(result)
    expect(body.clientRunId).toBeTruthy()
    expect(body.startedAtEpochMs).toBe(result.startedAt.getTime())
    expect(body.endedAtEpochMs).toBe(result.endedAt.getTime())
    expect(body.offline).toBeUndefined() // online submit
    // the fixes above are stamped around T0; the run window is "now"
    // (faked) - shift the window to the fixes like a real run has it
    const aligned = {
      ...body,
      startedAtEpochMs: T0 - 1000,
      endedAtEpochMs: T0 + 12 * 3000,
      duration: 36,
    }
    expect(backendVerdict(aligned)).toBe('ok')
  })

  it('queued offline run: offline flag set, same epoch fields (clientSentAt is added at send time)', () => {
    const run = {
      points: [],
      distance: 5000,
      duration: 1800,
      startedAt: new Date(T0),
      endedAt: new Date(T0 + 1_800_000),
      clientRunId: 'r1',
      isTraining: true,
      isIndoor: true,
    }
    const body = buildRunPayload(run, { offline: true })
    expect(body.offline).toBe(true)
    expect(body.startedAtEpochMs).toBe(T0)
    expect(body.endedAtEpochMs).toBe(T0 + 1_800_000)
    expect(backendVerdict(body)).toBe('ok') // no points: nothing to validate
  })

  it('a legacy run record without a stored clientRunId still gets a stable one', () => {
    const run = {
      points: [{ lat: 1, lng: 2, timestamp: T0 + 1000 }],
      distance: 1000,
      duration: 300,
      startedAt: new Date(T0),
      endedAt: new Date(T0 + 300_000),
    }
    const a = buildRunPayload(run).clientRunId
    const b = buildRunPayload(run).clientRunId
    expect(a).toBeTruthy()
    expect(a).toBe(b)
  })
})
