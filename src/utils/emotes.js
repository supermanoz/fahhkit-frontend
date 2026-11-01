import { getHero, hasHero } from './heroManifest'

// Emote names every real hero is expected to have - used only to decide
// whether an UNKNOWN hero's request should fall back to Blaze's. A
// genuinely hero-specific emote further down a hero's numbering (which
// varies hero to hero - see each manifest.json's "emotes", built by
// scripts/build_<hero>_stretch_strips.py) has no such universal
// expectation, so it stays null instead of silently showing Blaze's under
// the wrong name - see resolveEmoteAsset below. "emote1" is a pose alias
// onto idle (every hero has one, same mechanism "classic" used to be);
// "emote2" is its own dedicated file (a dance/hip-hop-style pose, the one
// other animation every hero's asset drop also happens to include).
const ALIAS_EMOTE_NAMES = new Set(['emote1', 'emote2'])

// Central emote registry - the ONLY place in the app that turns an EMOTE
// StoreItem into a picture. StoreItem.assetUrl is never populated for
// category EMOTE (see the backend's own StoreItem.java field comment -
// EMOTE isn't in its "populated for" list, and migration V1_64 seeds every
// hero's free "Classic" emote with asset_url explicitly null), so there is
// no server-provided image to resolve - every screen that shows emote art
// (the hero showcase's emote slider - HeroDetailModal.jsx's HeroEmoteStage
// - the buy/preview confirm card, and anywhere else one shows up later -
// PvP, run view, ...) must go through resolveEmoteAsset below instead of
// reading item.assetUrl itself, or it will always get a locked/blank card.
//
// Backed by each hero's own manifest.json (see heroManifest.js and
// src/assets/heroes/<hero>/) - keyed by hero name, then by the backend
// StoreItem.name, both lowercased and trimmed. A new hero's emotes need
// only a matching "emotes" entry in its manifest.json plus the art itself
// (built via scripts/build_<hero>_stretch_strips.py, which numbers every
// hero's emotes densely as "emote1", "emote2", ... - idle is always
// emote1 - since the artist's own animation-folder names/typos have no
// shared vocabulary across heroes to key a descriptive name by), nothing
// else in the app.
//
// An entry here only lights up in the Shop once a matching EMOTE StoreItem
// row exists with that exact name (case-insensitive) and the right heroId -
// see src/components/EmoteAdminPanel.jsx (GameMechanicsPage.jsx's "Emotes"
// admin tool), which creates those rows against the backend's existing
// POST /v1/store/admin/items.

// Returns {src, frames, frameWidth, frameHeight} for a given hero name +
// backend StoreItem.name, or null if no manifest has art for it (the
// caller shows its own placeholder - see EmoteGlyph.jsx). Deliberately NOT
// coerced through getHero's Blaze fallback for hero-specific art (a
// hero-specific emote isn't appropriate to show under an unrelated hero's
// name) - "emote1"/"emote2" still resolve through it (ALIAS_EMOTE_NAMES
// above), since every real hero is expected to have both.
export function resolveEmoteAsset(heroName, emoteName) {
  const heroKey = (heroName || '').trim().toLowerCase()
  const emoteKey = (emoteName || '').trim().toLowerCase()
  if (!heroKey || !emoteKey) return null

  if (hasHero(heroKey)) return getHero(heroKey).emotes[emoteKey] || null
  if (!ALIAS_EMOTE_NAMES.has(emoteKey)) return null
  return getHero(heroKey).emotes[emoteKey] || null
}

function titleCase(key) {
  return key.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Every emote name this registry has art for, for a given hero (Title
// Case, e.g. "Jumping Jack") - EmoteAdminPanel.jsx uses this to suggest
// names when creating a StoreItem row, so the name typed in matches this
// registry's keys exactly instead of silently landing on no art.
export function knownEmoteNames(heroName) {
  const heroKey = (heroName || '').trim().toLowerCase()
  const names = hasHero(heroKey)
    ? Object.keys(getHero(heroKey).emotes)
    : ALIAS_EMOTE_NAMES
  return [...names].map(titleCase)
}

// The ONE place that decides "which emote (if any) is equipped for this
// hero" - shared by every screen that needs it (HeroDetailModal.jsx's
// HeroEmoteStage, the Me tab, AthleteTerritoryProfilePanel.jsx) instead of
// each re-deriving its own .find(), so there's exactly one definition of
// "equipped" to keep correct. Takes a plain array of StoreItems already
// known to be equipped, not a general owned-items list, because the
// player's own data (ownedItems, every owned item with its own `equipped`
// boolean) and another player's (profile.equippedCosmetics, pre-filtered
// to equipped-only server-side) are shaped differently - each caller
// normalizes its own shape into this flat list first (map to `.storeItem`,
// filtering by `.equipped` first if that flag exists on its shape).
export function resolveEquippedEmoteItem(equippedStoreItems, heroId) {
  if (!heroId) return null
  return (
    (equippedStoreItems || []).find(
      (item) => item?.category === 'EMOTE' && item?.heroId === heroId
    ) || null
  )
}

// Scans a catalog of EMOTE StoreItemResponse rows against this registry and
// console.warns once with every (hero, emote name, id) this registry has no
// art for - call it wherever the catalog is loaded (see GamePage.jsx) so a
// gap is loud in dev tools instead of silently showing a placeholder
// forever, unnoticed, in production.
export function warnMissingEmoteAssets(emoteItems, heroes) {
  const missing = (emoteItems || [])
    .map((item) => ({
      item,
      heroName: heroes?.find((h) => h.id === item.heroId)?.name,
    }))
    .filter(({ heroName }) => heroName)
    .filter(({ item, heroName }) => !resolveEmoteAsset(heroName, item.name))
  if (missing.length === 0) return
  console.warn(
    '[emotes] no local asset mapped for:',
    missing.map(({ item, heroName }) => `${heroName}/${item.name} (${item.id})`)
  )
}
