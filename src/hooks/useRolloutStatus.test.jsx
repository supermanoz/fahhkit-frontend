import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

// WHEN the rollout check runs and what it makes the UI do: the status
// endpoint is mocked, GPS fixes are handed in as the hook's `position`.
const api = vi.hoisted(() => ({
  getRolloutStatus: vi.fn(),
  requestRollout: vi.fn(),
}))
vi.mock('../api/territoryRollout', () => ({
  getRolloutStatus: api.getRolloutStatus,
  requestRollout: api.requestRollout,
  ALREADY_ROLLED_OUT_MESSAGE: 'The game is already rolled out in your city.',
}))

import { useRolloutStatus } from './useRolloutStatus'
import {
  clearRolloutChecksForTests,
  getRolloutChecks,
} from '../utils/rolloutDebug'

const NOW = new Date('2026-11-20T10:00:00Z').getTime()
const fix = (lat, lng, extra = {}) => ({
  lat,
  lng,
  accuracy: 10,
  timestamp: Date.now(),
  ...extra,
})
const KATHMANDU = [27.7172, 85.324]
const POKHARA = [28.2096, 83.9856] // ~140 km away
const NEAR = [27.7215, 85.3282] // ~600 m from KATHMANDU

const OUTSIDE = {
  rolledOut: false,
  alreadyRequested: false,
  cityName: 'Pokhara',
  countryName: 'Nepal',
  requestCount: 3,
}
const INSIDE = {
  rolledOut: true,
  alreadyRequested: false,
  cityName: 'Kathmandu',
  countryName: 'Nepal',
  requestCount: 0,
}

// Lets the mocked promise settle and React flush.
const flush = () => act(async () => {})

function setup(initialPosition = null, options = {}) {
  return renderHook(({ position, opts }) => useRolloutStatus(position, opts), {
    initialProps: { position: initialPosition, opts: options },
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  clearRolloutChecksForTests()
  api.getRolloutStatus.mockResolvedValue(OUTSIDE)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('waits for the first usable GPS fix', () => {
  it('does nothing without a position (just logged in, no fix yet)', async () => {
    const { result } = setup(null)
    await flush()
    expect(api.getRolloutStatus).not.toHaveBeenCalled()
    expect(result.current.showModal).toBe(false)
    expect(result.current.blocked).toBe(false)
  })

  it('ignores 0,0, a stale cached fix and a very coarse fix', async () => {
    const { rerender } = setup(fix(0, 0))
    await flush()
    rerender({
      position: fix(...KATHMANDU, { timestamp: NOW - 10 * 60 * 1000 }),
      opts: {},
    })
    await flush()
    rerender({ position: fix(...KATHMANDU, { accuracy: 40_000 }), opts: {} })
    await flush()
    expect(api.getRolloutStatus).not.toHaveBeenCalled()
  })

  it('checks once with the real coordinates when the first usable fix arrives', async () => {
    const { rerender } = setup(fix(0, 0))
    await flush()
    expect(api.getRolloutStatus).not.toHaveBeenCalled()
    rerender({ position: fix(...POKHARA), opts: {} })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(1)
    expect(api.getRolloutStatus).toHaveBeenCalledWith(...POKHARA)
  })
})

describe('result -> popup / lock', () => {
  it('not rolled out: the popup shows and the game is locked', async () => {
    const { result } = setup(fix(...POKHARA))
    await flush()
    expect(result.current.showModal).toBe(true)
    expect(result.current.blocked).toBe(true)
    expect(result.current.state.cityName).toBe('Pokhara')
  })

  it('rolled out: no popup, nothing locked', async () => {
    api.getRolloutStatus.mockResolvedValue(INSIDE)
    const { result } = setup(fix(...KATHMANDU))
    await flush()
    expect(result.current.showModal).toBe(false)
    expect(result.current.blocked).toBe(false)
    expect(result.current.showChip).toBe(false)
  })

  it('an area the backend cannot resolve (rolledOut:false, null city) is treated as not rolled out', async () => {
    api.getRolloutStatus.mockResolvedValue({
      rolledOut: false,
      alreadyRequested: false,
      cityId: null,
      cityName: null,
      countryName: null,
      requestCount: 0,
    })
    const { result } = setup(fix(...POKHARA))
    await flush()
    expect(result.current.showModal).toBe(true)
    expect(result.current.blocked).toBe(true)
  })

  it('already requested: the chip shows (locked, but no popup)', async () => {
    api.getRolloutStatus.mockResolvedValue({
      ...OUTSIDE,
      alreadyRequested: true,
    })
    const { result } = setup(fix(...POKHARA))
    await flush()
    expect(result.current.showModal).toBe(false)
    expect(result.current.showChip).toBe(true)
    expect(result.current.blocked).toBe(true)
  })
})

describe('failure never locks the game (and is recorded for debugging)', () => {
  it('a failing endpoint (404 / offline): no popup, no lock, the failure is recorded', async () => {
    api.getRolloutStatus.mockRejectedValue(new Error('404'))
    const { result } = setup(fix(...POKHARA))
    await flush()
    expect(result.current.showModal).toBe(false)
    expect(result.current.blocked).toBe(false)
    const [entry] = getRolloutChecks()
    expect(entry).toMatchObject({
      ok: false,
      trigger: 'first',
      lat: POKHARA[0],
      lng: POKHARA[1],
    })
    expect(entry.error).toContain('404')
    expect(entry.decision).toMatch(/fail-open/)
  })

  it('retries after a while and recovers when the endpoint comes back', async () => {
    api.getRolloutStatus.mockRejectedValueOnce(new Error('503'))
    const { result } = setup(fix(...POKHARA))
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(1)
    expect(result.current.blocked).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_500)
    })
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(2)
    expect(result.current.showModal).toBe(true)
  })
})

