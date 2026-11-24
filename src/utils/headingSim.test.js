/* global process */
import { describe, expect, it } from 'vitest'
import { angleDiff, createHeadingTracker } from './headingTracker'

// Replays a realistic phone GPS feed through the heading calculator and
// prints the heading it would show (the map's heading-up bearing).
//   * a fix every second (the raw native stream, see utils/gpsFeed.js)
//   * +-5 m uniform position jitter on both axes, accuracy 5-18 m
//   * the chip's own speed (noisy) and course (+-15 deg noise, ~80% present)
// Deterministic (seeded).

const M = 1 / 111320
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

// legs: [bearingDeg, seconds] at `pace` m/s. standing: seconds of standing.
function simulate({
  legs,
  pace = 1.4,
  jitter = 5,
  withSpeed = true,
  withCourse = true,
  seed = 11,
}) {
  const r = rng(seed)
  const tr = createHeadingTracker()
  let x = 0
  let y = 0
  let t = 0
  const series = [] // [t s, truth, shown]
  let truth = legs[0][0]
  let shown = null
  for (const [bearing, seconds, standing] of legs) {
    for (let s = 0; s < seconds; s += 1) {
      t += 1000
      truth = bearing
      if (!standing) {
        const b = (bearing * Math.PI) / 180
        x += Math.sin(b) * pace
        y += Math.cos(b) * pace
      }
      const acc = 5 + r() * 13
      const fix = {
        lat: 27.7 + (y + (r() * 2 - 1) * jitter) * M,
        lng: 85.3 + (x + (r() * 2 - 1) * jitter) * M,
        accuracy: acc,
        t,
      }
      if (withSpeed) {
        fix.speed = standing
          ? Math.max(0, r() * 0.35)
          : Math.max(0, pace + (r() - 0.5) * 0.6)
      }
      if (withCourse && !standing && r() < 0.8) {
        fix.heading = (bearing + (r() * 2 - 1) * 15 + 360) % 360
      }
      tr.pushFix(fix)
      for (let k = 0; k < 2; k += 1) {
        const out = tr.tick(t + k * 500)
        if (out !== null) shown = out
      }
      series.push([t / 1000, truth, shown === null ? null : Math.round(shown)])
    }
  }
  return { series, tr }
}

const fmt = (series) =>
  series
    .filter((_, i) => i % 3 === 0)
    .map(([t, truth, shown]) => `${t}s:${shown ?? '-'}(${truth})`)
    .join(' ')
const print = (name, series) => {
  if (process.env.PRINT_HEADING) console.log(`SERIES ${name} ${fmt(series)}`)
}
const at = (series, t) => series.find((p) => p[0] === t)[2]
const off = (shown, truth) => Math.abs(angleDiff(shown, truth))

const EAST_THEN_NORTH = [
  [90, 30],
  [0, 30],
]

describe('heading calculator replays a noisy phone walk (1.4 m/s, +-5 m jitter)', () => {
  it('with the chip course: locks early and follows a 90 degree corner within ~3 s', () => {
    const { series } = simulate({ legs: EAST_THEN_NORTH })
    print('course+speed', series)
    expect(off(at(series, 8), 90)).toBeLessThan(25)
    expect(off(at(series, 30), 90)).toBeLessThan(25)
    // the corner is at t=31 (first fix heading north): turned by t=34
    expect(off(at(series, 34), 0)).toBeLessThan(25)
    expect(off(at(series, 60), 0)).toBeLessThan(25)
  })

  it('positions only (no course): locks within ~10 s and follows the corner within ~10 s', () => {
    const { series } = simulate({ legs: EAST_THEN_NORTH, withCourse: false })
    print('positions only', series)
    expect(off(at(series, 12), 90)).toBeLessThan(40)
    expect(off(at(series, 30), 90)).toBeLessThan(40)
    expect(off(at(series, 42), 0)).toBeLessThan(45)
    expect(off(at(series, 60), 0)).toBeLessThan(45)
  })

  it('no device speed and no course either: still follows the walk and the corner', () => {
    const { series } = simulate({
      legs: EAST_THEN_NORTH,
      withCourse: false,
      withSpeed: false,
    })
    print('no speed, no course', series)
    expect(off(at(series, 30), 90)).toBeLessThan(40)
    expect(off(at(series, 50), 0)).toBeLessThan(45)
  })

  it('never turns the map faster than the rate limit (no jumps)', () => {
    const { series } = simulate({ legs: EAST_THEN_NORTH })
    let worst = 0
    for (let i = 1; i < series.length; i += 1) {
      if (series[i][2] == null || series[i - 1][2] == null) continue
      worst = Math.max(
        worst,
        Math.abs(angleDiff(series[i - 1][2], series[i][2]))
      )
    }
    expect(worst).toBeLessThanOrEqual(61)
  })

  for (const [name, opts] of [
    ['with device speed', {}],
    ['with NO device speed (position jitter only)', { withSpeed: false }],
  ]) {
    it(`standing still for 40 s ${name}: the heading does not move at all`, () => {
      const { series } = simulate({
        legs: [
          [90, 25],
          [90, 40, true],
        ],
        ...opts,
      })
      print(`standing ${name}`, series)
      const held = at(series, 30)
      for (let t = 30; t <= 65; t += 1) expect(at(series, t)).toBe(held)
    })
  }
})
