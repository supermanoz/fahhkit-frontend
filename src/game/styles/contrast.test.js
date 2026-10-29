import { describe, expect, it } from 'vitest'
import { contrastRatio, passesAA } from './contrast'

describe('contrastRatio', () => {
  it('is 21:1 for pure black on pure white (the maximum possible ratio)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('is 1:1 for identical colours', () => {
    expect(contrastRatio('#1b2a4e', '#1b2a4e')).toBeCloseTo(1, 5)
  })

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio('#ffffff', '#1b2a4e')
    const b = contrastRatio('#1b2a4e', '#ffffff')
    expect(a).toBeCloseTo(b, 10)
  })

  it('accepts 3-digit hex shorthand', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1)
  })
})

describe('passesAA', () => {
  it('requires 4.5:1 for normal text', () => {
    expect(passesAA(4.4, false)).toBe(false)
    expect(passesAA(4.5, false)).toBe(true)
  })

  it('drops to 3:1 for large text', () => {
    expect(passesAA(2.9, true)).toBe(false)
    expect(passesAA(3.0, true)).toBe(true)
  })

  // The real case this guards: a white button label on --green-500 fails
  // the 3:1 large-text threshold on fill colour alone - this is why every
  // GameButton label also carries a mandatory ink stroke (see components.css
  // and GameStyleGuidePage's contrast table).
  it('flags the green-500 button label as failing on fill colour alone', () => {
    const ratio = contrastRatio('#ffffff', '#62c21f')
    expect(passesAA(ratio, true)).toBe(false)
  })
})
