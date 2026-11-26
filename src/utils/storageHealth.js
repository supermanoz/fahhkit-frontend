// "The phone can't save my run": a tiny shared flag. Set when persisting the
// in-progress run fails (storage full / blocked), cleared by the next write
// that works. The connection banner shows it so the player knows to free
// space instead of finding out after losing a run.
let problem = null
const listeners = new Set()

export function getStorageProblem() {
  return problem
}
export function reportStorageProblem(kind = 'full') {
  if (problem === kind) return
  problem = kind
  listeners.forEach((l) => l(problem))
}
export function clearStorageProblem() {
  if (problem === null) return
  problem = null
  listeners.forEach((l) => l(problem))
}
export function subscribeStorageProblem(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
