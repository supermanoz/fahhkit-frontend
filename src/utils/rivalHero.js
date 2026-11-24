import { isPlaceholderHero } from './hero'

// A player's equipped hero out of their public territory profile
// (GET /v1/territory/profile/{userId} -> equippedCosmetics, the same data the
// profile panel shows). The placeholder "Default Hero" counts as none. Returns
// { name, id, assetUrl, color } or null.
export function rivalHeroFromProfile(profile) {
  const item = (profile?.equippedCosmetics || []).find(
    (c) =>
      c?.storeItem?.category === 'HERO' && !isPlaceholderHero(c.storeItem.name)
  )?.storeItem
  if (!item?.name) return null
  return {
    name: item.name,
    id: item.heroId || null,
    assetUrl: item.assetUrl || null,
    color: null,
  }
}
