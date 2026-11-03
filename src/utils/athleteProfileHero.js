import {
  isHiddenEmote,
  resolveEmoteAsset,
  resolveEquippedEmoteItem,
} from './emotes'
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
  const equippedStoreItems = (cosmetics || []).map((c) => c.storeItem)
  let equippedItem = cosmeticsHero
    ? resolveEquippedEmoteItem(
        equippedStoreItems,
        cosmeticsHero.storeItem.heroId,
        cosmeticsHero.storeItem.name
      )
    : null
  // BACKEND GAP (read-only here, see this repo's own rule - filed instead
  // of patched): GET /v1/territory/profile/{userId} never sets
  // StoreItemResponse.heroId (TerritoryServiceImpl#toUserStoreItemResponse
  // - checked directly; the Store module's own equivalent mapper,
  // StoreServiceImpl, does set it correctly, so this is that one mapper's
  // gap, not a missing column). resolveEquippedEmoteItem hard-requires a
  // heroId match and returns null without one, which otherwise means NO
  // other player's profile ever shows an equipped emote, regardless of
  // whether one's actually equipped. Until that's fixed server-side, fall
  // back to "the one equipped EMOTE cosmetic, whichever hero it's for" -
  // safe in the common case (a player has exactly one hero equipped), only
  // wrong if the backend left a stale equipped=true EMOTE row from a
  // hero they've since switched away from without the equip flow clearing
  // it - a real but narrow edge case, and still strictly better than the
  // current "never shows anything" behaviour.
  if (
    !equippedItem &&
    cosmeticsHero &&
    cosmeticsHero.storeItem.heroId == null
  ) {
    equippedItem =
      equippedStoreItems.find(
        (item) =>
          item?.category === 'EMOTE' &&
          !isHiddenEmote(cosmeticsHero.storeItem.name, item?.name)
      ) || null
  }
  // Same asset-validation gap as the isSelf branch above.
  const equippedEmoteName =
    equippedItem && resolveEmoteAsset(heroName, equippedItem.name)
      ? equippedItem.name
      : null

  return {
    heroName,
    heroAssetUrl: cosmeticsHero?.storeItem.assetUrl || null,
    showsTurntable,
    equippedEmoteName,
  }
}
