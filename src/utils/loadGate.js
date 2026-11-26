// What the Me and Shop screens show while their data loads. Pure, so the rules
// are unit-tested: a skeleton on first paint, content the moment data (or a
// cached copy) exists, an error + Retry when loading fails, and the same error
// when a skeleton has been up past the timeout (see hooks/useLoadTimeout.js).
export const GATE = Object.freeze({
  CONTENT: 'content',
  LOADING: 'loading',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
})

// `profile` is the live OR on-device cached profile: any copy = no skeleton.
export function meGate({ isAuthed, profile, profileError, timedOut }) {
  if (profile || !isAuthed) return GATE.CONTENT
  if (profileError) return GATE.FAILED
  return timedOut ? GATE.TIMEOUT : GATE.LOADING
}

// section: 'heroes' | 'territory' | 'trail'. Heroes need the roster (cached
// copy counts); the colour shelves need the catalog request to have succeeded.
export function shopGate({
  section,
  heroCount = 0,
  heroesSettled,
  heroesLoading,
  heroesError,
  catalogLoaded,
  storeError,
  timedOut,
}) {
  const heroes = section === 'heroes'
  const hasData = heroes ? heroCount > 0 : catalogLoaded
  if (hasData) return GATE.CONTENT
  const failed = heroes ? heroesError : Boolean(storeError)
  if (failed) return GATE.FAILED
  if (heroes && heroesSettled && !heroesLoading) return GATE.CONTENT // really empty
  return timedOut ? GATE.TIMEOUT : GATE.LOADING
}
