import { getJson, postJson } from './client'

// Cosmetics store (see StoreController in the FahhKit backend). Categories
// are HERO, AVATAR_BORDER, TERRITORY_SHADE, TRAIL_COLOR, PROFILE_BACKGROUND,
// TERRITORY_EMOJI, PHRASE — HERO is the real, server-synced avatar
// character (an assetUrl image); the rest layer onto the athlete's real
// profile picture instead of standing in for one.

export function getStoreCatalog(pageNumber = 1, noOfRecords = 200) {
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

// Hero roster (see HeroController in the FahhKit backend) - each hero has
// up to two small score abilities, and HERO-category store items point back
// at their hero through heroId.
export function findHeroes(pageNumber = 1, noOfRecords = 50, searchText = '') {
  return postJson('/v1/store/heroes/find', {
    pageNumber,
    noOfRecords,
    search: searchText ? [{ field: 'name', value: searchText }] : undefined,
  })
}

export function getHero(id) {
  return getJson(`/v1/store/heroes/${id}`)
}

// Admin/moderator only - create/edit a hero's codex entry (name, tagline,
// backstory, portrait, limited flag). There's no delete; `active: false` on
// update is the only way to retire one, but browseHeroes (the endpoint
// behind findHeroes above, shared with the player-facing Shop) only ever
// returns active heroes - deactivating one here would make it unreachable
// through this same list again, so the admin UI deliberately never sends
// that flag.
export function createHero(hero) {
  return postJson('/v1/store/admin/heroes', hero)
}

export function updateHero(heroId, hero) {
  return postJson('/v1/store/admin/heroes/update', { heroId, ...hero })
}

// Attach-only - no update or delete endpoint for an existing ability, and
// the server rejects a second ability on the same componentType (max 2 per
// hero, multiplier clamped to 0.90-1.10 - see HeroAbilityProperties).
export function attachHeroAbility(heroId, componentType, multiplier) {
  return postJson(`/v1/store/admin/heroes/${heroId}/abilities`, {
    componentType,
    multiplier,
  })
}

// Admin/moderator only - create a new catalog row for any category (see
// EmoteAdminPanel.jsx, which uses this for EMOTE). HERO, SKIN and EMOTE all
// require heroId; every other category rejects one. No update or delete
// endpoint exists for a plain item the way there is for a hero - a mistake
// here is permanent, so the admin UI confirms before calling this.
export function createStoreItem(item) {
  return postJson('/v1/store/admin/items', item)
}

// Free (price 0) items are owned by rule even with no UserStoreItem row, but
// the backend's equip / club-war lock-in need a row. Claiming = a free
// purchase; "already owned" just means the row exists, which is the goal.
export async function claimFreeItem(storeItemId) {
  try {
    await purchaseStoreItem(storeItemId)
  } catch (err) {
    if (!/already own/i.test(err?.message || '')) throw err
  }
}
