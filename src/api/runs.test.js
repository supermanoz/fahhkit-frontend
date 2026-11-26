// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const postJson = vi.hoisted(() => vi.fn(async () => ({ id: 'r1' })))
vi.mock('./client', () => ({
  postJson,
  getJson: vi.fn(),
  deleteJson: vi.fn(),
}))
import { createRun } from './runs'

beforeEach(() => postJson.mockClear())

describe('createRun', () => {
  it('stamps clientSentAtEpochMs on every attempt, keeping the same clientRunId', async () => {
    vi.useFakeTimers()
    const data = { clientRunId: 'run-1', distance: 1 }
    vi.setSystemTime(1_000)
    await createRun(data)
    vi.setSystemTime(9_000)
    await createRun(data)
    const [a, b] = postJson.mock.calls.map((c) => c[1])
    expect(a.clientSentAtEpochMs).toBe(1_000)
    expect(b.clientSentAtEpochMs).toBe(9_000)
    expect(a.clientRunId).toBe(b.clientRunId)
    // The stored (outbox) payload is not mutated.
    expect(data).not.toHaveProperty('clientSentAtEpochMs')
    vi.useRealTimers()
  })
})
