import { describe, expect, it } from 'vitest'
import {
  TOUR_STEPS,
  TOUR_VERSION,
  hasSeenTour,
  looksLikeNewPlayer,
  markTourSeen,
  shouldAutoStartTour,
  tourKey,
  tourMustAbort,
  tourStepsFor,
  tourWaitReason,
} from './tour'
import { TOUR_COPY } from '../constants/tourCopy'
import { placeTooltip } from './tourLayout'

const NOW = new Date('2026-11-20T10:00:00Z').getTime()
const mem = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  }
}
const rookie = {
  user: { id: 'u1', joinedDate: '2026-11-19' },
  profile: { level: 1, xp: 0, parcelCount: 0 },
}

describe('who sees the tour', () => {
  it('a brand-new account does', () => {
    expect(looksLikeNewPlayer({ ...rookie, now: NOW })).toBe(true)
  })
  it('an existing player who just updated does NOT (level, territory or age)', () => {
    const base = { ...rookie, now: NOW }
    expect(
      looksLikeNewPlayer({ ...base, profile: { level: 14, xp: 3400 } })
    ).toBe(false)
    expect(
      looksLikeNewPlayer({ ...base, profile: { level: 1, parcelCount: 3 } })
    ).toBe(false)
    expect(looksLikeNewPlayer({ ...base, parcelCount: 2 })).toBe(false)
    expect(
      looksLikeNewPlayer({ ...base, user: { joinedDate: '2025-01-01' } })
    ).toBe(false)
  })
  it('waits for data: no profile or user -> not yet', () => {
    expect(looksLikeNewPlayer({ user: rookie.user, profile: null })).toBe(false)
    expect(looksLikeNewPlayer({ user: null, profile: rookie.profile })).toBe(
      false
    )
  })
  it('a missing joinedDate does not block a level-1 player with no territory', () => {
    expect(
      looksLikeNewPlayer({ user: {}, profile: rookie.profile, now: NOW })
    ).toBe(true)
  })
})

describe('seen flag', () => {
  it('is per account and versioned: tour_v1_<userId>', () => {
    expect(TOUR_VERSION).toBe(1)
    expect(tourKey('abc')).toBe('tour_v1_abc')
    expect(tourKey('abc', 2)).toBe('tour_v2_abc')
    const s = mem()
    markTourSeen('a', s)
    expect(hasSeenTour('a', s)).toBe(true)
    expect(hasSeenTour('b', s)).toBe(false)
  })
  it('auto-start respects the flag, and a newer version shows again', () => {
    const s = mem()
    const ctx = { userId: 'u1', ...rookie, now: NOW, storage: s }
    expect(shouldAutoStartTour(ctx)).toBe(true)
    markTourSeen('u1', s)
    expect(shouldAutoStartTour(ctx)).toBe(false)
    // an old v0 flag never hides v1
    const old = mem()
    old.setItem('tour_v0_u1', '1')
    expect(shouldAutoStartTour({ ...ctx, storage: old })).toBe(true)
  })
  it('unusable storage means "seen" (never nag on every launch)', () => {
    const broken = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    }
    expect(hasSeenTour('u1', broken)).toBe(true)
    expect(() => markTourSeen('u1', broken)).not.toThrow()
  })
})

describe('queue behind other popups', () => {
  const clear = { gameReady: true }
  it('is clear only when nothing else is on screen', () => {
    expect(tourWaitReason(clear)).toBeNull()
  })
  it.each([
    ['loading', { gameReady: false }],
    ['intro', { introPlaying: true }],
    ['run', { running: true }],
    ['rollout-popup', { rolloutPopup: true }],
    ['broadcast', { broadcast: true }],
    ['challenge', { challenge: true }],
    ['nudge', { nudge: true }],
    ['modal', { modalOpen: true }],
    ['menu', { menuOpen: true }],
  ])('waits for %s', (reason, extra) => {
    expect(tourWaitReason({ ...clear, ...extra })).toBe(reason)
  })
  it('a run or a logout ends it; a popup only pauses it', () => {
    expect(tourMustAbort({ userId: 'u', running: true })).toBe(true)
    expect(tourMustAbort({ userId: null })).toBe(true)
    expect(tourMustAbort({ userId: 'u', running: false })).toBe(false)
  })
})

describe('steps', () => {
  it('7 steps at most, every one has copy, in the briefed order', () => {
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(7)
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      'welcome',
      'hero',
      'play',
      'mail',
      'shop',
      'me',
      'done',
    ])
    for (const s of TOUR_STEPS) expect(TOUR_COPY[s.id]).toBeTruthy()
  })
  it('copy is short: at most two sentences, plain words', () => {
    for (const c of Object.values(TOUR_COPY)) {
      expect(c.body.split(/[.!?]\s/).length).toBeLessThanOrEqual(3)
    }
  })
  it('the Play step is skipped while the game is halted outside a rollout area', () => {
    expect(tourStepsFor({ locked: true }).map((s) => s.id)).not.toContain(
      'play'
    )
    expect(tourStepsFor({ locked: false }).map((s) => s.id)).toContain('play')
  })
})

describe('placeTooltip', () => {
  const bounds = { left: 12, top: 24, right: 348, bottom: 616 }
  const card = { w: 336, h: 200 }
  it('goes below a target near the top, with the arrow on its centre', () => {
    const p = placeTooltip({
      rect: { x: 300, y: 60, w: 48, h: 48 },
      card,
      bounds,
    })
    expect(p.mode).toBe('below')
    expect(p.top).toBeGreaterThan(108)
    expect(p.left + p.width).toBeLessThanOrEqual(348)
    expect(p.arrowX).toBeLessThanOrEqual(p.width - 22)
  })
  it('goes above a target near the bottom, never off-screen', () => {
    const p = placeTooltip({
      rect: { x: 150, y: 540, w: 56, h: 56 },
      card,
      bounds,
    })
    expect(p.mode).toBe('above')
    expect(p.top).toBeGreaterThanOrEqual(24)
    expect(p.top + (p.maxHeight ?? card.h)).toBeLessThanOrEqual(540)
  })
  it('centres with no target and fits a narrow 320px screen', () => {
    const p = placeTooltip({
      rect: null,
      card: { w: 360, h: 220 },
      bounds: { left: 12, top: 12, right: 308, bottom: 560 },
    })
    expect(p.mode).toBe('center')
    expect(p.left).toBeGreaterThanOrEqual(12)
    expect(p.left + p.width).toBeLessThanOrEqual(308)
  })
})
