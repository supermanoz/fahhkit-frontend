import { describe, expect, it } from 'vitest'
import { createVehicleDetector, VehicleState } from './vehicleDetection'
import {
  buildTrack,
  footCadence,
  noCadence,
  runTrack,
  withSpike,
} from '../test/gpsTracks'

// Simulated GPS tracks end to end: what the detector decides, and when.
const sec = (tl, state) => {
  const e = tl.find((x) => x.state === state)
  return e ? Math.round((e.t - tl[0].t) / 1000) : null
}
const run = (segs, { sensors = true, onFoot = false, opts } = {}) => {
  const d = createVehicleDetector({ hasMotionSensing: sensors })
  const cad = !sensors ? null : onFoot ? footCadence : noCadence
  return runTrack(d, buildTrack(segs, opts), { stepsFor: cad })
}
const states = (tl) => new Set(tl.map((e) => e.state))

describe('on foot - must never trigger', () => {
  it('walking 1.4 m/s', () => {
    expect(
      states(run([{ seconds: 300, speed: 1.4 }], { onFoot: true }))
    ).toEqual(new Set([VehicleState.RUNNING]))
  })
  it('jogging 3 m/s', () => {
    expect(states(run([{ seconds: 300, speed: 3 }], { onFoot: true }))).toEqual(
      new Set([VehicleState.RUNNING])
    )
  })
  it('a 12 s sprint at 6.5-7 m/s inside a jog', () => {
    const tl = run(
      [
        { seconds: 60, speed: 3 },
        { seconds: 12, speed: 7 },
        { seconds: 60, speed: 3 },
      ],
      { onFoot: true }
    )
    expect(states(tl)).toEqual(new Set([VehicleState.RUNNING]))
  })
  it('a 60 s hard effort at 6.5 m/s is at most a banner, never a vehicle', () => {
    const tl = run([{ seconds: 60, speed: 6.5 }], { onFoot: true })
    expect(states(tl).has(VehicleState.VEHICLE)).toBe(false)
    expect(states(tl).has(VehicleState.DISCARDED)).toBe(false)
  })
  it('jogging with GPS jitter (+-6 m, fair accuracy)', () => {
    let seed = 7
    const rnd = () =>
      ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2
    const fixes = buildTrack([{ seconds: 400, speed: 3 }], {
      accuracy: 15,
    }).map((f) => ({
      ...f,
      lat: f.lat + (rnd() * 6) / 111_320,
      lng: f.lng + (rnd() * 6) / 98_000,
    }))
    const d = createVehicleDetector()
    const tl = runTrack(d, fixes, { stepsFor: footCadence })
    expect(states(tl)).toEqual(new Set([VehicleState.RUNNING]))
  })
  it('a single 400 m GPS spike is dropped, not counted as a vehicle', () => {
    const fixes = withSpike(buildTrack([{ seconds: 200, speed: 3 }]), 30, 400)
    const d = createVehicleDetector()
    const tl = runTrack(d, fixes, { stepsFor: footCadence })
    expect(states(tl)).toEqual(new Set([VehicleState.RUNNING]))
    const counted = tl.reduce(
      (sum, e) =>
        sum + (e.segment && !e.segment.excluded ? e.segment.distanceMeters : 0),
      0
    )
    expect(counted).toBeLessThan(200 * 3 * 1.1) // nowhere near +800 m
  })
  it('a signal gap (tunnel) on foot is not a vehicle', () => {
    const tl = run(
      [
        { seconds: 60, speed: 3 },
        { gap: 40, speed: 3 },
        { seconds: 60, speed: 3 },
      ],
      { onFoot: true }
    )
    expect(states(tl)).toEqual(new Set([VehicleState.RUNNING]))
  })
  it('a runner whose accelerometer went quiet is not convicted for it', () => {
    const d = createVehicleDetector()
    const fixes = buildTrack([{ seconds: 120, speed: 3 }])
    const tl = []
    for (const f of fixes) {
      // Sensor delivers for the first 20 s only (locked screen throttling).
      if (f.timestamp - fixes[0].timestamp < 20_000) {
        d.handleMotionSample(9.81, f.timestamp)
        d.recordStep(f.timestamp - 300)
        d.recordStep(f.timestamp - 700)
      }
      tl.push(d.addGpsPoint(f))
    }
    expect(states(tl)).toEqual(new Set([VehicleState.RUNNING]))
  })
})

