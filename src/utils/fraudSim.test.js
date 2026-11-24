import { describe, expect, it } from 'vitest'
import { feed, hop, replay, serverVerdict, spike } from '../test/fraudSim'
import { createVehicleDetector, VehicleState } from './vehicleDetection'

// What the live run pipeline does to realistic phone feeds. Every scenario
// runs on several noise seeds (GPS error is AR(1) drift, sigma = accuracy/1.5,
// i.e. the reported accuracy is a 68 % radius). `replay` goes through the same
// front door as hooks/useRunTracker.js (fixes worse than 20 m dropped, one fix
// per 2.5 s) and also reports what the backend's sustained-speed check
// (mirrored in test/fraudSim.js) would say about the accepted points.
//
//   LEGIT  must never reach the VEHICLE warning, never be discarded, never be
//          rejected by the server mirror.
//   CHEAT  must be caught by the client (warning) - and, where the speed is
//          beyond the server's 12 m/s ceiling, by the server mirror too.
const SEEDS = [1, 2, 3, 4, 5]
const FOOT = { steps: 2.7, wobble: 4 } // clean footstrikes
const WALK = { steps: 1.8, wobble: 3 }

const LEGIT = {
  'walk 1.4 m/s, good GPS': () => feed([{ seconds: 600, speed: 1.4, ...WALK }]),
  'walk 1.4 m/s, 15-25 m accuracy + jitter': (seed) =>
    feed([{ seconds: 600, speed: 1.4, accuracy: [15, 25], ...WALK }], { seed }),
  'slow walker 0.8 m/s, 10-20 m accuracy': (seed) =>
    feed([{ seconds: 600, speed: 0.8, accuracy: [10, 20], ...WALK }], { seed }),
  'jog 2.8 m/s, 10-20 m accuracy': (seed) =>
    feed([{ seconds: 600, speed: 2.8, accuracy: [10, 20], ...FOOT }], { seed }),
  'run 4 m/s, good GPS': (seed) =>
    feed([{ seconds: 600, speed: 4, ...FOOT }], { seed }),
  'run 4 m/s, 10-20 m accuracy': (seed) =>
    feed([{ seconds: 600, speed: 4, accuracy: [10, 20], ...FOOT }], { seed }),
  'run 4 m/s, phone in an armband (no clean steps, body wobble)': (seed) =>
    feed([{ seconds: 600, speed: 4, steps: 0, wobble: 2.8 }], { seed }),
  'standing still, 15-20 m accuracy (jitter only)': (seed) =>
    feed([{ seconds: 600, speed: 0, steps: 0, accuracy: [15, 20] }], { seed }),
  'standing still, 8-12 m accuracy': (seed) =>
    feed([{ seconds: 600, speed: 0, steps: 0, accuracy: [8, 12] }], { seed }),
  'stop and go (jog, 30 s stops)': (seed) =>
    feed(
      [
        { seconds: 60, speed: 3, ...FOOT },
        { seconds: 30, speed: 0, steps: 0 },
        { seconds: 60, speed: 3, ...FOOT },
        { seconds: 30, speed: 0, steps: 0 },
        { seconds: 60, speed: 3, ...FOOT },
      ],
      { seed }
    ),
  'app backgrounded / screen locked: 90 s with no fixes': (seed) =>
    feed(
      [
        { seconds: 120, speed: 3, ...FOOT },
        { seconds: 90, speed: 3, silent: true },
        { seconds: 120, speed: 3, ...FOOT },
      ],
      { seed }
    ),
  'tunnel: 40 s with no fixes at jogging pace': (seed) =>
    feed(
      [
        { seconds: 120, speed: 3, ...FOOT },
        { seconds: 40, speed: 3, silent: true },
        { seconds: 120, speed: 3, ...FOOT },
      ],
      { seed }
    ),
  'motion permission denied (iOS), run 4 m/s': (seed) =>
    feed([{ seconds: 600, speed: 4 }], { seed }),
  'single GPS spike of 600 m mid-run': (seed) =>
    spike(feed([{ seconds: 300, speed: 3, ...FOOT }], { seed }), 100, 600),
  'a 15 s sprint at 6.5 m/s inside a jog': (seed) =>
    feed(
      [
        { seconds: 90, speed: 3, ...FOOT },
        { seconds: 15, speed: 6.5, ...FOOT },
        { seconds: 90, speed: 3, ...FOOT },
      ],
      { seed }
    ),
}

