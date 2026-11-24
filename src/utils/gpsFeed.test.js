// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  gpsFeedStats,
  publishFix,
  resetGpsFeedStats,
  subscribeFixes,
} from './gpsFeed'
import { headingFromOrientationEvent } from './compassHeading'
import {
  isMapDebugEnabled,
  setMapDebugEnabled,
  toggleMapDebug,
} from './mapDebug'
import { createHeadingTracker } from './headingTracker'

beforeEach(() => {
  resetGpsFeedStats()
  localStorage.clear()
  setMapDebugEnabled(false)
})

describe('gpsFeed', () => {
  it('delivers every raw fix to subscribers and counts speed / course', () => {
    const cb = vi.fn()
    const off = subscribeFixes(cb)
    publishFix({
      lat: 1,
      lng: 2,
      speed: 1.2,
      heading: null,
      accuracy: 25,
      t: 1,
    })
    publishFix({ lat: 1, lng: 2, speed: null, heading: 90, accuracy: 5, t: 2 })
    off()
    publishFix({
      lat: 1,
      lng: 2,
      speed: null,
      heading: null,
      accuracy: 5,
      t: 3,
    })
    expect(cb).toHaveBeenCalledTimes(2)
    expect(gpsFeedStats()).toMatchObject({
      total: 3,
      withSpeed: 1,
      withCourse: 1,
    })
  })
})

describe('compass', () => {
  it('iOS webkitCompassHeading; invalid when uncalibrated', () => {
    expect(headingFromOrientationEvent({ webkitCompassHeading: 123 })).toBe(123)
    expect(
      headingFromOrientationEvent({
        webkitCompassHeading: 123,
        webkitCompassAccuracy: -1,
      })
    ).toBeNull()
  })
  it('Android absolute alpha is counter-clockwise from north', () => {
    expect(headingFromOrientationEvent({ absolute: true, alpha: 270 })).toBe(90)
    expect(headingFromOrientationEvent({ absolute: true, alpha: 0 })).toBe(0)
    expect(
      headingFromOrientationEvent({ absolute: false, alpha: 10 })
    ).toBeNull()
  })
})

describe('map debug switch', () => {
  it('is off by default and toggles (remembered)', () => {
    expect(isMapDebugEnabled()).toBe(false)
    expect(toggleMapDebug()).toBe(true)
    expect(localStorage.getItem('fahhkit_debug_map')).toBe('1')
    expect(toggleMapDebug()).toBe(false)
  })
})

describe('heading tracker: compass is only a slow-start fallback', () => {
  const M = 1 / 111320
  it('uses the compass while walking slowly with no course and no path yet; never once a path exists', () => {
    const tr = createHeadingTracker()
    tr.pushCompass(200, 1000)
    tr.pushFix({
      lat: 27.7,
      lng: 85.3,
      accuracy: 5,
      speed: 0.8,
      heading: null,
      t: 1000,
    })
    expect(tr.debug().candidateFrom).toBe('compass')
    expect(tr.tick(1000)).toBeCloseTo(200, 0)
    // 14 s later there is a real path heading east: compass (still 200) loses.
    for (let i = 1; i <= 14; i += 1) {
      tr.pushCompass(200, 1000 + i * 1000)
      tr.pushFix({
        lat: 27.7,
        lng: 85.3 + (i * 1.2 * M) / Math.cos((27.7 * Math.PI) / 180),
        accuracy: 5,
        speed: 1.2,
        heading: null,
        t: 1000 + i * 1000,
      })
    }
    expect(tr.debug().candidateFrom).toBe('travel-bearing')
  })
  it('a stale compass (older than compassMaxAgeMs) is ignored', () => {
    const tr = createHeadingTracker()
    tr.pushCompass(200, 1000)
    tr.pushFix({ lat: 27.7, lng: 85.3, accuracy: 5, speed: 0.8, t: 9000 })
    expect(tr.debug().candidate).toBeNull()
    expect(tr.debug().state).toBe('locating')
  })
  it('reports why it holds: stopped / ignored accuracy', () => {
    const tr = createHeadingTracker()
    tr.pushFix({ lat: 27.7, lng: 85.3, accuracy: 5, speed: 0, t: 1000 })
    expect(tr.debug().state).toBe('held')
    tr.pushFix({ lat: 27.7, lng: 85.3, accuracy: 45, speed: 2, t: 2000 })
    expect(tr.debug().reason).toMatch(/accuracy 45 m > 30 m/)
  })
})
