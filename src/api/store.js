import { getJson, postJson } from './client'

// Cosmetics store (see StoreController in the FahhKit backend). Categories
// are STICKER, AVATAR_BORDER, TERRITORY_SHADE, TRAIL_COLOR,
// PROFILE_BACKGROUND — there's no standalone "avatar character" category,
// these layer onto the athlete's real profile picture.

export function getStoreCatalog(pageNumber = 1, noOfRecords = 50) {
  return postJson('/v1/store/catalog/find', { pageNumber, noOfRecords })
}

export function purchaseStoreItem(storeItemId) {
  return postJson('/v1/store/purchase', { storeItemId })
}

export function equipStoreItem(id) {
  return postJson(`/v1/store/${id}/equip`)
}

export function unequipStoreItem(id) {
  return postJson(`/v1/store/${id}/unequip`)
}

export function getOwnedStoreItems() {
  return getJson('/v1/store/owned')
}

export function getEquippedStoreItems() {
  return getJson('/v1/store/equipped')
}
