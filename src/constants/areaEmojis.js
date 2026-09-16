// Local-only (localStorage), not synced to the backend — same reasoning as
// constants/avatars.js: there's no backend concept for this at all (no
// StoreItemCategoryConstant value for it), so it's a pure client-side
// preference. Shown next to a player's territory area wherever it's
// displayed (My Territories rows, the profile panel).
export const AREA_EMOJIS = [
  { id: 'flag', emoji: '🚩', label: 'Flag' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'map', emoji: '🗺️', label: 'Map' },
  { id: 'gem', emoji: '💎', label: 'Gem' },
  { id: 'star', emoji: '⭐', label: 'Star' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'shield', emoji: '🛡️', label: 'Shield' },
  { id: 'mountain', emoji: '⛰️', label: 'Mountain' },
]

const STORAGE_KEY = 'fahhkit_territory_area_emoji_id'

export function getAreaEmojiById(id) {
  return AREA_EMOJIS.find((e) => e.id === id) || null
}

export function loadAreaEmojiId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveAreaEmojiId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage full/unavailable — the choice just won't persist past reload.
  }
}
