// Synthetic GPS tracks for vehicle-detection tests. Each track is a list of
// raw fixes { lat, lng, timestamp, accuracy, speedMps } at a fixed cadence
// (default 3 s, like the app's accepted-fix cadence) travelling due north.
// Segments are { seconds, speed } (m/s); `stop` segments use speed 0.
const M_PER_DEG_LAT = 111_320
const START = { lat: 27.7172, lng: 85.324 }

export function buildTrack(segments, { stepSeconds = 3, accuracy = 8 } = {}) {
  const fixes = []
  let t = 1_700_000_000_000
  let north = 0
  fixes.push({ ...START, timestamp: t, accuracy, speedMps: 0 })
  for (const seg of segments) {
    if (seg.gap) {
      // Signal dropped: time passes, position keeps moving at `speed`.
      t += seg.gap * 1000
      north += (seg.speed ?? 0) * seg.gap
      fixes.push({
        lat: START.lat + north / M_PER_DEG_LAT,
        lng: START.lng,
        timestamp: t,
        accuracy,
        speedMps: seg.speed ?? 0,
      })
      continue
    }
    const n = Math.round(seg.seconds / stepSeconds)
    for (let i = 0; i < n; i++) {
      t += stepSeconds * 1000
      north += seg.speed * stepSeconds
      fixes.push({
        lat: START.lat + north / M_PER_DEG_LAT,
        lng: START.lng,
        timestamp: t,
        accuracy: seg.accuracy ?? accuracy,
        speedMps: seg.speed,
      })
    }
  }
  return fixes
}

// A spike: one fix thrown `meters` sideways, the next fix back on the path.
export function withSpike(fixes, index, meters = 400) {
  return fixes.map((f, i) =>
    i === index ? { ...f, lng: f.lng + meters / (M_PER_DEG_LAT * 0.88) } : f
  )
}

// Feeds a track into a detector. Footsteps (cadence) are injected for the
// stretches where `onFoot(speed)` is true. Returns a timeline of states.
export function runTrack(detector, fixes, { stepsFor } = {}) {
  const sensing = Boolean(stepsFor)
  const timeline = []
  let prevT = null
  for (const fix of fixes) {
    if (sensing && prevT != null) {
      // The accelerometer keeps reporting even with no footsteps.
      for (let t = prevT; t < fix.timestamp; t += 1000) {
        detector.handleMotionSample(9.81, t)
      }
      const hz = stepsFor(fix.speedMps)
      if (hz > 0) {
        for (let t = prevT; t < fix.timestamp; t += 1000 / hz) {
          detector.recordStep(t)
        }
      }
    }
    prevT = fix.timestamp
    const out = detector.addGpsPoint(fix)
    timeline.push({
      t: fix.timestamp,
      state: out.state,
      segment: out.segment,
      out,
    })
  }
  return timeline
}

// Cadence a person on foot would show at a given speed (steps/s); 0 for a
// vehicle/bike (no footstrikes).
export const footCadence = (v) => (v <= 0.3 ? 0 : v < 2.5 ? 1.8 : 2.8)
export const noCadence = () => 0
export const firstTimeOf = (timeline, state) =>
  timeline.find((e) => e.state === state)?.t
