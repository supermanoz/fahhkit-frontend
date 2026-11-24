// Every raw location fix the phone delivers during a run, BEFORE the run
// recorder's own filtering (it drops fixes worse than 20 m and keeps at most
// one per 2.5 s - right for distance, but it starves the heading-up map of
// the data it needs). Plain pub/sub: no React, nothing happens unless
// somebody subscribed (the map rotation controller, the debug panel).
//
// fix: { lat, lng, accuracy, speed, heading, t }  (speed m/s, heading degrees
// clockwise from north; both null when the device does not know them)
const subs = new Set()
const stats = {
  total: 0,
  withSpeed: 0,
  withCourse: 0,
  last: null,
}

export function publishFix(fix) {
  stats.total += 1
  if (Number.isFinite(fix.speed)) stats.withSpeed += 1
  if (Number.isFinite(fix.heading)) stats.withCourse += 1
  stats.last = fix
  subs.forEach((cb) => cb(fix))
}

export function subscribeFixes(cb) {
  subs.add(cb)
  return () => subs.delete(cb)
}

// For the debug panel: how many fixes arrived and how many carried a speed /
// a course, plus the latest one.
export function gpsFeedStats() {
  return { ...stats }
}

export function resetGpsFeedStats() {
  stats.total = 0
  stats.withSpeed = 0
  stats.withCourse = 0
  stats.last = null
}
