import { describe, expect, it } from 'vitest'
import {
  initialWelcomeState as init,
  welcomeReducer as r,
  holdsQueue,
  shouldAutoOpen,
  readAckCache,
  writeAckCache,
} from './welcomeBonusState'

const mem = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
}
const fresh = { amount: 50, granted: true, acknowledged: false }

describe('welcome bonus state', () => {
  it('first login: ready, then opens when unblocked', () => {
    const s = r(init, { type: 'CHECK_OK', status: fresh })
    expect(s.phase).toBe('ready')
    expect(shouldAutoOpen(s, { blocked: true })).toBe(false)
    expect(shouldAutoOpen(s, { blocked: false })).toBe(true)
    expect(r(s, { type: 'OPEN' }).open).toBe(true)
  })
  it('acknowledged / not granted / zero amount => nothing shown', () => {
    for (const st of [
      { ...fresh, acknowledged: true },
      { ...fresh, granted: false },
      { ...fresh, amount: 0 },
      null,
    ]) {
      const s = r(init, { type: 'CHECK_OK', status: st })
      expect(s.phase).toBe('done')
      expect(shouldAutoOpen(s, { blocked: false })).toBe(false)
    }
  })
  it('HTTP error = feature off; offline = retry later; neither holds the queue', () => {
    const a = r(init, { type: 'CHECK_FAIL', http: true })
    const b = r(init, { type: 'CHECK_FAIL', http: false })
    expect(a.phase).toBe('unavailable')
    expect(b.phase).toBe('error')
    expect(holdsQueue(a) || holdsQueue(b)).toBe(false)
  })
  it('holds the queue while checking, ready and open', () => {
    expect(holdsQueue(r(init, { type: 'CHECK_START' }))).toBe(true)
    expect(holdsQueue(r(init, { type: 'CHECK_OK', status: fresh }))).toBe(true)
  })
  it('ack failure keeps it open with the error; success finishes', () => {
    let s = r(r(init, { type: 'CHECK_OK', status: fresh }), { type: 'OPEN' })
    s = r(r(s, { type: 'ACK_START' }), { type: 'ACK_FAIL', message: 'x' })
    expect(s.open).toBe(true)
    expect(s.ack).toBe('failed')
    s = r(s, { type: 'ACKED' })
    expect(s.open).toBe(false)
    expect(s.phase).toBe('done')
  })
  it('ack cache is per account', () => {
    const st = mem()
    writeAckCache('a', st)
    expect(readAckCache('a', st)).toBe(true)
    expect(readAckCache('b', st)).toBe(false)
  })
})
