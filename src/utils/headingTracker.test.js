import { describe, expect, it } from 'vitest'
import {
  HEADING_CONFIG,
  angleDiff,
  createHeadingTracker,
} from './headingTracker'

// ~1 m of latitude / longitude at the equator, close enough for these paths.
const M = 1 / 111320

// Walks `meters` in `bearing` from p, returns the new point.
function step(p, bearing, meters) {
  const r = (bearing * Math.PI) / 180
  return {
    lat: p.lat + Math.cos(r) * meters * M,
    lng: p.lng + Math.sin(r) * meters * M,
  }
}

// Feeds a straight walk (a fix every `dt` s at `speed` m/s) and ticks every
// 500 ms between fixes. Returns the last point and clock.
function walk(tr, start, bearing, seconds, { speed = 3, dt = 1, t0 = 0 } = {}) {
  let p = start
  let t = t0
  const emitted = []
  for (let s = 0; s < seconds; s += dt) {
    p = step(p, bearing, speed * dt)
    t += dt * 1000
    tr.pushFix({ ...p, accuracy: 5, speed, t })
    for (let k = 0; k < 2; k += 1) {
      const out = tr.tick(t + k * 500)
      if (out !== null) emitted.push(out)
    }
  }
  return { p, t, emitted }
}

const START = { lat: 27.7, lng: 85.3 }

describe('angleDiff', () => {
  it('takes the short way round 359 -> 1', () => {
    expect(angleDiff(359, 1)).toBe(2)
    expect(angleDiff(1, 359)).toBe(-2)
    expect(angleDiff(10, 190)).toBe(180)
  })
})

describe('heading tracker', () => {
  it('locks onto a straight run', () => {
    const tr = createHeadingTracker()
    walk(tr, START, 90, 20)
    expect(Math.abs(angleDiff(tr.current(), 90))).toBeLessThan(2)
  })

  it('uses GPS course when moving fast enough', () => {
    const tr = createHeadingTracker()
    tr.pushFix({ ...START, accuracy: 5, speed: 3, heading: 200, t: 1000 })
    expect(tr.tick(1000)).toBeCloseTo(200, 0)
    expect(tr.tick(1500)).toBeNull()
  })

  it('wraps around north without spinning the long way (359 -> 1)', () => {
    const tr = createHeadingTracker()
    walk(tr, START, 359, 12)
    const before = tr.current()
    const { emitted } = walk(tr, START, 1, 12, { t0: 100000 })
    expect(before).toBeGreaterThan(350)
    // Never swings through the south half while crossing north.
    for (const h of emitted) expect(h > 330 || h < 30).toBe(true)
  })

  it('dead-band: a small wobble does not move the heading', () => {
    const tr = createHeadingTracker()
    walk(tr, START, 90, 15)
    const base = tr.current()
    let p = START
    let t = 100000
    for (let i = 0; i < 20; i += 1) {
      p = step(p, i % 2 ? 90 + 9 : 90 - 9, 3)
      t += 1000
      tr.pushFix({ ...p, accuracy: 5, speed: 3, t })
      tr.tick(t)
    }
    expect(Math.abs(angleDiff(tr.current(), base))).toBeLessThan(5)
  })

  it('holds the last heading when standing still, even with jittery fixes', () => {
    const tr = createHeadingTracker()
    walk(tr, START, 45, 15)
    const base = tr.current()
    let t = 100000
    for (let i = 0; i < 30; i += 1) {
      const jitter = step(START, (i * 137) % 360, 4)
      t += 1000
      tr.pushFix({ ...jitter, accuracy: 6, speed: 0.2, t })
      expect(tr.tick(t)).toBeNull()
    }
    expect(tr.current()).toBe(base)
  })

  it('ignores fixes with bad accuracy', () => {
    const tr = createHeadingTracker()
    walk(tr, START, 90, 15)
    const base = tr.current()
    let t = 100000
    for (let i = 0; i < 10; i += 1) {
      t += 1000
      tr.pushFix({
        ...step(START, 270, 30 * (i + 1)),
        accuracy: 60,
        speed: 3,
        t,
      })
      tr.tick(t)
    }
    expect(tr.current()).toBe(base)
  })

  it('a U-turn needs ~2 s of confirmation before the map turns', () => {
    const tr = createHeadingTracker()
    const { p, t } = walk(tr, START, 90, 15)
    const base = tr.current()
    // Go back the other way: first ~1.5 s must not move the heading.
    let q = p
    let clock = t
    for (let i = 0; i < 2; i += 1) {
      q = step(q, 270, 3)
      clock += 1000
      tr.pushFix({ ...q, accuracy: 5, speed: 3, heading: 270, t: clock })
      tr.tick(clock)
    }
    expect(Math.abs(angleDiff(tr.current(), base))).toBeLessThan(2)
    // Keep going: it confirms and turns (the short arc, not a spin).
    const out = []
    for (let i = 0; i < 20; i += 1) {
      q = step(q, 270, 3)
      clock += 1000
      tr.pushFix({ ...q, accuracy: 5, speed: 3, heading: 270, t: clock })
      for (let k = 0; k < 2; k += 1) {
        const h = tr.tick(clock + k * 500)
        if (h !== null) out.push(h)
      }
    }
    expect(Math.abs(angleDiff(tr.current(), 270))).toBeLessThan(3)
    expect(out.length).toBeGreaterThan(4)
  })

  it('a brief wrong-way blip never turns the map', () => {
    const tr = createHeadingTracker()
    const { p, t } = walk(tr, START, 90, 15)
    const base = tr.current()
    tr.pushFix({
      ...step(p, 270, 3),
      accuracy: 5,
      speed: 3,
      heading: 270,
      t: t + 1000,
    })
    walk(tr, p, 90, 10, { t0: t + 2000 })
    expect(Math.abs(angleDiff(tr.current(), base))).toBeLessThan(3)
  })

  it('rate limit: never faster than the configured rate and at most 2 updates per second', () => {
    const tr = createHeadingTracker()
    walk(tr, START, 0, 15)
    let t = 200000
    let prevOut = tr.current()
    let prevT = null
    // Hard 80 degree corner, run long enough to complete it.
    let p = START
    for (let i = 0; i < 25; i += 1) {
      p = step(p, 80, 3)
      t += 1000
      tr.pushFix({ ...p, accuracy: 5, speed: 3, t })
      for (let k = 0; k < 4; k += 1) {
        const now = t + k * 250
        const h = tr.tick(now)
        if (h === null) continue
        if (prevT !== null) {
          expect(now - prevT).toBeGreaterThanOrEqual(500)
          const rate = Math.abs(angleDiff(prevOut, h)) / ((now - prevT) / 1000)
          expect(rate).toBeLessThanOrEqual(
            HEADING_CONFIG.maxRateDegPerSec + 0.5
          )
        }
        prevOut = h
        prevT = now
      }
    }
    expect(Math.abs(angleDiff(tr.current(), 80))).toBeLessThan(8)
  })

  it('derives speed from positions when the device gives none', () => {
    const tr = createHeadingTracker()
    let p = START
    let t = 0
    for (let i = 0; i < 12; i += 1) {
      p = step(p, 180, 3)
      t += 1000
      tr.pushFix({ ...p, accuracy: 5, t })
      tr.tick(t)
    }
    expect(Math.abs(angleDiff(tr.current(), 180))).toBeLessThan(3)
  })

  it('reset forgets everything', () => {
    const tr = createHeadingTracker()
    walk(tr, START, 90, 15)
    tr.reset()
    expect(tr.current()).toBeNull()
  })
})
