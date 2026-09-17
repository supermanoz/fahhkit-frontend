import { getJson, postJson } from './client'

// Fahhcoin top-up (see CoinPurchaseController in the FahhKit backend). No
// GET-by-id endpoint exists server-side — the Khalti redirect back to
// /payment-status already carries the resolved `status` as a query param,
// so the frontend never needs to look a purchase up after the fact.

export function getFahhcoinBundles() {
  return getJson('/v1/coin-purchase/bundles')
}

export function initiateCoinPurchase(fahhcoinAmount) {
  return postJson('/v1/coin-purchase/initiate', { fahhcoinAmount })
}