describe('once per session, not per GPS tick', () => {
  it('many fixes in the same place -> still ONE request', async () => {
    const { rerender } = setup(fix(...KATHMANDU))
    await flush()
    for (let i = 0; i < 6; i++) {
      rerender({
        position: fix(KATHMANDU[0] + i * 0.00002, KATHMANDU[1]),
        opts: {},
      })
      await flush()
    }
    rerender({ position: fix(...NEAR), opts: {} }) // ~600 m: still the same area
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(1)
  })

  it('moving more than 1 km re-checks (walking into a rolled-out city unlocks)', async () => {
    const { result, rerender } = setup(fix(...POKHARA))
    await flush()
    expect(result.current.blocked).toBe(true)
    api.getRolloutStatus.mockResolvedValue(INSIDE)
    rerender({ position: fix(...KATHMANDU), opts: {} })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(2)
    expect(result.current.blocked).toBe(false)
  })

  it('a dismissed popup stays dismissed after a re-check that is still outside', async () => {
    const { result, rerender } = setup(fix(...POKHARA))
    await flush()
    act(() => result.current.dismiss())
    expect(result.current.showModal).toBe(false)
    rerender({ position: fix(28.4, 83.9), opts: {} }) // > 1 km away, still outside
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(2)
    expect(result.current.showModal).toBe(false)
    expect(result.current.blocked).toBe(true)
  })
})

describe('coming back from the background', () => {
  it('re-checks on the first FRESH fix after resume, never on the stale one', async () => {
    const start = fix(...POKHARA)
    const { rerender } = setup(start, { resumeTick: 0 })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000) // past the 30 s resume throttle
    })
    rerender({ position: start, opts: { resumeTick: 1 } }) // resumed, same stale fix
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(1)

    api.getRolloutStatus.mockResolvedValue(INSIDE)
    // The watch delivers a new fix (same spot - the player did not move 1 km).
    rerender({
      position: fix(POKHARA[0] + 0.0001, POKHARA[1]),
      opts: { resumeTick: 1 },
    })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(2)
  })

  it('quick app switches do not spam the API (30 s throttle)', async () => {
    const start = fix(...POKHARA)
    const { rerender } = setup(start, { resumeTick: 0 })
    await flush()
    rerender({ position: start, opts: { resumeTick: 1 } })
    await flush()
    rerender({
      position: fix(POKHARA[0] + 0.0001, POKHARA[1]),
      opts: { resumeTick: 1 },
    })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(1)
  })
})

