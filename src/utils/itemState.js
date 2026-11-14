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
//  - otherwise owned only with a row in ownedItems; else locked.

export const ITEM_STATE = Object.freeze({
  LOCKED: 'locked',
  OWNED: 'owned',
  EQUIPPED: 'equipped',
})

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
export function getItemState(item, ownedItems, { equipped } = {}) {
  if (!item) return ITEM_STATE.LOCKED
  const row = findOwnedRow(item, ownedItems)
  const isEquipped = equipped ?? Boolean(row?.equipped)
  if (isEquipped) return ITEM_STATE.EQUIPPED
  if (row || isFreeItem(item) || item.id == null) return ITEM_STATE.OWNED
  return ITEM_STATE.LOCKED
}

// Owned by rule, but the backend has no row yet, so equip/lock-in must claim
// it first (a free purchase) or the server answers NOT_OWNED.
export function needsClaim(item, ownedItems) {
  return (
    Boolean(item?.id) && isFreeItem(item) && !findOwnedRow(item, ownedItems)
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
