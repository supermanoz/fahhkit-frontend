// Blaze is the one hero with an animated run-cycle sprite sheet (see
// components/HeroSprite.jsx) instead of a flat image - this just names the
// match so both the profile panel and any future hero picker agree on it.
export function isBlazeHero(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'blaze'
}

export function isCometHero(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'comet'
}

export function isBoltHero(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'bolt'
}

// A StoreItem id for a HERO-category item (e.g. Club War's
// lockedHeroStoreItemId/heroStoreItemId) might be in the full shop catalog
// or only in what this player owns (an unlocked limited hero that's since
// been pulled from the catalog, say) - checks both, same lookup
// ClubWarPanel.jsx's roster and ClubWarHistory.jsx's past-war breakdown
// both need. Returns { name, assetUrl } - assetUrl is null (not a broken
// image) if nothing matches or the item has no art.
export function resolveHeroAsset(storeItemId, storeCatalog, ownedItems) {
  if (!storeItemId) return { name: null, assetUrl: null }
  const item =
    storeCatalog?.find((i) => i.id === storeItemId) ||
    ownedItems?.find((o) => o.storeItem.id === storeItemId)?.storeItem
  return {
    name: item?.name || null,
    assetUrl: item?.assetUrl || null,
  }
}

// The backend seeds a generic "Default Hero" store item that every account
// owns and has equipped from signup. TEMP: until the backend gives everyone
// Comet instead, the frontend treats that placeholder as "no hero picked",
// which falls through to Comet (the default hero for now), and hides it
// from the Heroes tab.
export const DEFAULT_HERO_NAME = 'Comet'
export function isPlaceholderHero(name) {
  return (
    typeof name === 'string' && name.trim().toLowerCase() === 'default hero'
  )
}

// resolveHeroAsset, but never null and never the literal placeholder name -
// for anywhere a hero pick is optional and still needs *something* sane to
// show (Club War's member rows: a row with no hero locked in yet, or one
// locked into this placeholder item itself, both read the same way). Checked
// directly against the backend: V1_39__hero_comet_nova_setup.sql renamed the
// underlying `hero` row from "Default Hero" to "Comet", but never touched
// the matching `store_item` row's own name column - so a StoreItem lookup by
// id can still come back literally named "Default Hero" even though it's
// Comet's own hero-unlock item in every other respect (same asset, same
// hero_id). Falls back to whichever StoreItem in storeCatalog/ownedItems IS
// that placeholder row, rather than hard-coding Comet's id (which isn't
// stable - it's a generated uuid, not seeded with a fixed value).
export function resolveHeroAssetOrDefault(
  storeItemId,
  storeCatalog,
  ownedItems
) {
  const picked = resolveHeroAsset(storeItemId, storeCatalog, ownedItems)
  // Name alone is enough to trust the pick - most heroes' StoreItem rows
  // have no assetUrl (see V1_39/V1_45 seeds), so gating on assetUrl here
  // used to reject every real pick except Comet's and silently show Comet
  // for everyone. assetUrl is only ever used for art, never to decide
  // whether the name is real.
  if (picked.name && !isPlaceholderHero(picked.name)) {
    return picked
  }
  const defaultItem =
    storeCatalog?.find(
      (i) => i.category === 'HERO' && isPlaceholderHero(i.name)
    ) ||
    ownedItems?.find(
      (o) =>
        o.storeItem.category === 'HERO' && isPlaceholderHero(o.storeItem.name)
    )?.storeItem
  return { name: DEFAULT_HERO_NAME, assetUrl: defaultItem?.assetUrl || null }
}

// ScoreComponentTypeConstant → what the boost actually does, in player
// terms. RACE_TIME is the one where lower is better (a 0.95 multiplier
// shaves 5% off your PvP race time), so it reads as a minus. Exported too -
// the Game Mechanics hero admin panel uses the same labels for its "attach
// an ability" picker instead of showing the raw enum names.
export const ABILITY_LABELS = {
  AREA: 'territory area score',
  PERIMETER_EFFICIENCY: 'perimeter efficiency score',
  PACE: 'pace score',
  CLOSURE_PRECISION: 'loop closure score',
  BASE_EFFORT: 'base effort score',
  RACE_TIME: 'race time',
}

export const SCORE_COMPONENT_TYPES = Object.keys(ABILITY_LABELS)

// The pieces of describeHeroAbility, for UIs that lay them out separately
// (e.g. the stat bars in HeroDetailModal).
export function heroAbilityParts(ability) {
  if (!ability || ability.multiplier == null) return null
  return {
    pct: Math.round(Math.abs(ability.multiplier - 1) * 100),
    sign: ability.multiplier >= 1 ? '+' : '−',
    label:
      ABILITY_LABELS[ability.componentType] ||
      String(ability.componentType || '')
        .toLowerCase()
        .replace(/_/g, ' '),
  }
}

export function describeHeroAbility(ability) {
  const parts = heroAbilityParts(ability)
  return parts ? `${parts.sign}${parts.pct}% ${parts.label}` : ''
}
