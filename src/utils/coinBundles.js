// The backend's bundle catalog (see getFahhcoinBundles in api/coinPurchase.js)
// only ever returns { fahhcoinAmount, priceNpr } - price and coin amount are
// decided server-side on purchase, so there's nothing client-side to get
// wrong there. The "+X% bonus" ribbon and Most Popular/Best Value badges are
// presentational only, derived straight from that same data so they can
// never drift from the real prices: every bundle's own coins-per-rupee rate
// compared against the smallest bundle's rate (the "sticker" rate, 0% bonus
// by definition).
export function withBundleExtras(bundles) {
  if (!bundles || bundles.length === 0) return []
  const sorted = [...bundles].sort(
    (a, b) => a.fahhcoinAmount - b.fahhcoinAmount
  )
  const baseRate = sorted[0].fahhcoinAmount / Number(sorted[0].priceNpr)
  const lastIndex = sorted.length - 1
  return sorted.map((bundle, index) => {
    const rate = bundle.fahhcoinAmount / Number(bundle.priceNpr)
    const bonusPercent = Math.round((rate / baseRate - 1) * 100)
    // Largest bundle is the best per-coin rate by construction (see the
    // backend's own FahhcoinBundleConstant comment) - Best Value. The one
    // below it is the usual mobile-game "sweet spot" pick - Most Popular.
    // Neither badge on a catalog of 1-2 bundles (nothing to compare).
    const badge =
      sorted.length < 2
        ? null
        : index === lastIndex
          ? 'BEST_VALUE'
          : index === lastIndex - 1
            ? 'POPULAR'
            : null
    return { ...bundle, bonusPercent, badge }
  })
}
