import { describe, expect, it } from 'vitest'
import {
  createVehicleDetector,
  VehicleState,
  SegmentKind,
  compressSegments,
  buildPauseResumeJumpSegment,
} from './vehicleDetection'

const METERS_PER_DEGREE_LAT = 111320

// Builds a straight-line trace moving north at a constant speed, one fix
// every `intervalSeconds`, for `durationSeconds` total. `stepsPerSecond`
// optionally drives a running-cadence footstrike alongside each fix (0 =
// no cadence at all, e.g. cycling/driving).
function buildTrace({
  speedMps,
  durationSeconds,
  intervalSeconds = 2.5,
  accuracy = 5,
  startTimestamp = 1_700_000_000_000,
}) {
  const points = []
  let lat = 10
  const lng = 10
  let t = startTimestamp
  const steps = Math.floor(durationSeconds / intervalSeconds)
  for (let i = 0; i <= steps; i++) {
    points.push({ lat, lng, timestamp: t, accuracy, speedMps })
    lat += (speedMps * intervalSeconds) / METERS_PER_DEGREE_LAT
    t += intervalSeconds * 1000
  }
  return points
}

function feed(detector, points, { cadenceHz = null } = {}) {
  const results = []
  let previousTimestamp = null
  for (const point of points) {
    if (cadenceHz && previousTimestamp != null) {
      const dtSeconds = (point.timestamp - previousTimestamp) / 1000
      const stepCount = Math.round(dtSeconds * cadenceHz)
      for (let i = 1; i <= stepCount; i++) {
        detector.recordStep(
          previousTimestamp + (i / stepCount) * dtSeconds * 1000
        )
      }
    }
    results.push(detector.addGpsPoint(point))
    previousTimestamp = point.timestamp
  }
  return results
}

describe('createVehicleDetector - plausible human traces never flag', () => {
  it('walking (1.4 m/s, with cadence) stays RUNNING', () => {
    const detector = createVehicleDetector()
    const trace = buildTrace({ speedMps: 1.4, durationSeconds: 60 })
    const results = feed(detector, trace, { cadenceHz: 1.8 })
    expect(results.every((r) => r.state === VehicleState.RUNNING)).toBe(true)
  })

  it('running (3.2 m/s, with cadence) stays RUNNING', () => {
    const detector = createVehicleDetector()
    const trace = buildTrace({ speedMps: 3.2, durationSeconds: 60 })
    const results = feed(detector, trace, { cadenceHz: 2.6 })
    expect(results.every((r) => r.state === VehicleState.RUNNING)).toBe(true)
  })

  it('a brief sprint spike (6.5 m/s for 6s) does not trip SUSPECT - too short to sustain', () => {
    const detector = createVehicleDetector()
    const warmup = buildTrace({
      speedMps: 3.0,
      durationSeconds: 30,
      intervalSeconds: 2,
    })
    const sprint = buildTrace({
      speedMps: 6.5,
      durationSeconds: 6,
      intervalSeconds: 2,
      startTimestamp: warmup[warmup.length - 1].timestamp + 2000,
    })
    const cooldown = buildTrace({
      speedMps: 3.0,
      durationSeconds: 30,
      intervalSeconds: 2,
      startTimestamp: sprint[sprint.length - 1].timestamp + 2000,
    })
    const results = feed(detector, [...warmup, ...sprint, ...cooldown], {
      cadenceHz: 3.0,
    })
    expect(results.every((r) => r.state === VehicleState.RUNNING)).toBe(true)
  })
})

