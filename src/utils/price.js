import { formatCoins } from './format'

// The one place store prices are read and formatted, so a card, a modal, a
// confirm popup and a shelf tile can never show different numbers or
// different units. The backend is the source of truth: every price is the
// store item's own `priceFahhcoin` (StoreItemResponse) and the purchase call
// only sends the item id - the server charges that item's own price. Nothing
// here invents, rounds or falls back to another item's price.
//
// There is a single currency (Fahhcoin, shown with the .game-coin icon).

export function formatPrice(amount) {
  return formatCoins(Number(amount) || 0)
}

// A hero's `skins` is every active store item tied to the hero (the HERO
// unlock itself, plus its emotes and any other cosmetics). Only the HERO row
// is what "Unlock" buys, so that - and only that - is the hero's price.
// (The Shop card used to take the cheapest price across ALL of them, i.e.
// an emote's, and showed it as the hero's unlock price.)
export function getHeroUnlockItem(hero) {
  return (hero?.skins || []).find((item) => item.category === 'HERO') || null
}

export function getHeroUnlockPrice(hero) {
  const item = getHeroUnlockItem(hero)
  return item ? item.priceFahhcoin || 0 : null
}
