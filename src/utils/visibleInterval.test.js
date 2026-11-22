// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/app', () => ({
  App: { addListener: () => Promise.resolve({ remove() {} }) },
}))

let hidden = false
beforeEach(() => {
  vi.useFakeTimers()
  hidden = false
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
})
afterEach(() => vi.useRealTimers())

function setHidden(value) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('visibleInterval', () => {
  it('ticks while visible, skips while hidden, catches up once on return', async () => {
    const { visibleInterval } = await import('./visibleInterval')
    const fn = vi.fn()
    const stop = visibleInterval(fn, 1000, 'test')
    vi.advanceTimersByTime(3000)
    expect(fn).toHaveBeenCalledTimes(3)
    setHidden(true)
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(3)
    setHidden(false)
    expect(fn).toHaveBeenCalledTimes(4) // one catch-up, not five
    stop()
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(4)
  })
})
