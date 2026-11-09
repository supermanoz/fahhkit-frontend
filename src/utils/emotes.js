import { getHero, hasHero } from './heroManifest'

// Emotes pulled from view everywhere in /game (Shop's hero emote slider,
// the emote popup, the Me tab, any other list) without touching the
// backend row or deleting the built asset - see isHiddenEmote/
// filterVisibleEmotes below for where this actually takes effect. Keyed by
// hero name, values are manifest emote keys (see heroManifest.js /
// scripts/build_<hero>_stretch_strips.py) - both sides matched through
// normalizeEmoteKey so "Emote 5"/"emote_5"/"emote5" all hit the same entry
// regardless of which spacing a given backend StoreItem.name row uses.
const HIDDEN_EMOTES = {
  nova: ['emote5'],
  comet: ['emote2', 'emote4'],
  blaze: ['emote4'],
  phantom: ['emote4'],
  bolt: ['emote3'],
  cyclone: ['emote6'],
  pulse: ['emote6'],
}

function normalizeEmoteKey(value) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

// A few emotes have a real backend StoreItem.name instead of the numbered
// "emoteN" convention almost every row actually uses (confirmed directly
// against real captured profile data: every hero's catalog is "Classic"
// (seeded, price 0) plus plain lowercase "emote2".."emote10/11" - NOT
// "Emote 5"-style display names). "classic" is the one confirmed, load-
// bearing exception - the backend's own fixed name for every hero's free
// default (see resolveEmoteAsset's own comment below) - every manifest's
// "emote1" slot under a different, non-numbered name.
//
// CORRECTION: an earlier session guessed Comet's slot 2 was named "Hip
// Hop" and added a 'hiphop' entry here - real captured data shows every
// slot is plainly "emoteN", so that guess was wrong and has been removed.
// Comet DOES have one other real exception, a StoreItem literally named
// "Jumping Jack" with no corresponding manifest key - but which numbered
// slot it should alias onto isn't known yet (ask before guessing again);
// until an entry's added for it, it correctly falls back to idle, same as
// any other name with no local art (see resolveEmoteAsset).
const EMOTE_NAME_ALIASES = {
  classic: 'emote1',
}

// The one normalized, alias-resolved key every lookup below should match
// against - normalizeEmoteKey alone handles any stray spacing/casing a
// StoreItem.name might carry; EMOTE_NAME_ALIASES on top of that handles a
// real-word display name ("Classic") standing in for a numbered slot.
function canonicalEmoteKey(value) {
  const key = normalizeEmoteKey(value)
  return EMOTE_NAME_ALIASES[key] || key
}

// True if this hero+emote (matched case/space/underscore/hyphen-
// insensitively, and through EMOTE_NAME_ALIASES) is on the HIDDEN_EMOTES
// list above.
export function isHiddenEmote(heroName, emoteName) {
  const heroKey = normalizeEmoteKey(heroName)
  const emoteKey = canonicalEmoteKey(emoteName)
  if (!heroKey || !emoteKey) return false
  return Boolean(HIDDEN_EMOTES[heroKey]?.includes(emoteKey))
}

// The one place every screen that lists a hero's emotes (right now just
// HeroDetailModal.jsx's HeroEmoteStage slider) should filter through, so a
// hidden emote never gets a slide/dot/count of its own instead of showing
// up dimmed or locked.
export function filterVisibleEmotes(heroName, items) {
  return (items || []).filter((item) => !isHiddenEmote(heroName, item?.name))
}

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

// "Classic" is the backend's own literal name for every hero's free
// default emote - checked directly against
// db/migration/V1_64__hero_skin_emote_store_items.sql (every hero gets a
// StoreItem row named exactly 'Classic', price 0, auto-equipped for every
// existing owner at migration time) and HeroItemOwnershipSupport.java
// (grants the same row, still equipped, every time a player unlocks a new
// hero today - this is live, not legacy). No manifest.json has a "classic"
// key (checked all 7) - it's always meant as this hero's idle-alias slot,
// the same role "emote1" plays everywhere else in this registry, just
// under the backend's own fixed name instead of the numbered scheme
// scripts/build_<hero>_stretch_strips.py uses for every OTHER emote.
// Without this (EMOTE_NAME_ALIASES, above), "Classic" resolves to nothing:
// this was the actual cause of another player's profile showing their
// hero but never their equipped emote (see athleteProfileHero.js) -
// "Classic" is what a player keeps equipped until they buy something
// else, so for a large share of real accounts this was never a locally-
// missing-art edge case, it was every untouched hero.
//
// Returns {src, frames, frameWidth, frameHeight} for a given hero name +
// backend StoreItem.name, or null if no manifest has art for it (the
// caller shows its own placeholder - see EmoteGlyph.jsx). Deliberately NOT
// coerced through getHero's Blaze fallback for hero-specific art (a
// hero-specific emote isn't appropriate to show under an unrelated hero's
// name) - "emote1"/"emote2" still resolve through it (ALIAS_EMOTE_NAMES
// above), since every real hero is expected to have both.
export function resolveEmoteAsset(heroName, emoteName) {
  const heroKey = (heroName || '').trim().toLowerCase()
  const emoteKey = canonicalEmoteKey(emoteName)
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
//
// heroName is optional but should be passed whenever the caller has it -
// it's only used for the HIDDEN_EMOTES check below, which callers that
// list/pick from a hero's emotes (HeroDetailModal's HeroEmoteStage, the
// Shop's EmoteShowcase equip-state) want: a hidden emote that's still
// equipped server-side resolves to "nothing equipped" there, since the
// slide/card for it was never shown in the first place.
//
// Pass { ignoreHidden: true } instead wherever an ALREADY-equipped emote
// is being displayed rather than offered for selection - the Me tab and
// both branches of athleteProfileHero.js's other-player resolve. Comet's
// emote2/emote4 are hidden from the shop but have real, working local art
// (see heroes/comet/manifest.json) - without ignoreHidden, a player who
// has one equipped would see it vanish from their own profile and everyone
// else's, falling back to idle, even though nothing is actually missing.
export function resolveEquippedEmoteItem(
  equippedStoreItems,
  heroId,
  heroName,
  { ignoreHidden = false } = {}
) {
  if (!heroId) return null
  const candidates = (equippedStoreItems || []).filter(
    (item) =>
      item?.category === 'EMOTE' &&
      item?.heroId === heroId &&
      (ignoreHidden || !isHiddenEmote(heroName, item?.name))
  )
  if (candidates.length <= 1) return candidates[0] || null
  // Equipping one emote unequips any other for that hero server-side (see
  // StoreServiceImpl#equip) - this shouldn't be more than one candidate in
  // practice - but if it ever is, never let a stray Classic/idle-alias row
  // mask a genuine pick: prefer whichever candidate is both a real,
  // resolvable emote and NOT the idle alias.
  return (
    candidates.find(
      (item) =>
        canonicalEmoteKey(item?.name) !== 'emote1' &&
        resolveEmoteAsset(heroName, item?.name)
    ) || candidates[0]
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
    // Hidden emotes are deliberately kept out of every list - they're not
    // a "missing asset" gap worth warning about, even if one happens to
    // have no local art either.
    .filter(({ item, heroName }) => !isHiddenEmote(heroName, item.name))
    .filter(({ item, heroName }) => !resolveEmoteAsset(heroName, item.name))
  if (missing.length === 0) return
  console.warn(
    '[emotes] no local asset mapped for:',
    missing.map(({ item, heroName }) => `${heroName}/${item.name} (${item.id})`)
  )
}