describe('createVehicleDetector - vehicle-assisted traces get caught', () => {
  it('cycling (5.5 m/s, no cadence) eventually reaches VEHICLE', () => {
    const detector = createVehicleDetector()
    const trace = buildTrace({ speedMps: 5.5, durationSeconds: 90 })
    const results = feed(detector, trace) // no cadence at all
    // Zero footstrike cadence at this speed is decisive enough that it can
    // escalate straight past SUSPECT - see the no-gait handling comment in
    // vehicleDetection.js.
    expect(results[results.length - 1].state).toBe(VehicleState.VEHICLE)
  })

  it('car in traffic (oscillating 0-10 m/s, no cadence) is still caught', () => {
    const detector = createVehicleDetector()
    const points = []
    let lat = 10
    let t = 1_700_000_000_000
    for (let i = 0; i < 60; i++) {
      // Oscillate between a dead stop and a brisk 10 m/s, as if crawling in traffic.
      const speedMps = i % 2 === 0 ? 9.5 : 1
      points.push({ lat, lng: 10, timestamp: t, accuracy: 5, speedMps })
      lat += (speedMps * 2.5) / METERS_PER_DEGREE_LAT
      t += 2500
    }
    const results = feed(detector, points)
    expect(results[results.length - 1].state).not.toBe(VehicleState.RUNNING)
  })

  it('car on a highway (28 m/s) reaches VEHICLE quickly', () => {
    const detector = createVehicleDetector()
    const trace = buildTrace({
      speedMps: 28,
      durationSeconds: 30,
      intervalSeconds: 2,
    })
    const results = feed(detector, trace)
    const firstVehicleIndex = results.findIndex(
      (r) => r.state === VehicleState.VEHICLE
    )
    expect(firstVehicleIndex).toBeGreaterThan(-1)
    // Should trip well before the trace ends, not just barely at the last fix.
    expect(firstVehicleIndex).toBeLessThan(results.length - 2)
    expect(results[results.length - 1].segment.excluded).toBe(true)
  })

  it('resumes to RUNNING after sustained valid running speed + cadence', () => {
    const detector = createVehicleDetector()
    const drive = buildTrace({
      speedMps: 20,
      durationSeconds: 20,
      intervalSeconds: 2,
    })
    const runAfter = buildTrace({
      speedMps: 3.0,
      durationSeconds: 40,
      intervalSeconds: 2,
      startTimestamp: drive[drive.length - 1].timestamp + 2000,
    })
    feed(detector, drive)
    expect(detector.getState()).toBe(VehicleState.VEHICLE)
    const resumeResults = feed(detector, runAfter, { cadenceHz: 2.6 })
    expect(resumeResults[resumeResults.length - 1].state).toBe(
      VehicleState.RUNNING
    )
  })
})

describe('createVehicleDetector - GPS noise is discarded, not penalized', () => {
  it('a single GPS jump is excluded and does not itself trigger VEHICLE', () => {
    const detector = createVehicleDetector()
    const before = buildTrace({
      speedMps: 3.0,
      durationSeconds: 20,
      intervalSeconds: 2,
    })
    const jumpPoint = {
      lat: before[before.length - 1].lat + 2, // ~222km away in one 2s fix - impossible
      lng: 10,
      timestamp: before[before.length - 1].timestamp + 2000,
      accuracy: 5,
      speedMps: null,
    }
    const after = buildTrace({
      speedMps: 3.0,
      durationSeconds: 20,
      intervalSeconds: 2,
      startTimestamp: jumpPoint.timestamp + 2000,
    })
    const results = feed(detector, [...before, jumpPoint, ...after], {
      cadenceHz: 2.6,
    })
    const jumpResult = results.find((r) => r.segment?.kind === SegmentKind.JUMP)
    expect(jumpResult).toBeTruthy()
    expect(jumpResult.segment.excluded).toBe(true)
    expect(results[results.length - 1].state).toBe(VehicleState.RUNNING)
  })

  it('a tunnel-length signal dropout is discarded, not counted as vehicle', () => {
    const detector = createVehicleDetector()
    const before = buildTrace({
      speedMps: 3.0,
      durationSeconds: 20,
      intervalSeconds: 2,
    })
    const afterGap = buildTrace({
      speedMps: 3.0,
      durationSeconds: 20,
      intervalSeconds: 2,
      // 35s gap - longer than GAP_SECONDS (20s) - as if GPS dropped in a tunnel.
      startTimestamp: before[before.length - 1].timestamp + 35000,
    })
    const results = feed(detector, [...before, ...afterGap], { cadenceHz: 2.6 })
    const gapResult = results.find((r) => r.segment?.kind === SegmentKind.GAP)
    expect(gapResult).toBeTruthy()
    expect(gapResult.segment.excluded).toBe(false)
    expect(results.every((r) => r.state === VehicleState.RUNNING)).toBe(true)
  })
})

