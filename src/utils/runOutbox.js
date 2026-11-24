// The outbox: finished runs that haven't been accepted by the server yet.
// One record per run, keyed by clientRunId, tagged with the account that
// recorded it (a run is only ever sent by - and shown to - its own account;
// logging out never deletes it).
//
//   status: 'waiting' | 'uploading' | 'done' | 'failed'
//   record: { clientRunId, userId, status, attempts, nextAttemptAt, createdAt,
//             updatedAt, error: {message,status}|null, result: {id,avgPace}|null,
//             summary: {mode,distance,duration,startedAt,endedAt,pointCount},
//             payload: <POST /v1/run body>, meta: {device,...} }
import { getDb, STORE_OUTBOX } from './offlineDb'

export const RUN_STATUS = Object.freeze({
  WAITING: 'waiting',
  UPLOADING: 'uploading',
  DONE: 'done',
  FAILED: 'failed',
})
export const DONE_KEEP_MS = 24 * 60 * 60 * 1000

const listeners = new Set()
function notify() {
  listeners.forEach((fn) => fn())
}
export function subscribeOutbox(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function enqueueRun(record, now = Date.now()) {
  const full = {
    status: RUN_STATUS.WAITING,
    attempts: 0,
    nextAttemptAt: 0,
    error: null,
    result: null,
    meta: {},
    ...record,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  }
  await getDb().put(STORE_OUTBOX, full.clientRunId, full)
  notify()
  return full
}

export async function getOutboxRun(clientRunId) {
  return getDb().get(STORE_OUTBOX, clientRunId)
}

// Oldest first - the order they were recorded is the order they are sent.
export async function listOutbox(userId) {
  const all = await getDb().all(STORE_OUTBOX)
  return all
    .filter((r) => !userId || r.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function updateOutboxRun(clientRunId, patch, now = Date.now()) {
  const current = await getOutboxRun(clientRunId)
  if (!current) return null
  const next = { ...current, ...patch, updatedAt: now }
  await getDb().put(STORE_OUTBOX, clientRunId, next)
  notify()
  return next
}

export async function removeOutboxRun(clientRunId) {
  await getDb().del(STORE_OUTBOX, clientRunId)
  notify()
}

// Failed -> waiting again (the player's Retry).
export function retryOutboxRun(clientRunId) {
  return updateOutboxRun(clientRunId, {
    status: RUN_STATUS.WAITING,
    attempts: 0,
    nextAttemptAt: 0,
    error: null,
  })
}

export async function pruneDone(now = Date.now()) {
  const all = await getDb().all(STORE_OUTBOX)
  const old = all.filter(
    (r) =>
      r.status === RUN_STATUS.DONE &&
      now - (r.syncedAt ?? r.updatedAt) > DONE_KEEP_MS
  )
  await Promise.all(old.map((r) => getDb().del(STORE_OUTBOX, r.clientRunId)))
  if (old.length) notify()
}

// What still needs the player's attention / will still be sent.
export function pendingCount(runs) {
  return runs.filter(
    (r) => r.status === RUN_STATUS.WAITING || r.status === RUN_STATUS.UPLOADING
  ).length
}
