import { describe, expect, it } from 'vitest'
import { STORE_ACTIVE, STORE_OUTBOX, createMemoryDb } from './offlineDb'

describe('memory db (the fallback every caller can rely on)', () => {
  it('stores copies, not references', async () => {
    const db = createMemoryDb()
    const value = { a: { n: 1 } }
    await db.put(STORE_OUTBOX, 'k', value)
    value.a.n = 2
    expect((await db.get(STORE_OUTBOX, 'k')).a.n).toBe(1)
    const got = await db.get(STORE_OUTBOX, 'k')
    got.a.n = 9
    expect((await db.get(STORE_OUTBOX, 'k')).a.n).toBe(1)
  })
  it('keeps the two stores apart and supports delete / all', async () => {
    const db = createMemoryDb()
    await db.put(STORE_ACTIVE, 'current', { x: 1 })
    await db.put(STORE_OUTBOX, 'current', { y: 2 })
    expect(await db.get(STORE_ACTIVE, 'current')).toEqual({ x: 1 })
    expect(await db.all(STORE_OUTBOX)).toEqual([{ y: 2 }])
    await db.del(STORE_ACTIVE, 'current')
    expect(await db.get(STORE_ACTIVE, 'current')).toBeUndefined()
  })
})