describe('legit runs are never flagged', () => {
  for (const [name, make] of Object.entries(LEGIT)) {
    it(name, () => {
      for (const seed of SEEDS) {
        const opts = name.startsWith('motion permission denied')
          ? { motionSensing: false }
          : {}
        const r = replay(make(seed), opts)
        expect(r.flagged, `seed ${seed}: ${[...r.states]}`).toBe(false)
        expect(r.discarded).toBe(false)
        expect(r.ratio).toBeLessThan(0.1)
        expect(r.server.rejected, `server seed ${seed}: ${r.server.why}`).toBe(
          false
        )
      }
    })
  }

  it('pause then resume after walking to a water stop (detector is fresh, the gap is excluded)', () => {
    const fixes = feed(
      [
        { seconds: 120, speed: 3, ...FOOT },
        { seconds: 60, speed: 1.4, ...WALK }, // paused: walked on
        { seconds: 120, speed: 3, ...FOOT },
      ],
      { seed: 2 }
    )
    const resumeAt = fixes.findIndex(
      (f) => f.timestamp - fixes[0].timestamp > 180_000
    )
    const r = replay(fixes, { pauseAt: [resumeAt] })
    expect(r.flagged).toBe(false)
  })
})

describe('cheating is still caught', () => {
  const CHEATS = {
    'car at 10 m/s with a motion sensor': (s) =>
      feed([{ seconds: 300, speed: 10, steps: 0 }], { seed: s }),
    'car at 10 m/s, no sensor at all': (s) =>
      feed([{ seconds: 300, speed: 10 }], { seed: s }),
    'city driving at 8 m/s': (s) =>
      feed([{ seconds: 300, speed: 8, steps: 0 }], { seed: s }),
    'bike at 5.5 m/s': (s) =>
      feed([{ seconds: 300, speed: 5.5, steps: 0 }], { seed: s }),
    'slow bike at 4 m/s (flat accelerometer, no footsteps)': (s) =>
      feed([{ seconds: 300, speed: 4, steps: 0, wobble: 0.3 }], { seed: s }),
    'mock GPS: constant 15 m/s, no chip speed, perfect accuracy': (s) =>
      feed([{ seconds: 300, speed: 15, noSpeed: true, accuracy: 3 }], {
        seed: s,
        rho: 0,
      }),
  }
  for (const [name, make] of Object.entries(CHEATS)) {
    it(name, () => {
      for (const seed of SEEDS) {
        const sensing = !name.includes('no sensor') && !name.includes('mock')
        const r = replay(make(seed), { motionSensing: sensing })
        expect(r.flagged, `seed ${seed}: ${[...r.states]}`).toBe(true)
        // Caught quickly, not after the whole run.
        expect(r.firstFlagAt).toBeLessThan(60)
        // And what slipped through before the warning is taken back.
        // (credited distance is now measured, not jitter-inflated, so the
        // share is a little lower than with raw hops; the run is still
        // flagged and discarded.)
        expect(r.ratio).toBeGreaterThan(0.4)
      }
    })
  }

  it('server mirror: 10 m/s trace is over the 12 m/s ceiling only when truly fast', () => {
    const car = replay(feed([{ seconds: 120, speed: 14, steps: 0 }]))
    expect(car.server.rejected).toBe(true)
    // City driving at 8 m/s is caught by the CLIENT; the server's 12 m/s
    // ceiling lets it through (backend item for Manoj).
    const city = replay(feed([{ seconds: 120, speed: 8, steps: 0 }]))
    expect(city.server.rejected).toBe(false)
  })

  it('a permanent 600 m teleport is excluded from distance and caught by the server mirror', () => {
    const r = replay(hop(feed([{ seconds: 300, speed: 3, ...FOOT }]), 100, 600))
    expect(r.distance).toBeLessThan(300 * 3 * 1.25) // the hop is not credited
    expect(r.server.rejected).toBe(true)
  })

  it('a single 600 m spike is never credited', () => {
    const r = replay(
      spike(feed([{ seconds: 300, speed: 3, ...FOOT }]), 100, 600)
    )
    expect(r.distance).toBeLessThan(300 * 3 * 1.25)
  })

  it('repeated teleports every 20 s are dropped one by one and never credited', () => {
    let fixes = feed([{ seconds: 400, speed: 3, ...FOOT }], { seed: 3 })
    for (let i = 20; i < fixes.length; i += 20) fixes = spike(fixes, i, 500)
    const r = replay(fixes)
    expect(r.distance).toBeLessThan(400 * 3 * 1.3)
  })
})

