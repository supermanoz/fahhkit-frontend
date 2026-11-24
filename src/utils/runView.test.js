import { describe, expect, it } from 'vitest'
import {
  RUN_VIEW_CONFIG,
  TEST_RUN_VIEW_OVERRIDES,
  createRunViewMachine,
} from './runView'

const M = 1 / 111320
// Feeds one fix per second at `speed` (device speed) for `seconds`, starting at
// t0 ms; wall clock == fix time. Returns [t, mode] for every fix.
function feed(m, { t0 = 0, seconds, speed, step = 1000 }) {
  const out = []
  for (let t = t0; t < t0 + seconds * 1000; t += step) {
    m.pushFix(
      { lat: 27.7, lng: 85.3 + (t / 1000) * M, speed, accuracy: 6, t },
      t
    )
    m.tick(t)
    out.push([t, m.state(t).mode])
  }
  return out
}
const firstRun = (series) => series.find(([, mode]) => mode === 'run')?.[0]

describe('run view (RUN / IDLE) state machine', () => {
  it('standing: stays IDLE and the cone flag is off', () => {
    const m = createRunViewMachine()
    feed(m, { seconds: 30, speed: 0.05 })
    expect(m.state(30000).mode).toBe('idle')
    expect(m.state(30000).slow).toBe(false)
  })

  it('running pace: enters RUN after ~2 s of continuous movement, not before', () => {
    const m = createRunViewMachine()
    const s = feed(m, { seconds: 10, speed: 2.5 })
    const t = firstRun(s)
    expect(t).toBeGreaterThanOrEqual(RUN_VIEW_CONFIG.enterMs)
    expect(t).toBeLessThanOrEqual(RUN_VIEW_CONFIG.enterMs + 1000)
    expect(m.state(9000).reason).toMatch(/moving at 2\.5 m\/s/)
  })

  it('slow walk (0.8 m/s) never enters RUN, but the cone flag turns on', () => {
    const m = createRunViewMachine()
    feed(m, { seconds: 20, speed: 0.8 })
    expect(m.state(20000).mode).toBe('idle')
    expect(m.state(20000).slow).toBe(true)
  })

  it('stopping leaves RUN after ~3 s below the stop speed', () => {
    const m = createRunViewMachine()
    feed(m, { seconds: 8, speed: 2.5 })
    expect(m.state(8000).mode).toBe('run')
    const s = feed(m, { t0: 8000, seconds: 8, speed: 0 })
    const leave = s.find(([, mode]) => mode === 'idle')[0]
    expect(leave - 8000).toBeGreaterThanOrEqual(RUN_VIEW_CONFIG.leaveMs)
    expect(leave - 8000).toBeLessThanOrEqual(RUN_VIEW_CONFIG.leaveMs + 1100)
    expect(m.state(16000).reason).toMatch(/below 0\.4 m\/s for 3 s/)
  })

  it('a red light shorter than 3 s does not leave RUN', () => {
    const m = createRunViewMachine()
    feed(m, { seconds: 8, speed: 2.5 })
    feed(m, { t0: 8000, seconds: 2, speed: 0 })
    feed(m, { t0: 10000, seconds: 5, speed: 2.5 })
    expect(m.state(15000).mode).toBe('run')
  })

  it('slow in-between speed (0.4-1.0) keeps RUN once running (hysteresis band)', () => {
    const m = createRunViewMachine()
    feed(m, { seconds: 8, speed: 2.5 })
    feed(m, { t0: 8000, seconds: 20, speed: 0.7 })
    expect(m.state(28000).mode).toBe('run')
  })

  it('jitter around the run threshold never flickers the view', () => {
    const m = createRunViewMachine()
    let flips = 0
    let prev = 'idle'
    for (let i = 0; i < 120; i += 1) {
      const t = i * 1000
      const speed = i % 2 === 0 ? 0.9 : 1.1 // straddles 1.0 every second
      m.pushFix({ lat: 27.7, lng: 85.3 + i * M, speed, accuracy: 6, t }, t)
      m.tick(t)
      const mode = m.state(t).mode
      if (mode !== prev) flips += 1
      prev = mode
    }
    expect(flips).toBe(0)
  })

  it('never flips more than once per ~2 s, even when speed swings', () => {
    const m = createRunViewMachine({ enterMs: 500, leaveMs: 500 })
    const times = []
    let prev = 'idle'
    for (let i = 0; i < 80; i += 1) {
      const t = i * 500
      const speed = Math.floor(i / 2) % 2 === 0 ? 3 : 0 // 1 s fast, 1 s stopped
      m.pushFix({ lat: 27.7, lng: 85.3 + i * M, speed, accuracy: 6, t }, t)
      m.tick(t)
      const mode = m.state(t).mode
      if (mode !== prev) times.push(t)
      prev = mode
    }
    expect(times.length).toBeGreaterThan(1)
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(
        RUN_VIEW_CONFIG.minDwellMs
      )
    }
  })

  it('GPS stalls (no fix for 4 s) count as stopped: leaves RUN ~3 s after that', () => {
    const m = createRunViewMachine()
    feed(m, { seconds: 8, speed: 2.5 })
    // no more fixes, only the clock
    for (let t = 8000; t <= 20000; t += 500) m.tick(t)
    expect(m.state(20000).mode).toBe('idle')
  })

  it('no device speed: derived from positions (4 m/s of real movement runs, jitter does not)', () => {
    const moving = createRunViewMachine()
    for (let i = 0; i < 30; i += 1) {
      const t = i * 1000
      moving.pushFix(
        {
          lat: 27.7,
          lng: 85.3 + (i * 4 * M) / Math.cos(0.483),
          accuracy: 6,
          t,
        },
        t
      )
      moving.tick(t)
    }
    expect(moving.state(29000).mode).toBe('run')
    const still = createRunViewMachine()
    for (let i = 0; i < 30; i += 1) {
      const t = i * 1000
      const j = ((i * 7) % 5) - 2 // +-2 m wobble
      still.pushFix(
        { lat: 27.7 + j * M, lng: 85.3 + ((i * 3) % 5) * M, accuracy: 6, t },
        t
      )
      still.tick(t)
    }
    expect(still.state(29000).mode).toBe('idle')
  })

  it('scripted fix timestamps far from the wall clock still work (device timeline)', () => {
    const m = createRunViewMachine()
    const base = 1_900_000_000_000
    for (let i = 0; i < 6; i += 1) {
      const t = base + i * 1000
      m.pushFix(
        { lat: 27.7, lng: 85.3 + i * M, speed: 3, accuracy: 6, t },
        5000 + i * 10
      )
    }
    expect(m.state(5060).mode).toBe('run')
  })

  it('debug test thresholds: a 0.6 m/s walk counts as running', () => {
    const m = createRunViewMachine(TEST_RUN_VIEW_OVERRIDES)
    feed(m, { seconds: 6, speed: 0.6 })
    expect(m.state(6000).mode).toBe('run')
  })
})
