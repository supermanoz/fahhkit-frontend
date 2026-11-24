import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __setDbForTests, createMemoryDb } from './offlineDb'
import {
  DONE_KEEP_MS,
  RUN_STATUS,
  enqueueRun,
  getOutboxRun,
  listOutbox,
  retryOutboxRun,
} from './runOutbox'
import {
  BACKOFF_BASE_MS,
  backoffMs,
  classifyError,
  flushOutbox,
} from './runSync'

const err = (status, message = 'nope') =>
  Object.assign(new Error(message), { status })
const rec = (id, createdAt, userId = 'u1') => ({
  clientRunId: id,
  userId,
  createdAt,
  payload: { clientRunId: id, distance: 1000 },
  summary: { distance: 1000 },
})

beforeEach(() => {
  __setDbForTests(createMemoryDb())
})

describe('classifyError', () => {
  it.each([
    [0, 'network'],
    [401, 'auth'],
    [403, 'auth'],
    [408, 'retry'],
    [429, 'retry'],
    [500, 'retry'],
    [503, 'retry'],
    [400, 'permanent'],
    [409, 'permanent'],
    [422, 'permanent'],
    [413, 'permanent'],
  ])('%s -> %s', (status, kind) => {
    expect(classifyError(err(status)).kind).toBe(kind)
  })
})

describe('backoff', () => {
  it('doubles and is capped', () => {
    expect(backoffMs(0)).toBe(BACKOFF_BASE_MS)
    expect(backoffMs(1)).toBe(BACKOFF_BASE_MS * 2)
    expect(backoffMs(30)).toBe(5 * 60 * 1000)
  })
})

