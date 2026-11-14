import { isCometHero, isPlaceholderHero } from './hero'
import { getHeroUnlockItem } from './price'
import { findOwnedRow } from './itemState'

// A clean account has no equipped-hero record on the backend: the app shows
// Comet as the default (GamePage's activeHeroId fallback) but the server has
// nothing, so equip / emote purchases for Comet fail with NOT_OWNED. Returns
// the default hero's HERO store item when that record is missing, else null.
export function findDefaultHeroToBootstrap(heroes, ownedItems) {
  const hasEquippedHero = (ownedItems || []).some(
    (o) =>
      o.equipped &&
      o.storeItem?.category === 'HERO' &&
      !isPlaceholderHero(o.storeItem.name)
  )
  if (hasEquippedHero) return null
  const comet = (heroes || []).find((h) => isCometHero(h.name))
  const item = getHeroUnlockItem(comet)
  if (!item) return null
  // Already owned and not equipped, still needs the equip; owned+equipped
  // can't reach here.
  return findOwnedRow(item, ownedItems) || !item.priceFahhcoin ? item : null
}
