import { resolveEmoteAsset, resolveEquippedEmoteItem } from './emotes'
import { DEFAULT_HERO_NAME } from './hero'
import { hasHero } from './heroManifest'

// What AthleteTerritoryProfilePanel.jsx actually renders in its hero/emote
// area, for either another player (driven by their fetched
// equippedCosmetics) or the logged-in player's own profile (driven by
// GamePage's own already-resolved Me-tab selectors instead - see the
// panel's own comment on why: getTerritoryProfileByUserId has no concept
// of a local, non-StoreItem avatar pick, which used to leave this blank
// for a player who hadn't equipped a real HERO item yet). Pulled out as
// its own pure function so the "never blank for your own profile" case can
// be unit-tested without standing up a DOM renderer (this project has no
// React Testing Library/jsdom set up - see athleteProfileHero.test.js).
export function resolveAthleteProfileHero({
  isSelf,
  selfHeroName,
  selfEmoteName,
  selfShowsTurntable,
  cosmeticsHero,
  cosmetics,
  // The Shop's own catalog (GamePage's storeCatalog) - see the heroId
  // backfill below. Harmless to omit (falls back to the old no-heroId
  // behaviour), but every real caller should pass it.
  storeCatalog,
}) {
  if (isSelf) {
    const heroName = selfHeroName || DEFAULT_HERO_NAME
    return {
      heroName,
      heroAssetUrl: null,
      showsTurntable: selfShowsTurntable,
      // Validated against real local art, not just "the backend says this
      // is equipped" - same gap the Me tab's own equippedEmoteItem &&
      // equippedEmoteAsset check guards against (a hidden/unmapped emote
      // still equipped server-side), now also covered here since this
      // panel's main stage plays the emote directly (see this panel's own
      // comment on EmoteGlyph vs HeroSprite).
      equippedEmoteName:
        selfEmoteName && resolveEmoteAsset(heroName, selfEmoteName)
          ? selfEmoteName
          : null,
    }
  }

  const heroName = cosmeticsHero?.storeItem.name || null
  // hasHero(), not a hardcoded Blaze/Comet/Bolt check - every hero now has
  // a real manifest (see heroManifest.js/HeroSprite.jsx, same fix
  // GamePage.jsx's own showHeroTurntable already got for the 2026-11-02
  // asset refresh that added Cyclone/Nova/Phantom/Pulse). The stale 3-hero
  // check here meant another player's Nova/Cyclone/Phantom/Pulse pick fell
  // through to a flat StoreItem.assetUrl image instead of the animated
  // hero-coloured stage every hero actually supports now.
  const showsTurntable = !cosmeticsHero || hasHero(heroName)
  // BACKEND GAP (read-only here, see this repo's own rule - filed instead
  // of patched): GET /v1/territory/profile/{userId} never sets
  // StoreItemResponse.heroId (TerritoryServiceImpl#toUserStoreItemResponse
  // - checked directly; the Store module's own equivalent mapper,
  // StoreServiceImpl, does set it correctly, so this is that one mapper's
  // gap, not a missing column). Worked around here instead: storeCatalog
  // (GamePage's own Shop catalog, fetched through that correctly-mapped
  // endpoint) is a global product list - a StoreItem's id maps to the same
  // heroId for every player - so a cosmetic missing its own heroId gets it
  // backfilled by looking its id up in storeCatalog.
  const catalogHeroId = new Map(
    (storeCatalog || []).map((item) => [item?.id, item?.heroId ?? null])
  )
  const effectiveHeroId = (item) =>
    item?.heroId ?? catalogHeroId.get(item?.id) ?? null

  const heroId = effectiveHeroId(cosmeticsHero?.storeItem)
  const equippedStoreItems = (cosmetics || []).map((c) => ({
    ...c.storeItem,
    heroId: effectiveHeroId(c.storeItem),
  }))
  // ignoreHidden: true - this profile is showing an ALREADY-equipped pick,
  // not a pick list, so a hidden-but-real emote (Comet's emote2/emote4,
  // see emotes.js) must still render for the viewer, same as it does on
  // the player's own Me tab now.
  let equippedItem = cosmeticsHero
    ? resolveEquippedEmoteItem(
        equippedStoreItems,
        heroId,
        cosmeticsHero.storeItem.name,
        {
          ignoreHidden: true,
        }
      )
    : null
  // Last-resort only: the catalog backfill above ALSO couldn't recover a
  // heroId (e.g. a delisted/limited item no longer in storeCatalog, or no
  // storeCatalog passed in at all) - fall back to "the one equipped EMOTE
  // cosmetic, whichever hero it's for". Safe in the common case (a player
  // has exactly one hero's emote equipped), only wrong if they also have a
  // stale equipped=true EMOTE row for a hero they've since switched away
  // from - a real but narrow edge case, and still strictly better than
  // showing nothing.
  if (!equippedItem && cosmeticsHero && heroId == null) {
    equippedItem =
      equippedStoreItems.find((item) => item?.category === 'EMOTE') || null
  }
  // Same asset-validation gap as the isSelf branch above.
  const resolvedAsset = equippedItem
    ? resolveEmoteAsset(heroName, equippedItem.name)
    : null
  const equippedEmoteName =
    equippedItem && resolvedAsset ? equippedItem.name : null

  // Dev-only step-by-step trace - stripped from production builds (Vite
  // replaces import.meta.env.DEV with a literal false there, so this whole
  // block dead-code-eliminates). The point: when "shows hero but not
  // emote" gets reported again, open devtools on the real failing profile
  // and this prints exactly which step produced null, instead of needing
  // to re-derive it from the network tab's raw JSON by hand.
  if (import.meta.env.DEV) {
    console.debug('[athleteProfileHero] other-player resolve', {
      heroName,
      rawHeroId: cosmeticsHero?.storeItem.heroId ?? null,
      effectiveHeroId: heroId,
      cosmetics: (cosmetics || []).map((c) => ({
        name: c.storeItem?.name,
        category: c.storeItem?.category,
        rawHeroId: c.storeItem?.heroId ?? null,
        catalogHeroId: catalogHeroId.get(c.storeItem?.id) ?? null,
      })),
      equippedItemAfterHeroIdMatch: cosmeticsHero
        ? (resolveEquippedEmoteItem(
            equippedStoreItems,
            heroId,
            cosmeticsHero.storeItem.name,
            { ignoreHidden: true }
          )?.name ?? null)
        : null,
      equippedItemFinal: equippedItem?.name ?? null,
      resolvedAsset: Boolean(resolvedAsset),
      equippedEmoteName,
    })
  }

  return {
    heroName,
    heroAssetUrl: cosmeticsHero?.storeItem.assetUrl || null,
    showsTurntable,
    equippedEmoteName,
  }
}
