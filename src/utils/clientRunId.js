// A run's idempotency key, created ONCE at run start and persisted with the
// run, so every retry (after a lost response, an app kill, a day offline)
// carries the same id and the server can never count the run twice.
// `run-` prefix keeps it compatible with the id format used before this
// (`run-<startedAt ms>`), which old in-flight records may still carry.
export function newClientRunId() {
  const c = typeof crypto !== 'undefined' ? crypto : null
  if (c?.randomUUID) return `run-${c.randomUUID()}`
  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  return `run-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

// Runs recorded before this existed only have a start time.
export function legacyClientRunId(startedAt) {
  return `run-${new Date(startedAt).getTime()}`
}

export function clientRunIdOf(run) {
  return run?.clientRunId || legacyClientRunId(run?.startedAt)
}
