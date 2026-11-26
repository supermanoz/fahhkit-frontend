// Is this run an indoor (treadmill) run? The server stores it as a plain
// TRAINING run with no points and has no "indoor" field yet, so the app knows
// it three ways: the run's own flag (a run just recorded, or a future server
// field), the ids of indoor runs this phone submitted, and - for a run loaded
// with its points (detail) - having NO points at all (only a Training run may
// have none).

const KEY = 'fahhkit_indoor_run_ids_v1'
const MAX_IDS = 300

function readIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function rememberIndoorRun(id) {
  if (!id) return
  try {
    const ids = readIds().filter((x) => x !== id)
    ids.push(id)
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-MAX_IDS)))
  } catch {
    // storage unavailable - the detail view still recognises it by "no points"
  }
}

export function isIndoorRun(run) {
  if (!run) return false
  if (run.indoor === true || run.isIndoor === true) return true
  if (run.id && readIds().includes(run.id)) return true
  return (
    Array.isArray(run.points) &&
    run.points.length === 0 &&
    Number(run.duration) > 0
  )
}

// History rows have no points: flag / remembered ids only.
export function isIndoorSummary(run) {
  if (!run) return false
  if (run.indoor === true || run.isIndoor === true) return true
  return Boolean(run.id) && readIds().includes(run.id)
}
