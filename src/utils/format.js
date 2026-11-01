export function formatName(fullName) {
  if (!fullName) return fullName
  return fullName
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Clash-style digit grouping with spaces ("4 138 274") for coin counters -
// shared by the in-game HUD and the public Shop page so both read the same
// balance the same way.
export function formatCoins(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