describe('serverVerdict mirror (TerritoryAntiCheatValidator)', () => {
  it('accepts an empty/one-point trace and a 3 m/s trace', () => {
    expect(serverVerdict([]).rejected).toBe(false)
    const f = feed([{ seconds: 60, speed: 3 }])
    expect(serverVerdict(f).rejected).toBe(false)
  })
})

describe('detector rules', () => {
  const cruise = (
    d,
    {
      speed,
      wobble = 0,
      steps = 0,
      seconds = 120,
      accuracy = 5,
      noSpeed = false,
    }
  ) => {
    const fixes = feed([{ seconds, speed, steps, wobble, accuracy, noSpeed }], {
      rho: 0,
    })
    let last = 0
    let state = VehicleState.RUNNING
    for (const f of fixes) {
      if (f.timestamp - last < 2500) continue
      last = f.timestamp
      if (f.steps != null) {
        for (let k = 0; k < 20; k += 1)
          d.handleMotionSample(
            9.81 + (k % 2 ? f.wobble : -f.wobble),
            f.timestamp - 1000 + k * 50
          )
      }
      state = d.addGpsPoint(f).state
    }
    return state
  }

  it('a sensor that never reported is "unknown": a 4 m/s run is not convicted for missing footsteps', () => {
    const d = createVehicleDetector({ hasMotionSensing: true })
    const fixes = feed([{ seconds: 200, speed: 4, accuracy: 5 }], { rho: 0 })
    let last = 0
    let state
    for (const f of fixes) {
      if (f.timestamp - last < 2500) continue
      last = f.timestamp
      state = d.addGpsPoint(f).state
    }
    expect(state).toBe(VehicleState.RUNNING)
  })

  it('fast + flat accelerometer + no footsteps is a vehicle, but only after it is sustained', () => {
    const d = createVehicleDetector()
    // 30 s of it is not enough (10 s sustain + 3 s hysteresis after the window fills)...
    expect(cruise(d, { speed: 4, wobble: 0.2, seconds: 22 })).toBe(
      VehicleState.RUNNING
    )
    // ...but it does get there.
    expect(
      cruise(createVehicleDetector(), { speed: 4, wobble: 0.2, seconds: 50 })
    ).toBe(VehicleState.VEHICLE)
  })

  it('body wobble without clean steps (armband) is not "no gait"', () => {
    expect(
      cruise(createVehicleDetector(), { speed: 4, wobble: 2.8, seconds: 240 })
    ).toBe(VehicleState.RUNNING)
  })
})

