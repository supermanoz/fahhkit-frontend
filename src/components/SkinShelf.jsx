/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import HeroItemShelf from './HeroItemShelf'

// Shop section for Skins (StoreItem category SKIN) - see HeroItemShelf.jsx
// for the shared hero-picker/card-grid shell this and EmoteShelf.jsx both
// wrap.
//
// Same backend-content gap as Emotes, one step further: the SKIN category
// is fully wired server-side (same assetUrl/heroId/priceFahhcoin fields,
// same per-hero equip scoping - confirmed by reading StoreServiceImpl),
// but NO SKIN rows exist in any migration at all - not even a free
// placeholder like Emotes' "Classic". So this always renders the
// "no skins in stock" empty state until real rows are added; there's
// nothing for the frontend to pre-build here the way Emotes' art was,
// since a skin is presumably a reworked version of a hero's own art
// (costume/color) rather than a new animation this repo's asset footage
// already contains.
//
// Equipping a skin DOES take effect wherever the hero shows as a flat
// image (GamePage.jsx's avatarSrc now checks for an equipped SKIN before
// falling back to the hero's own HERO-category art - see equippedSkin
// there). It can NOT currently change Blaze/Comet's animated run-view
// sprite or Me-tab turntable (TerritoryMap.jsx's HERO_MAP_SHEETS /
// HeroSprite.jsx's heroSprites.js are both keyed by hero name only, with
// no skin dimension) - doing that needs real alternate sprite sheets per
// skin, which don't exist, rather than a frontend wiring change.
export default function SkinShelf({
  skins,
  heroes,
  ownedItems,
  loading,
  onBuy,
  onEquip,
}) {
  return (
    <HeroItemShelf
      items={skins}
      heroes={heroes}
      ownedItems={ownedItems}
      loading={loading}
      onBuy={onBuy}
      onEquip={onEquip}
      title="Skins"
      subtitle="New looks for your hero."
      infoText="Every hero has their own skins - own the hero first to unlock theirs. An equipped skin shows up anywhere that hero does."
      nounSingular="skin"
      nounPlural="skins"
      emptyText="No skins in stock yet - check back soon!"
    />
  )
}
