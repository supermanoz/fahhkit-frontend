// Uploads the outbox. Rules:
//  - one run at a time, oldest first (a later run never overtakes an earlier);
//  - the run's clientRunId is its idempotency key, so a retry after a lost
//    response returns the run the server already has - never a duplicate;
//  - no connection            -> back to 'waiting', stop (resumes when online);
//  - 401/403 (token expired / logged out) -> 'waiting', stop, NO penalty: the
//    queue is kept and sent after the next login;
//  - 5xx / 408 / 425 / 429    -> 'waiting' with exponential backoff, stop;
//  - any other 4xx (validation, anti-cheat, too old...) -> 'failed' with the
//    server's reason, never retried automatically, and the next run continues.
import { RUN_STATUS, listOutbox, pruneDone, updateOutboxRun } from './runOutbox'
import { runErrorMessage } from './runErrors'

export const BACKOFF_BASE_MS = 5000
export const BACKOFF_MAX_MS = 5 * 60 * 1000

export function backoffMs(attempts) {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts), BACKOFF_MAX_MS)
}

// -> { kind: 'network' | 'auth' | 'retry' | 'permanent', message }
export function classifyError(err) {
  const status = err?.status ?? 0
  // Plain language by the backend's errorCode (never a raw code).
  const message = runErrorMessage(err)
  if (status === 0) return { kind: 'network', message }
  if (status === 401 || status === 403) return { kind: 'auth', message }
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return { kind: 'retry', message }
  }
  return { kind: 'permanent', message }
}

let flushing = null

// send(payload, clientRunId) -> the created run ({id, avgPace...}); throws
// ApiError. onSynced(record, result) fires after each accepted run.
// -> { sent: number, failed: number, nextDueAt: number | null }
export function flushOutbox({ userId, send, onSynced, now = Date.now }) {
  if (!userId) return Promise.resolve({ sent: 0, failed: 0, nextDueAt: null })
  if (flushing) return flushing
  flushing = run({ userId, send, onSynced, now }).finally(() => {
    flushing = null
  })
  return flushing
}

async function run({ userId, send, onSynced, now }) {
  const result = { sent: 0, failed: 0, nextDueAt: null }
  await pruneDone(now())
  // An app kill mid-upload leaves 'uploading': the server either has the run
  // (the idempotent resend returns it) or doesn't (the resend creates it).
  for (const r of await listOutbox(userId)) {
    if (r.status === RUN_STATUS.UPLOADING) {
      await updateOutboxRun(r.clientRunId, { status: RUN_STATUS.WAITING })
    }
  }
  const queue = (await listOutbox(userId)).filter(
    (r) => r.status === RUN_STATUS.WAITING
  )
  for (const record of queue) {
    if (record.nextAttemptAt > now()) {
      result.nextDueAt = record.nextAttemptAt
      break
    }
    await updateOutboxRun(record.clientRunId, { status: RUN_STATUS.UPLOADING })
    try {
      const created = await send(record.payload, record.clientRunId)
      const done = await updateOutboxRun(record.clientRunId, {
        status: RUN_STATUS.DONE,
        syncedAt: now(),
        error: null,
        result: { id: created?.id ?? null, avgPace: created?.avgPace ?? null },
      })
      result.sent += 1
      onSynced?.(done, created)
    } catch (err) {
      const { kind, message } = classifyError(err)
      if (kind === 'permanent') {
        await updateOutboxRun(record.clientRunId, {
          status: RUN_STATUS.FAILED,
          error: {
            message,
            status: err?.status ?? null,
            errorCode: err?.errorCode ?? null,
          },
        })
        result.failed += 1
        continue
      }
      const attempts = kind === 'retry' ? record.attempts + 1 : record.attempts
      const nextAttemptAt =
        kind === 'retry' ? now() + backoffMs(record.attempts) : 0
      await updateOutboxRun(record.clientRunId, {
        status: RUN_STATUS.WAITING,
        attempts,
        nextAttemptAt,
        error: { message, status: err?.status ?? 0 },
      })
      if (kind === 'retry') result.nextDueAt = nextAttemptAt
      break
    }
  }
  return result
}