// --- Counted distance (utils/distanceFilter.js) ---------------------------
// "before" = the pipeline without the distance filter or the wobble gate (raw
// hops); "now" = what the tracker credits. Truth is distance x speed.
describe('counted distance accuracy (GPS noise must not inflate it)', () => {
  const NOW = (fixes, o) => replay(fixes, o).distance
  const BEFORE = (fixes) =>
    replay(fixes, { distanceFilter: false, wobbleGate: false }).distance
  const within = (value, truth, pct) =>
    Math.abs(value - truth) <= (truth * pct) / 100
  const each = (make, check) => {
    for (const seed of SEEDS) check(make(seed), seed)
  }

  for (const noise of [5, 15, 30]) {
    it(`standing still 10 min with ${noise} m noise: under 20 m counted`, () => {
      each(
        (seed) =>
          feed([{ seconds: 600, speed: 0, steps: 0, accuracy: noise }], {
            seed,
          }),
        (f, seed) => {
          expect(NOW(f), `seed ${seed}`).toBeLessThan(20)
          // ...and the raw pipeline really would have inflated it (noise 30 m
          // never gets past the tracker's 20 m accuracy gate at all).
          if (noise < 20) expect(BEFORE(f)).toBeGreaterThan(500)
        }
      )
    })
  }

  it('standing still, chip gives NO speed: still under 20 m', () => {
    for (const noise of [5, 15]) {
      each(
        (seed) =>
          feed(
            [
              {
                seconds: 600,
                speed: 0,
                steps: 0,
                accuracy: noise,
                noSpeed: true,
              },
            ],
            { seed }
          ),
        (f) => expect(NOW(f)).toBeLessThan(20)
      )
    }
  })

  it('walk 1.4 m/s with 15 m noise: within 5% of the true 840 m (was ~3x)', () => {
    each(
      (seed) =>
        feed([{ seconds: 600, speed: 1.4, ...WALK, accuracy: 15 }], { seed }),
      (f, seed) => {
        expect(within(NOW(f), 840, 5), `seed ${seed}: ${NOW(f)}`).toBe(true)
        expect(BEFORE(f)).toBeGreaterThan(840 * 2)
      }
    )
  })

  for (const acc of [5, 8, 15]) {
    it(`jog 3 m/s with ${acc} m accuracy: within 3% of the true 1800 m`, () => {
      each(
        (seed) =>
          feed([{ seconds: 600, speed: 3, ...FOOT, accuracy: acc }], { seed }),
        (f, seed) =>
          expect(within(NOW(f), 1800, 3), `seed ${seed}: ${NOW(f)}`).toBe(true)
      )
    })
  }

  it('no chip speed (position only): never over-credits; within 15% for a jog', () => {
    each(
      (seed) =>
        feed(
          [{ seconds: 600, speed: 3, ...FOOT, accuracy: 8, noSpeed: true }],
          { seed }
        ),
      (f) => expect(within(NOW(f), 1800, 15)).toBe(true)
    )
    each(
      (seed) =>
        feed(
          [{ seconds: 600, speed: 1.4, ...WALK, accuracy: 15, noSpeed: true }],
          { seed }
        ),
      (f) => {
        expect(NOW(f)).toBeLessThan(840 * 1.05) // never inflated
        expect(NOW(f)).toBeGreaterThan(840 * 0.8)
      }
    )
  })

  it('stop and go (jog, 30 s stops): within 6% of 540 m, the stops add nothing', () => {
    each(
      (seed) =>
        feed(
          [
            { seconds: 60, speed: 3, ...FOOT, accuracy: 10 },
            { seconds: 30, speed: 0, steps: 0, accuracy: 10 },
            { seconds: 60, speed: 3, ...FOOT, accuracy: 10 },
            { seconds: 30, speed: 0, steps: 0, accuracy: 10 },
            { seconds: 60, speed: 3, ...FOOT, accuracy: 10 },
          ],
          { seed }
        ),
      (f, seed) =>
        expect(within(NOW(f), 540, 6), `seed ${seed}: ${NOW(f)}`).toBe(true)
    )
  })

  it('slow start (30 s standing, then a walk): no distance lost at the start, within 6%', () => {
    each(
      (seed) =>
        feed(
          [
            { seconds: 30, speed: 0, steps: 0, accuracy: 12 },
            { seconds: 300, speed: 1.4, ...WALK, accuracy: 12 },
          ],
          { seed }
        ),
      (f, seed) =>
        expect(within(NOW(f), 420, 6), `seed ${seed}: ${NOW(f)}`).toBe(true)
    )
  })

  it('pause then resume after walking off: the pause adds nothing, the run resumes cleanly', () => {
    each(
      (seed) =>
        feed(
          [
            { seconds: 60, speed: 3, ...FOOT, accuracy: 8 },
            { seconds: 60, speed: 1.4, ...WALK, accuracy: 8 }, // paused
            { seconds: 60, speed: 3, ...FOOT, accuracy: 8 },
          ],
          { seed }
        ),
      (f, seed) => {
        // While paused the tracker has no GPS watch: no fixes in that window.
        const t0 = f[0].timestamp
        const live = f.filter(
          (x) => x.timestamp - t0 <= 60_000 || x.timestamp - t0 > 120_000
        )
        const resumeAt = live.findIndex((x) => x.timestamp - t0 > 120_000)
        const d = NOW(live, { pauseAt: [resumeAt] })
        // 2 x 60 s at 3 m/s = 360 m (the paused walk is not counted).
        expect(within(d, 360, 8), `seed ${seed}: ${d}`).toBe(true)
      }
    )
  })

  it('poor GPS indoors (15-20 m, still), then outdoors: nothing indoors, the walk counts', () => {
    each(
      (seed) =>
        feed(
          [
            { seconds: 120, speed: 0, steps: 0, accuracy: [15, 20] },
            { seconds: 300, speed: 3, ...FOOT, accuracy: 6 },
          ],
          { seed }
        ),
      (f, seed) =>
        expect(within(NOW(f), 900, 6), `seed ${seed}: ${NOW(f)}`).toBe(true)
    )
  })

  it('footsteps corroborate: no steps for 10 s + a chip stuck at ~0.5 m/s: credit roughly halves', () => {
    each(
      (seed) =>
        feed(
          [
            {
              seconds: 300,
              speed: 0.5,
              speedNoise: 0.08,
              steps: 0,
              accuracy: 12,
            },
          ],
          { seed }
        ),
      (f, seed) => {
        const withSteps = NOW(f)
        const without = NOW(f, { filterConfig: { stepQuietSeconds: 1e9 } })
        // An adversarial case (a chip stuck just under the moving threshold):
        // the step check roughly halves what would be credited.
        expect(withSteps, `seed ${seed}`).toBeLessThan(100)
        expect(withSteps).toBeLessThan(without * 0.7)
      }
    )
  })

  it('...but never when the body is moving: no clean steps + armband wobble keeps counting a slow walk', () => {
    each(
      (seed) =>
        feed(
          [{ seconds: 300, speed: 0.9, steps: 0, wobble: 2.8, accuracy: 8 }],
          { seed }
        ),
      (f, seed) =>
        expect(within(NOW(f), 270, 8), `seed ${seed}: ${NOW(f)}`).toBe(true)
    )
  })

  it('a missing step sensor never blocks counting (iOS motion denied)', () => {
    each(
      (seed) => feed([{ seconds: 600, speed: 3, accuracy: 8 }], { seed }),
      (f) =>
        expect(within(NOW(f, { motionSensing: false }), 1800, 3)).toBe(true)
    )
  })

  it('does not weaken fraud detection: a car is still flagged with the filter on', () => {
    const r = replay(feed([{ seconds: 300, speed: 10, steps: 0 }]))
    expect(r.flagged).toBe(true)
    // and its credited distance stays tiny (capped at 8 m/s, reclaimed)
    expect(r.distance).toBeLessThan(150)
  })
})
