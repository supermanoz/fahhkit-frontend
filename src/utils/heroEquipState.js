// Pure hero-equip derivation (see HeroGallery.jsx) - zero React/DOM
// imports, directly unit-testable, same philosophy as
// rolloutStatusState.js/gameAuthState.js/vehicleDetection.js.
//
// This is deliberately a function of (hero, ownedItems, activeHeroId) only,
// with no internal state of its own - whatever equips/unequips a hero does
// so against the server, then refetches ownedItems (see GamePage.jsx's
// loadStore/handleEquip). Reload, or any other fresh mount, re-derives the
// exact same equip/owned/tier result from that same server data, so there
// is nothing extra to persist or go stale here.
export function resolveHeroEquipState(hero, ownedItems, activeHeroId) {
  const equipped = hero.id === activeHeroId
  const owned = ownedItems.some((o) => o.storeItem.heroId === hero.id)
  // The owned HERO unlock itself, not just any owned skin/emote of his -
  // `owned` above is deliberately broader (a player who only owns a skin
  // still sees him as "in the roster", not locked). This is what actually
  // gets equipped, so it has to be the real StoreItem, found separately
  // rather than assumed from the broader `owned` flag - a hero can be
  // "owned" that way with nothing here to equip.
  const ownedHeroItem =
    ownedItems.find(
      (o) => o.storeItem.heroId === hero.id && o.storeItem.category === 'HERO'
    ) || null
  // 'soon' (no skin released yet) stays its own tier for the grayscale
  // look, and 'limited' (event/reward heroes) keeps its art in colour -
  // both just read "Limited" to the player, since "coming soon"
  // over-promised a release date.
  const comingSoon = !equipped && !owned && hero.skins?.length === 0
  const tier = equipped
    ? 'equipped'
    : owned
      ? 'owned'
      : comingSoon
        ? 'soon'
        : hero.limited
          ? 'limited'
          : 'locked'
  return { equipped, owned, ownedHeroItem, tier }
}