describe('createVehicleDetector - dispute and accessibility mode', () => {
  it('dispute() immediately returns to RUNNING', () => {
    const detector = createVehicleDetector()
    const drive = buildTrace({
      speedMps: 20,
      durationSeconds: 20,
      intervalSeconds: 2,
    })
    feed(detector, drive)
    expect(detector.getState()).toBe(VehicleState.VEHICLE)
    detector.dispute()
    expect(detector.getState()).toBe(VehicleState.RUNNING)
  })

  it('a sustained dispute does not stop re-detection if evidence keeps coming', () => {
    const detector = createVehicleDetector()
    const drive = buildTrace({
      speedMps: 20,
      durationSeconds: 20,
      intervalSeconds: 2,
    })
    feed(detector, drive)
    detector.dispute()
    const moreDriving = buildTrace({
      speedMps: 20,
      durationSeconds: 20,
      intervalSeconds: 2,
      startTimestamp: drive[drive.length - 1].timestamp + 2000,
    })
    feed(detector, moreDriving)
    expect(detector.getState()).toBe(VehicleState.VEHICLE)
  })

  it('accessibility mode tolerates higher hand-cycle speeds with no cadence', () => {
    const detector = createVehicleDetector({ accessibilityMode: true })
    // ~9 m/s is above the normal SUSPECT ceiling (7) but under the
    // accessibility-raised one (7 * 1.6 = 11.2) - should never flag.
    const trace = buildTrace({
      speedMps: 9,
      durationSeconds: 60,
      intervalSeconds: 2,
    })
    const results = feed(detector, trace) // no cadence, by design
    expect(results.every((r) => r.state === VehicleState.RUNNING)).toBe(true)
  })

  it('accessibility mode still catches genuinely vehicle-level speed', () => {
    const detector = createVehicleDetector({ accessibilityMode: true })
    const trace = buildTrace({
      speedMps: 25,
      durationSeconds: 30,
      intervalSeconds: 2,
    })
    const results = feed(detector, trace)
    expect(results[results.length - 1].state).toBe(VehicleState.VEHICLE)
  })
})

describe('compressSegments', () => {
  it('merges consecutive same-kind/excluded segments into runs', () => {
    const segments = [
      {
        kind: SegmentKind.RUNNING,
        excluded: false,
        distanceMeters: 5,
        fromTimestamp: 0,
        toTimestamp: 2,
      },
      {
        kind: SegmentKind.RUNNING,
        excluded: false,
        distanceMeters: 5,
        fromTimestamp: 2,
        toTimestamp: 4,
      },
      {
        kind: SegmentKind.VEHICLE,
        excluded: true,
        distanceMeters: 20,
        fromTimestamp: 4,
        toTimestamp: 6,
      },
      {
        kind: SegmentKind.VEHICLE,
        excluded: true,
        distanceMeters: 20,
        fromTimestamp: 6,
        toTimestamp: 8,
      },
      {
        kind: SegmentKind.RUNNING,
        excluded: false,
        distanceMeters: 5,
        fromTimestamp: 8,
        toTimestamp: 10,
      },
    ]
    const merged = compressSegments(segments)
    expect(merged).toHaveLength(3)
    expect(merged[0]).toMatchObject({
      kind: SegmentKind.RUNNING,
      distanceMeters: 10,
      fromTimestamp: 0,
      toTimestamp: 4,
    })
    expect(merged[1]).toMatchObject({
      kind: SegmentKind.VEHICLE,
      distanceMeters: 40,
      fromTimestamp: 4,
      toTimestamp: 8,
    })
    expect(merged[2]).toMatchObject({
      kind: SegmentKind.RUNNING,
      distanceMeters: 5,
      fromTimestamp: 8,
      toTimestamp: 10,
    })
  })
})

describe('buildPauseResumeJumpSegment', () => {
  it('always excludes the pause-to-resume gap, even if it looks like real movement', () => {
    // A runner could genuinely cover real ground during a pause (walking to
    // a water stop and back) - this still must never count as distance,
    // unlike every other segment kind, which is classified from the
    // evidence (see addGpsPoint above).
    const before = { lat: 10, lng: 10, timestamp: 1_700_000_000_000 }
    // ~1.1km away, 10 minutes later - easily a "SUSPECT"/"VEHICLE"-looking
    // implied speed if it were run through the normal detector.
    const after = { lat: 10.01, lng: 10, timestamp: 1_700_000_600_000 }
    const segment = buildPauseResumeJumpSegment(before, after)
    expect(segment.kind).toBe(SegmentKind.JUMP)
    expect(segment.excluded).toBe(true)
    expect(segment.distanceMeters).toBeGreaterThan(0)
    expect(segment.fromTimestamp).toBe(before.timestamp)
    expect(segment.toTimestamp).toBe(after.timestamp)
  })

  it('still carries a real distanceMeters for moderator review, not zero', () => {
    const before = { lat: 10, lng: 10, timestamp: 0 }
    const after = { lat: 10, lng: 10.001, timestamp: 60_000 }
    const segment = buildPauseResumeJumpSegment(before, after)
    // ~111m at the equator for 0.001deg of longitude - just needs to be in
    // the right ballpark, not an exact haversine re-derivation.
    expect(segment.distanceMeters).toBeGreaterThan(50)
    expect(segment.distanceMeters).toBeLessThan(200)
  })
})
