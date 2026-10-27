/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { memo } from 'react'
import HeroItemShelf from './HeroItemShelf'
import EmoteGlyph from './EmoteGlyph'
import EmoteSelectScreen from './EmoteSelectScreen'
import { resolveFileUrl } from '../api/client'
import { hasHeroSprite } from '../utils/heroSprites'

// Shop section for Emotes (StoreItem category EMOTE) - see HeroItemShelf.jsx
// for the shared hero-picker/card-grid shell this and SkinShelf.jsx both
// wrap.
//
// This grid is entirely driven by real backend StoreItem rows (`emotes`,
// filtered to category EMOTE in GamePage.jsx) - every card's art comes from
// the central registry (utils/emotes.js/EmoteGlyph.jsx) keyed by hero name +
// StoreItem.name, never from assetUrl (EMOTE rows don't carry one). A row
// with no matching registry entry still shows up here with the lock-icon
// placeholder (see EmoteGlyph) rather than being hidden, so a catalog gap
// is visible instead of silently missing. New rows are created from the
// admin "Create Emote" tool (GameMechanicsPage.jsx's EmoteAdminPanel) -
// once one exists for a hero's built pose, it lights up here automatically.
// Memoized - GamePage re-renders every few seconds from its standing GPS
// watch regardless of which Shop tab is open, and without this every one
// of those unrelated re-renders also re-rendered this whole grid (and
// every tile's AnimatedSprite inside it) for nothing. See GamePage.jsx's
// own comment on emoteItems/handleEquip for the other half of this fix -
// memoizing the component only helps once its props actually hold stable
// references (same array/function unless the real data changed), not a
// freshly-built one every render.
function EmoteShelf({
  emotes,
  heroes,
  ownedItems,
  loading,
  onBuy,
  onEquip,
  onShowcase,
}) {
  return (
    <HeroItemShelf
      items={emotes}
      heroes={heroes}
      ownedItems={ownedItems}
      loading={loading}
      onBuy={onBuy}
      onEquip={onEquip}
      onShowcase={onShowcase}
      title="Emotes"
      subtitle="Show your style out on the run."
      infoText="Every hero has their own emotes - own the hero first to unlock theirs. Tap a card to preview it before you buy."
      nounSingular="emote"
      nounPlural="emotes"
      emptyText="No emotes in stock yet - check back soon!"
      showHeroSummary
      // Each hero's card in the picker previews their default emote
      // ("Classic", the one every owner gets free) instead of a plain
      // portrait - falls back to the first emote in their list if there's
      // no "Classic" row, and to EmoteGlyph's own lock placeholder if the
      // hero has no emotes at all.
      //
      // Only for heroes heroSprites.js actually has dedicated pose art for
      // (today: Blaze and Comet) - hasHeroSprite's own getHeroSprite
      // silently falls back to Blaze's strips for every other hero, which
      // is exactly what made every other character card show Blaze's look
      // here. Anyone without a real entry gets their own uploaded
      // hero.portraitUrl instead (same real image the Hero carousel/
      // Skins tab already show for them), falling further back to the
      // default picker's own initial-letter placeholder if that's unset
      // too - never a borrowed/wrong character.
      renderHeroCardArt={(hero, heroItems) => {
        if (!hasHeroSprite(hero.name)) {
          return hero.portraitUrl ? (
            <img
              src={resolveFileUrl(hero.portraitUrl)}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            hero.name?.[0] || '?'
          )
        }
        const defaultEmote =
          heroItems.find(
            (i) => (i.name || '').trim().toLowerCase() === 'classic'
          ) || heroItems[0]
        return (
          <EmoteGlyph
            heroName={hero.name}
            emoteName={defaultEmote?.name}
            size={56}
          />
        )
      }}
      // Fortnite-locker-style redesign once a hero's emotes are open (see
      // HeroItemShelf.jsx's own comment on this prop). Matches the real
      // Fortnite locker's own behavior: tapping an OWNED tile equips it
      // right there on this same screen (onEquip, same plumbing the old
      // plain grid used); tapping a LOCKED one opens the full-screen
      // showcase to preview/buy it (onView = onShowcase).
      renderGrid={({
        hero,
        items,
        ownedItems: owned,
        onEquip: equip,
        onBack,
      }) => (
        <EmoteSelectScreen
          hero={hero}
          items={items}
          ownedItems={owned}
          onEquip={equip}
          onView={onShowcase}
          onBack={onBack}
        />
      )}
    />
  )
}

export default memo(EmoteShelf)
