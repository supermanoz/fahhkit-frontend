// Dev-only performance log: render counts, live interval count and geolocation
// callbacks per minute, printed to the console every 30 s. In production
// builds `import.meta.env.DEV` is false, every function below is a no-op and
// the bundler drops the counters.
//
//   perf.render('GamePage')          // call in a component body: counts renders
//   perf.geo('idle-watch')           // call in a geolocation callback
//   perf.trackInterval(name, ms)     // -> untrack(); used by visibleInterval
//
// Also reachable from the console as window.__perf.report().
const DEV = import.meta.env.DEV

const renders = new Map()
const geo = new Map()
const intervals = new Map() // token -> { name, ms }
let startedAt = Date.now()
let token = 0

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1)
}

function report() {
  const minutes = Math.max((Date.now() - startedAt) / 60000, 1 / 60)
  const rows = {}
  renders.forEach(
    (n, k) =>
      (rows[`renders: ${k}`] = { count: n, perMin: +(n / minutes).toFixed(1) })
  )
  geo.forEach(
    (n, k) =>
      (rows[`geo: ${k}`] = { count: n, perMin: +(n / minutes).toFixed(1) })
  )
  const byName = {}
  intervals.forEach(({ name, ms }) => {
    byName[name] = byName[name] || { count: 0, ms }
    byName[name].count += 1
  })
  Object.entries(byName).forEach(
    ([k, v]) => (rows[`interval: ${k}`] = { count: v.count, periodMs: v.ms })
  )
  rows['intervals live (total)'] = { count: intervals.size }
  console.groupCollapsed(`[perf] ${minutes.toFixed(1)} min`)
  console.table(rows)
  console.groupEnd()
}

function reset() {
  renders.clear()
  geo.clear()
  startedAt = Date.now()
}

if (DEV && typeof window !== 'undefined') {
  window.__perf = { report, reset }
  setInterval(() => {
    if (!document.hidden) report()
    reset()
  }, 30000)
}

export const perf = DEV
  ? {
      render: (name) => bump(renders, name),
      geo: (name) => bump(geo, name),
      trackInterval: (name, ms) => {
        const id = ++token
        intervals.set(id, { name, ms })
        return () => intervals.delete(id)
      },
    }
  : {
      render: () => {},
      geo: () => {},
      trackInterval: () => () => {},
    }
