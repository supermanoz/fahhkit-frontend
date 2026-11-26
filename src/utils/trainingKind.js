// Training's Outdoor / Indoor (treadmill) choice - remembered between runs.
export const TRAINING_KIND = Object.freeze({
  OUTDOOR: 'outdoor',
  INDOOR: 'indoor',
})
const KEY = 'fahhkit_training_kind'

export function loadTrainingKind() {
  try {
    return localStorage.getItem(KEY) === TRAINING_KIND.INDOOR
      ? TRAINING_KIND.INDOOR
      : TRAINING_KIND.OUTDOOR
  } catch {
    return TRAINING_KIND.OUTDOOR
  }
}
export function saveTrainingKind(kind) {
  try {
    localStorage.setItem(KEY, kind)
  } catch {
    // no-op
  }
}
