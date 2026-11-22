// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const open = vi.fn()
vi.mock('@capacitor/browser', () => ({ Browser: { open: (a) => open(a) } }))
let native = false
vi.mock('./geo', () => ({
  get isNative() {
    return native
  },
  platform: 'web',
}))

const { openExternal, openTel } = await import('./externalLink')

describe('openExternal', () => {
  beforeEach(() => {
    open.mockReset()
    open.mockResolvedValue()
    vi.stubGlobal('open', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('web: new tab with noopener, default navigation suppressed', async () => {
    native = false
    const event = { preventDefault: vi.fn() }
    await openExternal('https://example.com/a', event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/a',
      '_blank',
      'noopener'
    )
    expect(open).not.toHaveBeenCalled()
  })

  it('native: Browser.open', async () => {
    native = true
    await openExternal('https://example.com/a')
    expect(open).toHaveBeenCalledWith({ url: 'https://example.com/a' })
  })

  it('never opens unsafe schemes', async () => {
    for (const native_ of [false, true]) {
      native = native_
      await openExternal('javascript:alert(1)')
      await openExternal('https://user:pw@example.com/')
    }
    expect(open).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
  })

  it('native: a failed Browser.open does not leave the tap dead or throw', async () => {
    native = true
    open.mockRejectedValue(new Error('Unable to display URL'))
    await expect(openExternal('https://example.com/a')).resolves.toBeUndefined()
  })

  it('openTel strips formatting on native', () => {
    native = true
    expect(() => openTel('+977 984-1', { preventDefault() {} })).not.toThrow()
  })
})
