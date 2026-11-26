// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const ped = vi.hoisted(() => ({
  status: { available: true, permission: 'granted' },
  steps: 0,
  distance: null,
  started: [],
  listeners: [],
}))

vi.mock('../utils/pedometer', () => ({
  getPedometerStatus: vi.fn(async () => ped.status),
  startPedometer: vi.fn(async (startedAtMs, cb) => {
    ped.started.push(startedAtMs)
    ped.listeners.push(cb)
    return true
  }),
  readPedometer: vi.fn(async () => ({
    steps: ped.steps,
    distanceMeters: ped.distance,
  })),
  stopPedometer: vi.fn(async () => {}),
}))
const wake = vi.hoisted(() => ({ request: vi.fn(), release: vi.fn() }))
vi.mock('./useWakeLock', () => ({ useWakeLock: () => wake }))

import { useIndoorRun, INDOOR_STORAGE_KEY } from './useIndoorRun'

const T0 = 1_700_000_000_000
let clock = T0
const now = () => clock
const flush = () => act(async () => {})

beforeEach(() => {
  localStorage.clear()
  clock = T0
  ped.status = { available: true, permission: 'granted' }
  ped.steps = 0
  ped.distance = null
  ped.started = []
  ped.listeners = []
  wake.request.mockClear()
  wake.release.mockClear()
})

async function begin() {
  const hook = renderHook(() => useIndoorRun({ now }))
  await act(async () => {
    await hook.result.current.start()
  })
  await flush()
  return hook
}

describe('useIndoorRun', () => {
  it('start: running, persisted, screen kept awake, pedometer counting', async () => {
    const { result } = await begin()
    expect(result.current.status).toBe('running')
    expect(result.current.active).toBe(true)
    expect(JSON.parse(localStorage.getItem(INDOOR_STORAGE_KEY))).toMatchObject({
      status: 'running',
      startedAtMs: T0,
    })
    expect(wake.request).toHaveBeenCalled()
    expect(ped.started).toEqual([T0])
  })

  it('backgrounding: the timer reads wall-clock time on return', async () => {
    const { result } = await begin()
    clock = T0 + 17 * 60_000 // app was in the background for 17 minutes
    ped.steps = 2000
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()
    expect(result.current.durationSeconds).toBe(17 * 60)
    expect(result.current.steps).toBe(2000)
  })

  it('app killed and reopened: the run resumes with the same start time', async () => {
    const first = await begin()
    first.unmount()
    clock = T0 + 40 * 60_000
    ped.steps = 5000
    const { result } = renderHook(() => useIndoorRun({ now }))
    await flush()
    expect(result.current.status).toBe('running')
    expect(result.current.durationSeconds).toBe(40 * 60)
    // the pedometer is asked to count from the ORIGINAL start
    expect(ped.started.at(-1)).toBe(T0)
    expect(result.current.steps).toBe(5000)
  })

  it('pause freezes the clock and takes the paused steps out', async () => {
    const { result } = await begin()
    clock = T0 + 10 * 60_000
    ped.steps = 1500
    await act(async () => {
      await result.current.pause()
    })
    expect(result.current.paused).toBe(true)
    clock = T0 + 20 * 60_000 // 10 min standing around, 300 steps
    ped.steps = 1800
    expect(result.current.durationSeconds).toBe(600)
    await act(async () => {
      await result.current.resume()
    })
    clock = T0 + 30 * 60_000
    ped.steps = 3300
    await act(async () => {
      await result.current.end()
    })
    expect(result.current.status).toBe('confirm')
    expect(result.current.durationSeconds).toBe(20 * 60)
    expect(result.current.steps).toBe(3000) // 3300 - 300 while paused
  })

  it('end -> confirm: edit the distance, submit with EMPTY points', async () => {
    const { result } = await begin()
    clock = T0 + 30 * 60_000
    ped.steps = 4500 // 150 spm
    await act(async () => {
      await result.current.end()
    })
    // prefill = steps x 0.75 m
    expect(result.current.estimate).toEqual({ meters: 3375, source: 'steps' })
    let out
    act(() => {
      out = result.current.finish(5000) // the treadmill says 5.00 km
    })
    expect(out.ok).toBe(true)
    expect(out.run).toMatchObject({
      isTraining: true,
      isIndoor: true,
      points: [],
      distance: 5000,
      duration: 1800,
      stepCount: 4500,
      stepsSource: 'pedometer',
      distanceSource: 'manual',
      challengeId: null,
      clubWarId: null,
    })
    expect(out.run.clientRunId).toBeTruthy()
    expect(out.run.startedAt).toEqual(new Date(T0))
  })

  it('accepting the prefilled distance is recorded as an estimate', async () => {
    const { result } = await begin()
    clock = T0 + 30 * 60_000
    ped.steps = 4500
    await act(async () => {
      await result.current.end()
    })
    let out
    act(() => {
      out = result.current.finish(3375)
    })
    expect(out.run.distanceSource).toBe('steps')
  })

  it('plausibility errors block the run and say why', async () => {
    const { result } = await begin()
    clock = T0 + 10 * 60_000
    await act(async () => {
      await result.current.end()
    })
    let out
    act(() => {
      out = result.current.finish(10000) // 10 km in 10 min = 1:00 /km
    })
    expect(out.ok).toBe(false)
    expect(out.errors.map((e) => e.code)).toContain('too_fast')
    expect(out.run).toBeUndefined()
    act(() => {
      out = result.current.finish(null)
    })
    expect(out.errors.map((e) => e.code)).toContain('no_distance')
  })

  it('step permission denied: no steps, no estimate - the player types the distance', async () => {
    ped.status = { available: true, permission: 'denied' }
    const { result } = await begin()
    clock = T0 + 30 * 60_000
    await act(async () => {
      await result.current.end()
    })
    expect(result.current.steps).toBeNull()
    expect(result.current.estimate).toBeNull()
    expect(ped.started).toEqual([]) // never started counting
    let out
    act(() => {
      out = result.current.finish(5000)
    })
    expect(out.ok).toBe(true)
    expect(out.run.stepCount).toBeNull() // omitted from the payload, never 0
    expect(out.run.stepsSource).toBeNull()
  })

  it('"Keep running" from the confirm screen does not count the confirm time', async () => {
    const { result } = await begin()
    clock = T0 + 10 * 60_000
    await act(async () => {
      await result.current.end()
    })
    clock = T0 + 15 * 60_000 // 5 min on the confirm screen
    act(() => result.current.resumeFromConfirm())
    expect(result.current.status).toBe('running')
    clock = T0 + 20 * 60_000
    await act(async () => {
      await result.current.end()
    })
    expect(result.current.durationSeconds).toBe(15 * 60)
  })

  it('a kill on the confirm screen reopens the confirm screen', async () => {
    const first = await begin()
    clock = T0 + 30 * 60_000
    ped.steps = 4500
    await act(async () => {
      await first.result.current.end()
    })
    first.unmount()
    clock = T0 + 5 * 3600_000
    const { result } = renderHook(() => useIndoorRun({ now }))
    await flush()
    expect(result.current.status).toBe('confirm')
    expect(result.current.durationSeconds).toBe(1800) // frozen, not 5 hours
    expect(result.current.steps).toBe(4500)
  })

  it('discard forgets everything', async () => {
    const { result } = await begin()
    act(() => result.current.discard())
    expect(result.current.active).toBe(false)
    expect(localStorage.getItem(INDOOR_STORAGE_KEY)).toBeNull()
  })

  it('a second start while one is active is ignored', async () => {
    const { result } = await begin()
    clock = T0 + 5000
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.startedAtMs).toBe(T0)
  })
})
