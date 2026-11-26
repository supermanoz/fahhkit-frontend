import { beforeEach, describe, expect, it } from 'vitest'
import { __setDbForTests, createMemoryDb } from './offlineDb'
import {
  DONE_KEEP_MS,
  RUN_STATUS,
  enqueueRun,
  getOutboxRun,
  listOutbox,
  pendingCount,
  pruneDone,
  removeOutboxRun,
  retryOutboxRun,
  subscribeOutbox,
  updateOutboxRun,
} from './runOutbox'

const rec = (id, createdAt, userId = 'u1') => ({
  clientRunId: id,
  userId,
  createdAt,
  payload: { clientRunId: id },
  summary: {},
})

beforeEach(() => __setDbForTests(createMemoryDb()))

describe('runOutbox', () => {
  it('enqueues as waiting and lists oldest first, per account', async () => {
    await enqueueRun(rec('b', 2000))
    await enqueueRun(rec('a', 1000))
    await enqueueRun(rec('x', 1500, 'other'))
    expect((await listOutbox('u1')).map((r) => r.clientRunId)).toEqual([
      'a',
      'b',
    ])
    expect((await listOutbox('other')).map((r) => r.clientRunId)).toEqual(['x'])
    expect((await getOutboxRun('a')).status).toBe(RUN_STATUS.WAITING)
  })
  it('enqueueing the same clientRunId twice keeps ONE record (no duplicate run)', async () => {
    await enqueueRun(rec('a', 1))
    await enqueueRun(rec('a', 1))
    expect(await listOutbox('u1')).toHaveLength(1)
  })
  it('update, retry and remove', async () => {
    await enqueueRun(rec('a', 1))
    await updateOutboxRun('a', {
      status: RUN_STATUS.FAILED,
      attempts: 3,
      error: { message: 'x' },
    })
    const failed = await getOutboxRun('a')
    expect(failed.status).toBe(RUN_STATUS.FAILED)
    await retryOutboxRun('a')
    const again = await getOutboxRun('a')
    expect(again).toMatchObject({
      status: RUN_STATUS.WAITING,
      attempts: 0,
      error: null,
    })
    await removeOutboxRun('a')
    expect(await getOutboxRun('a')).toBeUndefined()
    expect(await updateOutboxRun('gone', { status: 'x' })).toBeNull()
  })
  it('prunes done runs after a day, never waiting or failed ones', async () => {
    await enqueueRun(rec('done', 1))
    await updateOutboxRun('done', { status: RUN_STATUS.DONE, syncedAt: 1000 })
    await enqueueRun(rec('wait', 1))
    await enqueueRun(rec('fail', 1))
    await updateOutboxRun('fail', { status: RUN_STATUS.FAILED })
    await pruneDone(1000 + DONE_KEEP_MS - 1)
    expect(await listOutbox('u1')).toHaveLength(3)
    await pruneDone(1000 + DONE_KEEP_MS + 1)
    expect((await listOutbox('u1')).map((r) => r.clientRunId).sort()).toEqual([
      'fail',
      'wait',
    ])
  })
  it('notifies subscribers and counts what still needs sending', async () => {
    let calls = 0
    const off = subscribeOutbox(() => calls++)
    await enqueueRun(rec('a', 1))
    await enqueueRun(rec('b', 2))
    await updateOutboxRun('b', { status: RUN_STATUS.DONE })
    off()
    expect(calls).toBeGreaterThanOrEqual(3)
    expect(pendingCount(await listOutbox('u1'))).toBe(1)
  })
})
