import { describe, expect, it } from 'vitest'
import { withBundleExtras } from './coinBundles'

// Mirrors the real catalog shape (FahhcoinBundleConstant in the backend) -
// larger bundles get a progressively better per-coin rate.
const BUNDLES = [
  { fahhcoinAmount: 100, priceNpr: 150 },
  { fahhcoinAmount: 550, priceNpr: 750 },
  { fahhcoinAmount: 1200, priceNpr: 1500 },
  { fahhcoinAmount: 2500, priceNpr: 3000 },
  { fahhcoinAmount: 5200, priceNpr: 6000 },
  { fahhcoinAmount: 14500, priceNpr: 15000 },
]

describe('withBundleExtras', () => {
  it('gives the smallest bundle a 0% bonus', () => {
    const [smallest] = withBundleExtras(BUNDLES)
    expect(smallest.fahhcoinAmount).toBe(100)
    expect(smallest.bonusPercent).toBe(0)
  })

  it('gives every larger bundle a positive bonus', () => {
    const extras = withBundleExtras(BUNDLES)
    for (const bundle of extras.slice(1)) {
      expect(bundle.bonusPercent).toBeGreaterThan(0)
    }
  })

  it('badges the largest bundle Best Value and the next Popular', () => {
    const extras = withBundleExtras(BUNDLES)
    expect(extras[extras.length - 1].badge).toBe('BEST_VALUE')
    expect(extras[extras.length - 2].badge).toBe('POPULAR')
    for (const bundle of extras.slice(0, -2)) {
      expect(bundle.badge).toBeNull()
    }
  })

  it('sorts by amount regardless of input order', () => {
    const shuffled = [...BUNDLES].reverse()
    const extras = withBundleExtras(shuffled)
    expect(extras.map((b) => b.fahhcoinAmount)).toEqual(
      BUNDLES.map((b) => b.fahhcoinAmount)
    )
  })

  it('handles an empty or tiny catalog without badges', () => {
    expect(withBundleExtras([])).toEqual([])
    const [only] = withBundleExtras([BUNDLES[0]])
    expect(only.badge).toBeNull()
  })
})