describe('a different player', () => {
  it('signing in as someone else resets the result and checks again', async () => {
    const pos = fix(...POKHARA)
    api.getRolloutStatus.mockResolvedValueOnce({
      ...OUTSIDE,
      alreadyRequested: true,
    })
    const { result, rerender } = setup(pos, { userId: 'u1' })
    await flush()
    expect(result.current.showChip).toBe(true)
    api.getRolloutStatus.mockResolvedValue(OUTSIDE)
    rerender({ position: pos, opts: { userId: 'u2' } })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(2)
    expect(result.current.showChip).toBe(false) // u1's "already requested" is gone
    expect(result.current.showModal).toBe(true)
  })
})

describe('a successful answer is recorded with the coordinates and decision', () => {
  it('records what was sent, what came back and what the app decided', async () => {
    api.getRolloutStatus.mockResolvedValue({
      rolledOut: false,
      alreadyRequested: false,
      cityName: 'Kathmandu',
      countryName: 'Nepal',
      requestCount: 0,
    })
    setup(fix(...KATHMANDU))
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledWith(...KATHMANDU)
    const [entry] = getRolloutChecks()
    expect(entry).toMatchObject({
      ok: true,
      lat: KATHMANDU[0],
      lng: KATHMANDU[1],
      decision: 'locked + popup',
    })
    expect(entry.response.cityName).toBe('Kathmandu')
  })
})

describe('a known answer expires (5 min TTL) so a city disabled later takes effect', () => {
  it('rolled out at app open, disabled meanwhile: standing still, the next check after 5 min shows the popup and locks', async () => {
    api.getRolloutStatus.mockResolvedValueOnce(INSIDE)
    const start = fix(...KATHMANDU)
    const { result, rerender } = setup(start)
    await flush()
    expect(result.current.blocked).toBe(false)

    // the moderator disables the city
    api.getRolloutStatus.mockResolvedValue({
      ...OUTSIDE,
      cityName: 'Kathmandu',
    })

    // 4 min later: still the cached answer, even with fresh fixes at the same spot
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000)
    })
    rerender({ position: fix(...KATHMANDU), opts: {} })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(1)
    expect(result.current.blocked).toBe(false)

    // past 5 min: re-asked (no movement, no resume needed)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000)
    })
    rerender({ position: fix(...KATHMANDU), opts: {} })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(2)
    expect(result.current.showModal).toBe(true)
    expect(result.current.blocked).toBe(true)
    expect(getRolloutChecks()[0].trigger).toBe('ttl')
  })

  it('a re-check that fails (network) keeps the last known answer', async () => {
    api.getRolloutStatus.mockResolvedValueOnce(OUTSIDE)
    const { result, rerender } = setup(fix(...KATHMANDU))
    await flush()
    expect(result.current.blocked).toBe(true)
    api.getRolloutStatus.mockRejectedValue(new Error('offline'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000)
    })
    rerender({ position: fix(...KATHMANDU), opts: {} })
    await flush()
    expect(api.getRolloutStatus).toHaveBeenCalledTimes(2)
    expect(result.current.blocked).toBe(true) // not flipped by the failure
  })
})

describe('pending: the game stays locked until the area is confirmed', () => {
  it('pending right after login (no fix yet) and while a check fails; cleared by a rolled-out answer', async () => {
    api.getRolloutStatus.mockRejectedValueOnce(new Error('503'))
    const { result } = setup(null)
    expect(result.current.pending).toBe(true) // logged in, no usable GPS fix yet
    expect(result.current.blocked).toBe(false)
    const { result: failing } = setup(fix(...KATHMANDU))
    await flush()
    expect(failing.current.pending).toBe(true) // check failed: still locked
    api.getRolloutStatus.mockResolvedValue(INSIDE)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_500)
    })
    expect(failing.current.pending).toBe(false)
    expect(failing.current.blocked).toBe(false)
  })
})
