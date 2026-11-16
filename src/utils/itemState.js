// The ONE place that decides whether a Shop item (hero, emote, colour...) is
// locked, owned or equipped. Every surface that shows ownership - the hero
// card, the hero modal, the emote showcase, Club War's picker, the button
// text and the "You don't own this item yet!" message - reads this, so they
// can never disagree.
//
// Why it exists: `/v1/store/owned` only lists items the player has a real
// UserStoreItem row for. Free/default items (Comet, Nova, an emote's
// "Classic"/idle) can be missing from it for older accounts, while
// "equipped" was derived separately (Comet is the fallback active hero), so
// a card could say "Equipped" for a hero the owned list had never heard of.
// Equipping it then hit the backend's NOT_OWNED error.
//
// Rules:
//  - equipped always implies owned;
//  - price 0 (the response has no isDefault flag, price 0 is how defaults
//    arrive) is owned for everyone, row or not;
//  - a virtual item (the idle emote slide, id null) is owned for everyone;
//  - an item with an `unlockLevel` the player hasn't reached yet (and no
//    row) is LEVEL_LOCKED - checked BEFORE the free-item rule, since Nova is
//    price 0 but gated by level. The backend grants it for free the moment
//    the level is reached (StoreServiceImpl.grantLevelUnlockedItems), so
//    once met it is just owned - no price, no purchase;
//  - otherwise owned only with a row in ownedItems; else locked.

export const ITEM_STATE = Object.freeze({
  LOCKED: 'locked',
  LEVEL_LOCKED: 'level-locked',
  OWNED: 'owned',
  EQUIPPED: 'equipped',
})

// Owned or equipped - what "can use it" means. Compare with this, never with
// `!== LOCKED`, which would also let LEVEL_LOCKED through.
export function isUsableState(state) {
  return state === ITEM_STATE.OWNED || state === ITEM_STATE.EQUIPPED
}

// True while the player's level (from their profile) is below the item's
// unlockLevel. Unknown level (profile not loaded) or no requirement = false.
export function isLevelLocked(item, level) {
  return item?.unlockLevel != null && level != null && level < item.unlockLevel
}

export function isFreeItem(item) {
  return (
    item != null &&
    item.priceFahhcoin != null &&
    Number(item.priceFahhcoin) <= 0
  )
}

export function findOwnedRow(item, ownedItems) {
  if (!item?.id) return null
  return (ownedItems || []).find((o) => o.storeItem?.id === item.id) || null
}

// `equipped` (optional boolean) overrides the row's own flag, for the cases
// where "equipped" is derived elsewhere (active hero id, idle emote).
// `level` (optional) is the player's current level, for unlockLevel gating.
export function getItemState(item, ownedItems, { equipped, level } = {}) {
  if (!item) return ITEM_STATE.LOCKED
  const row = findOwnedRow(item, ownedItems)
  const isEquipped = equipped ?? Boolean(row?.equipped)
  if (isEquipped) return ITEM_STATE.EQUIPPED
  if (row) return ITEM_STATE.OWNED
  if (isLevelLocked(item, level)) return ITEM_STATE.LEVEL_LOCKED
  if (isFreeItem(item) || item.id == null) return ITEM_STATE.OWNED
  return ITEM_STATE.LOCKED
}

// Owned by rule, but the backend has no row yet, so equip/lock-in must claim
// it first (a free purchase) or the server answers NOT_OWNED. Never while
// level-locked: the claim is a free purchase the backend doesn't level-check.
export function needsClaim(item, ownedItems, level) {
  return (
    Boolean(item?.id) &&
    isFreeItem(item) &&
    !findOwnedRow(item, ownedItems) &&
    !isLevelLocked(item, level)
  )
}

const NOT_OWNED_RE = /don.t own this item yet/i

// The backend's NOT_OWNED text may only be shown while the displayed item
// really is locked; on an owned/equipped one it is stale and misleading.
export function visibleStoreError(error, state) {
  if (!error) return null
  if (NOT_OWNED_RE.test(error) && state !== ITEM_STATE.LOCKED) return null
  return error
}
export function isNotOwnedError(error) {
  return Boolean(error) && NOT_OWNED_RE.test(error)
}