describe('vehicles - warning first, then discard', () => {
  const cases = {
    'bike 5.5-8 m/s (sensors, no steps)': [
      { seconds: 60, speed: 5.5 },
      { seconds: 90, speed: 8 },
    ],
    'motorbike 15 m/s': [{ seconds: 120, speed: 15 }],
    'car 25 m/s': [{ seconds: 120, speed: 25 }],
    'highway 32 m/s': [{ seconds: 120, speed: 32 }],
    'bus with stops': [
      { seconds: 30, speed: 9 },
      { seconds: 15, speed: 0 },
      { seconds: 30, speed: 12 },
      { seconds: 15, speed: 0 },
      { seconds: 30, speed: 10 },
    ],
  }
  for (const [name, segs] of Object.entries(cases)) {
    it(`${name}: WARNING then DISCARDED`, () => {
      const tl = run(segs)
      const warn = sec(tl, VehicleState.VEHICLE)
      const discard = sec(tl, VehicleState.DISCARDED)
      expect(warn).not.toBeNull()
      expect(discard).not.toBeNull()
      expect(warn).toBeLessThan(discard)
      expect(warn).toBeLessThanOrEqual(40)
      // ~30 s of warning at most (+ a couple of fixes of slack).
      // ~30 s of warning at most (+ slack). A bus is allowed longer: every
      // stop clears the warning, but the time already spent carries over.
      if (!name.startsWith('bus'))
        expect(discard - warn).toBeLessThanOrEqual(36)
    })
  }

  it('car with NO motion sensor at all: speed alone still warns and discards', () => {
    const tl = run([{ seconds: 120, speed: 15 }], { sensors: false })
    expect(sec(tl, VehicleState.VEHICLE)).not.toBeNull()
    expect(sec(tl, VehicleState.DISCARDED)).not.toBeNull()
  })
  it('city driving at 9 m/s (32 km/h) with no sensor is caught (old limit was 12 m/s)', () => {
    const tl = run([{ seconds: 120, speed: 9 }], { sensors: false })
    expect(sec(tl, VehicleState.VEHICLE)).not.toBeNull()
  })
  it('a bike at 6 m/s with no sensor is only suspicious (banner), never discarded', () => {
    const tl = run([{ seconds: 200, speed: 6 }], { sensors: false })
    expect(states(tl).has(VehicleState.SUSPECT)).toBe(true)
    expect(states(tl).has(VehicleState.DISCARDED)).toBe(false)
  })
  it('bus with stops and no sensor: the warning time carries over and still discards', () => {
    const tl = run(
      [
        { seconds: 30, speed: 10 },
        { seconds: 20, speed: 0 },
        { seconds: 30, speed: 11 },
        { seconds: 20, speed: 0 },
        { seconds: 40, speed: 10 },
      ],
      { sensors: false }
    )
    expect(sec(tl, VehicleState.DISCARDED)).not.toBeNull()
  })
  it('a tunnel in the middle of a drive does not reset the case against them', () => {
    const tl = run(
      [
        { seconds: 30, speed: 20 },
        { gap: 30, speed: 20 },
        { seconds: 90, speed: 20 },
      ],
      { sensors: false }
    )
    expect(sec(tl, VehicleState.DISCARDED)).not.toBeNull()
  })
})

describe('warning phase behaviour', () => {
  it('stops counting distance during the warning and gives back what slipped through', () => {
    const d = createVehicleDetector({ hasMotionSensing: false })
    const fixes = buildTrack([
      { seconds: 40, speed: 3 },
      { seconds: 40, speed: 15 },
    ])
    let counted = 0
    let reclaimed = 0
    let sawWarning = false
    for (const f of fixes) {
      const out = d.addGpsPoint(f)
      if (out.segment && !out.segment.excluded)
        counted += out.segment.distanceMeters
      reclaimed += out.reclaimMeters
      if (out.state === VehicleState.VEHICLE) sawWarning = true
    }
    expect(sawWarning).toBe(true)
    expect(reclaimed).toBeGreaterThan(50)
    // Net distance ~= the walking part (+ a little of the acceleration).
    expect(counted - reclaimed).toBeLessThan(40 * 3 + 150)
  })

  it('slowing to a run inside the warning clears it and counting resumes', () => {
    const d = createVehicleDetector()
    const fixes = buildTrack([
      { seconds: 30, speed: 15 },
      { seconds: 60, speed: 3 },
    ])
    const tl = runTrack(d, fixes, {
      stepsFor: (v) => (v > 10 ? 0 : footCadence(v)),
    })
    expect(sec(tl, VehicleState.VEHICLE)).not.toBeNull()
    expect(states(tl).has(VehicleState.DISCARDED)).toBe(false)
    expect(tl[tl.length - 1].state).toBe(VehicleState.RUNNING)
    expect(tl[tl.length - 1].segment.excluded).toBe(false)
  })

  it('reports a warning countdown that falls toward discard', () => {
    const d = createVehicleDetector({ hasMotionSensing: false })
    const tl = runTrack(d, buildTrack([{ seconds: 90, speed: 15 }]))
    const left = tl
      .filter((e) => e.state === VehicleState.VEHICLE)
      .map((e) => e.out.warningSecondsLeft)
    expect(left[0]).toBeLessThanOrEqual(30)
    expect(left[left.length - 1]).toBeLessThan(left[0])
  })

  it('ignores an iOS speed of -1 (unknown) instead of halving the speed', () => {
    const d = createVehicleDetector({ hasMotionSensing: false })
    const fixes = buildTrack([{ seconds: 120, speed: 12 }]).map((f) => ({
      ...f,
      speedMps: -1,
    }))
    const tl = runTrack(d, fixes)
    expect(sec(tl, VehicleState.VEHICLE)).not.toBeNull()
  })
})