describe('flushOutbox', () => {
  it('sends in order, one at a time, with the clientRunId, and marks done', async () => {
    await enqueueRun(rec('run-b', 2000))
    await enqueueRun(rec('run-a', 1000))
    const order = []
    let inFlight = 0
    let maxInFlight = 0
    const send = vi.fn(async (payload, id) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      order.push(id)
      inFlight--
      return { id: `srv-${id}`, avgPace: 5 }
    })
    const onSynced = vi.fn()
    const out = await flushOutbox({ userId: 'u1', send, onSynced })
    expect(order).toEqual(['run-a', 'run-b'])
    expect(maxInFlight).toBe(1)
    expect(send.mock.calls[0][0].clientRunId).toBe('run-a')
    expect(out.sent).toBe(2)
    expect(onSynced).toHaveBeenCalledTimes(2)
    const a = await getOutboxRun('run-a')
    expect(a.status).toBe(RUN_STATUS.DONE)
    expect(a.result).toEqual({ id: 'srv-run-a', avgPace: 5 })
  })

  it('a second flush never re-sends a done run (no duplicates)', async () => {
    await enqueueRun(rec('run-a', 1))
    const send = vi.fn(async () => ({ id: 1 }))
    await flushOutbox({ userId: 'u1', send })
    await flushOutbox({ userId: 'u1', send })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('concurrent flushes share one pass', async () => {
    await enqueueRun(rec('run-a', 1))
    const send = vi.fn(async () => ({ id: 1 }))
    await Promise.all([
      flushOutbox({ userId: 'u1', send }),
      flushOutbox({ userId: 'u1', send }),
    ])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('network failure keeps the run waiting and stops the queue (order kept)', async () => {
    await enqueueRun(rec('run-a', 1))
    await enqueueRun(rec('run-b', 2))
    const send = vi.fn().mockRejectedValue(err(0))
    await flushOutbox({ userId: 'u1', send })
    expect(send).toHaveBeenCalledTimes(1)
    const [a, b] = await listOutbox('u1')
    expect([a.status, b.status]).toEqual([
      RUN_STATUS.WAITING,
      RUN_STATUS.WAITING,
    ])
    expect(a.attempts).toBe(0)
    expect(a.nextAttemptAt).toBe(0)
  })

  it('a lost response then a retry sends the SAME id again (idempotent resend)', async () => {
    await enqueueRun(rec('run-a', 1))
    const send = vi
      .fn()
      .mockRejectedValueOnce(err(0)) // request reached the server, answer lost
      .mockResolvedValueOnce({ id: 7 })
    await flushOutbox({ userId: 'u1', send })
    await flushOutbox({ userId: 'u1', send })
    expect(send.mock.calls.map((c) => c[1])).toEqual(['run-a', 'run-a'])
    expect((await getOutboxRun('run-a')).status).toBe(RUN_STATUS.DONE)
  })

  it('5xx backs off exponentially and is not retried before it is due', async () => {
    await enqueueRun(rec('run-a', 1))
    let t = 100_000
    const now = () => t
    const send = vi.fn().mockRejectedValue(err(503, 'down'))
    let out = await flushOutbox({ userId: 'u1', send, now })
    let a = await getOutboxRun('run-a')
    expect(a.attempts).toBe(1)
    expect(a.nextAttemptAt).toBe(100_000 + BACKOFF_BASE_MS)
    expect(out.nextDueAt).toBe(a.nextAttemptAt)
    // too early: nothing is sent
    await flushOutbox({ userId: 'u1', send, now })
    expect(send).toHaveBeenCalledTimes(1)
    t = a.nextAttemptAt + 1
    await flushOutbox({ userId: 'u1', send, now })
    a = await getOutboxRun('run-a')
    expect(send).toHaveBeenCalledTimes(2)
    expect(a.nextAttemptAt).toBe(t + BACKOFF_BASE_MS * 2)
  })

  it('a permanent 4xx marks the run failed with the reason and moves on', async () => {
    await enqueueRun(rec('run-a', 1))
    await enqueueRun(rec('run-b', 2))
    const send = vi
      .fn()
      .mockRejectedValueOnce(err(422, 'Run rejected: speed too high'))
      .mockResolvedValueOnce({ id: 9 })
    const out = await flushOutbox({ userId: 'u1', send })
    const a = await getOutboxRun('run-a')
    expect(a.status).toBe(RUN_STATUS.FAILED)
    expect(a.error).toEqual({
      message: 'Run rejected: speed too high',
      status: 422,
    })
    expect((await getOutboxRun('run-b')).status).toBe(RUN_STATUS.DONE)
    expect(out).toMatchObject({ sent: 1, failed: 1 })
    // failed is never retried automatically...
    await flushOutbox({ userId: 'u1', send })
    expect(send).toHaveBeenCalledTimes(2)
    // ...until the player taps Retry
    await retryOutboxRun('run-a')
    send.mockResolvedValueOnce({ id: 10 })
    await flushOutbox({ userId: 'u1', send })
    expect((await getOutboxRun('run-a')).status).toBe(RUN_STATUS.DONE)
  })

  it('401/403 keeps the run queued with no penalty (sent after the next login)', async () => {
    await enqueueRun(rec('run-a', 1))
    const send = vi.fn().mockRejectedValue(err(401))
    await flushOutbox({ userId: 'u1', send })
    const a = await getOutboxRun('run-a')
    expect(a).toMatchObject({
      status: RUN_STATUS.WAITING,
      attempts: 0,
      nextAttemptAt: 0,
    })
    send.mockResolvedValue({ id: 5 })
    await flushOutbox({ userId: 'u1', send })
    expect((await getOutboxRun('run-a')).status).toBe(RUN_STATUS.DONE)
  })

  it("only sends the signed-in account's runs", async () => {
    await enqueueRun(rec('mine', 1, 'u1'))
    await enqueueRun(rec('theirs', 2, 'u2'))
    const send = vi.fn(async () => ({ id: 1 }))
    await flushOutbox({ userId: 'u1', send })
    expect(send.mock.calls.map((c) => c[1])).toEqual(['mine'])
    expect((await getOutboxRun('theirs')).status).toBe(RUN_STATUS.WAITING)
    expect(await flushOutbox({ userId: null, send })).toMatchObject({ sent: 0 })
  })

  it('a run left "uploading" by an app kill is picked up again', async () => {
    await enqueueRun({ ...rec('run-a', 1), status: RUN_STATUS.UPLOADING })
    const send = vi.fn(async () => ({ id: 1 }))
    await flushOutbox({ userId: 'u1', send })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('done runs are kept for a day, then pruned', async () => {
    await enqueueRun(rec('run-a', 1))
    const t0 = 1_000_000
    await flushOutbox({
      userId: 'u1',
      send: async () => ({ id: 1 }),
      now: () => t0,
    })
    expect(await getOutboxRun('run-a')).toBeTruthy()
    await flushOutbox({
      userId: 'u1',
      send: vi.fn(),
      now: () => t0 + DONE_KEEP_MS + 1,
    })
    expect(await getOutboxRun('run-a')).toBeUndefined()
  })
})
