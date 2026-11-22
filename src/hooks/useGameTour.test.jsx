import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGameTour } from './useGameTour'
import { hasSeenTour, markTourSeen } from '../utils/tour'

const mem = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  }
}
const rookie = {
  userId: 'u1',
  user: { id: 'u1', joinedDate: new Date().toISOString().slice(0, 10) },
  profile: { level: 1, xp: 0, parcelCount: 0 },
  parcelCount: 0,
  locked: false,
  wait: null,
  running: false,
  settleMs: 100,
}
const vet = { ...rookie, profile: { level: 14, xp: 3400, parcelCount: 12 } }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const settle = (ms = 150) => act(() => vi.advanceTimersByTime(ms))

describe('useGameTour', () => {
  it('a new player gets it after the screen has been clear for a moment', () => {
    const storage = mem()
    const { result } = renderHook(() => useGameTour({ ...rookie, storage }))
    expect(result.current.active).toBe(false)
    settle()
    expect(result.current.active).toBe(true)
    expect(result.current.step.id).toBe('welcome')
  })

  it('an existing player never sees it automatically', () => {
    const { result } = renderHook(() => useGameTour({ ...vet, storage: mem() }))
    settle(5000)
    expect(result.current.active).toBe(false)
  })

  it('queues behind a popup and starts only after it is dismissed', () => {
    const storage = mem()
    const { result, rerender } = renderHook((p) => useGameTour(p), {
      initialProps: { ...rookie, storage, wait: 'broadcast' },
    })
    settle(5000)
    expect(result.current.active).toBe(false)
    rerender({ ...rookie, storage, wait: null })
    settle(50)
    expect(result.current.active).toBe(false) // settle gap not over yet
    settle(100)
    expect(result.current.active).toBe(true)
  })

  it('a popup arriving mid-tour pauses it, then it resumes on the same step', () => {
    const storage = mem()
    const { result, rerender } = renderHook((p) => useGameTour(p), {
      initialProps: { ...rookie, storage },
    })
    settle()
    act(() => result.current.next())
    rerender({ ...rookie, storage, wait: 'broadcast' })
    expect(result.current.paused).toBe(true)
    expect(result.current.step.id).toBe('hero')
    rerender({ ...rookie, storage, wait: null })
    expect(result.current.paused).toBe(false)
    expect(result.current.step.id).toBe('hero')
  })

  it('finishing or skipping marks it seen for THIS account only', () => {
    const storage = mem()
    const { result } = renderHook(() => useGameTour({ ...rookie, storage }))
    settle()
    expect(hasSeenTour('u1', storage)).toBe(false)
    act(() => result.current.skip())
    expect(hasSeenTour('u1', storage)).toBe(true)
    expect(hasSeenTour('u2', storage)).toBe(false)
    expect(result.current.active).toBe(false)
  })

  it('walking to the end with Next marks it seen', () => {
    const storage = mem()
    const { result } = renderHook(() => useGameTour({ ...rookie, storage }))
    settle()
    for (let i = 0; i < 7; i++) act(() => result.current.next())
    expect(result.current.active).toBe(false)
    expect(hasSeenTour('u1', storage)).toBe(true)
  })

  it('killed mid-tour (never finished) restarts from step 1 next launch', () => {
    const storage = mem()
    const first = renderHook(() => useGameTour({ ...rookie, storage }))
    settle()
    act(() => first.result.current.next())
    act(() => first.result.current.next())
    first.unmount() // the app is killed
    expect(hasSeenTour('u1', storage)).toBe(false)
    const second = renderHook(() => useGameTour({ ...rookie, storage }))
    settle()
    expect(second.result.current.active).toBe(true)
    expect(second.result.current.index).toBe(0)
  })

  it('does not start again after it was seen', () => {
    const storage = mem()
    markTourSeen('u1', storage)
    const { result } = renderHook(() => useGameTour({ ...rookie, storage }))
    settle(5000)
    expect(result.current.active).toBe(false)
  })

  it('replay works for anyone, even a seen veteran, once the menu is closed', () => {
    const storage = mem()
    markTourSeen('u1', storage)
    const { result, rerender } = renderHook((p) => useGameTour(p), {
      initialProps: { ...vet, storage, wait: 'menu' },
    })
    act(() => result.current.replay())
    settle(2000)
    expect(result.current.active).toBe(false) // Settings sheet still open
    rerender({ ...vet, storage, wait: null })
    settle(400)
    expect(result.current.active).toBe(true)
    expect(result.current.index).toBe(0)
  })

  it('a run starting or logging out ends it without marking it seen', () => {
    const storage = mem()
    const { result, rerender } = renderHook((p) => useGameTour(p), {
      initialProps: { ...rookie, storage },
    })
    settle()
    expect(result.current.active).toBe(true)
    rerender({ ...rookie, storage, running: true })
    expect(result.current.active).toBe(false)
    expect(hasSeenTour('u1', storage)).toBe(false)

    const out = renderHook((p) => useGameTour(p), {
      initialProps: { ...rookie, storage: mem() },
    })
    settle()
    expect(out.result.current.active).toBe(true)
    out.rerender({ ...rookie, storage: mem(), userId: null, user: null })
    expect(out.result.current.active).toBe(false)
  })

  it('skips the Play step when the game is locked, and a missing target is stepped over', () => {
    const storage = mem()
    const { result } = renderHook(() =>
      useGameTour({ ...rookie, storage, locked: true })
    )
    settle()
    expect(result.current.steps.map((s) => s.id)).not.toContain('play')
    act(() => result.current.next()) // hero
    act(() => result.current.skipMissing(1)) // hero target gone -> next
    expect(result.current.step.id).toBe('mail')
  })

  it('Back goes to the previous step and does nothing on step 1', () => {
    const storage = mem()
    const { result } = renderHook(() => useGameTour({ ...rookie, storage }))
    settle()
    act(() => result.current.back())
    expect(result.current.index).toBe(0)
    act(() => result.current.next())
    act(() => result.current.back())
    expect(result.current.index).toBe(0)
  })
})
