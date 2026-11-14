export function formatName(fullName) {
  if (!fullName) return fullName
  return fullName
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Coin counters (HUD, Shop page, prices): same comma format as everything else.
export function formatCoins(n) {
  return formatNumber(n)
}

// The ONE number formatter for the whole app: en-US grouping with a plain
// comma ("5,000"), never the device locale. Locale grouping (fr/ru/ne...)
// inserts U+00A0 / U+202F, which the game font draws as a wide, odd gap,
// and a bare toLocaleString() follows the device. Canvas drawing (run
// export) uses this too, so every surface shows the same string.
const NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})
export function formatNumber(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return NUMBER_FORMAT.format(Math.round(v)).replace(/[\u00A0\u202F]/g, ',')
}
