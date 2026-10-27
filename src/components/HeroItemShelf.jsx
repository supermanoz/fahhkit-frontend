/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { memo, useState } from 'react'
import { IconChevronLeft, IconCheck, IconInfo, IconLock } from './GameIcons'
import { resolveFileUrl } from '../api/client'
import EmoteGlyph from './EmoteGlyph'

// Shared shell for any per-hero Shop section (Emotes, Skins, ...): a header
// banner, then a hero-picker grid (tap a hero to see just their items),
// then a 3-per-row card grid for whichever hero is picked. Unlike
// Territory/Trail colors, these categories belong to a specific hero
// (StoreItem.heroId), and the backend refuses to sell or equip one for a
// hero the player doesn't own (HERO_NOT_OWNED) - the hero picker itself
// flags that (a locked badge on any hero card you don't own yet) instead
// of a confusing purchase failure once you're already looking at that
// hero's items. Equip is scoped per-hero server-side (equipping one item
// only un-equips that same hero's previous one of the same category, not
// every hero's), so `owned.equipped` already reflects the right
// hero-scoped state with no extra client-side logic.
// See EmoteShelf.jsx/SkinShelf.jsx - thin per-category wrappers around this.
// Memoized for the same reason EmoteShelf itself is (see its comment) -
// this is the component actually holding every tile's AnimatedSprite, so
// it's the one that matters most to skip re-rendering on an unrelated
// parent update.
function HeroItemShelf({
  items,
  heroes,
  ownedItems,
  loading,
  onBuy,
  onEquip,
  // EMOTE-only: tapping any emote tile (owned or not) opens a showcase
  // popup instead of buying/equipping straight away (see GamePage.jsx's
  // storeChoice modal, which already has a Buy flow and now an Equip one
  // too) - other categories (Skins) keep the instant buy/equip tap below.
  onShowcase,
  title,
  subtitle,
  infoText,
  nounSingular,
  nounPlural,
  emptyText,
  rootClassName = 'emote-shelf',
  // Replaces the plain subheader + card-grid below with a fully custom
  // renderer once the hero is owned - EmoteShelf.jsx uses this for the
  // Fortnite-style EmoteSelectScreen; SkinShelf.jsx leaves it unset and
  // keeps the plain grid exactly as before. Still falls back to the plain
  // (locked/disabled) grid when the hero itself isn't owned, same as any
  // other category - this only changes how an OWNED hero's items render.
  renderGrid,
  // Hero-picker card art, overridable per category - defaults to the
  // hero's own portrait (what Skins wants). EmoteShelf passes its own so
  // each hero's card previews its default emote instead (see there for
  // why), getting (hero, heroItems) for whichever hero this card is.
  renderHeroCardArt = (hero) =>
    hero.portraitUrl ? (
      <img
        src={resolveFileUrl(hero.portraitUrl)}
        alt=""
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    ) : (
      hero.name?.[0] || '?'
    ),
  // Adds the "N/M unlocked" header + All/Owned/Locked filter row above the
  // hero-picker grid - opt-in (EmoteShelf.jsx turns it on) so SkinShelf.jsx
  // keeps its existing, simpler picker exactly as it was; the card/grid
  // redesign and lock-badge fix below apply either way, since those are
  // pure visual/bug fixes with nothing behavioral riding on them.
  showHeroSummary = false,
}) {
  const [selectedHeroId, setSelectedHeroId] = useState(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [heroFilter, setHeroFilter] = useState('all')

  const groups = new Map()
  for (const item of items) {
    const list = groups.get(item.heroId) || []
    list.push(item)
    groups.set(item.heroId, list)
  }
  const heroGroups = [...groups.entries()]
    .map(([heroId, heroItems]) => ({
      heroId,
      items: heroItems,
      hero: heroes.find((h) => h.id === heroId),
    }))
    .filter((g) => g.hero)

  const selected = heroGroups.find((g) => g.heroId === selectedHeroId) || null
  const selectedHeroOwned = Boolean(
    selected &&
    ownedItems.some(
      (o) =>
        o.storeItem.category === 'HERO' &&
        o.storeItem.heroId === selected.heroId
    )
  )

  return (
    <section className={rootClassName}>
      <div className="emote-shelf-banner">
        <div className="emote-shelf-banner-text">
          <p className="emote-shelf-banner-title">{title}</p>
          <p className="emote-shelf-banner-sub">{subtitle}</p>
        </div>
        <button
          type="button"
          className="emote-shelf-info-btn"
          aria-label={`About ${nounPlural}`}
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((o) => !o)}
        >
          <IconInfo />
        </button>
      </div>
      {infoOpen && <p className="emote-shelf-info-line">{infoText}</p>}

      {loading && items.length === 0 ? (
        <p className="game-menu-empty">Loading {nounPlural}…</p>
      ) : heroGroups.length === 0 ? (
        <p className="game-menu-empty">{emptyText}</p>
      ) : !selected ? (
        (() => {
          const heroOwnedMap = new Map(
            heroGroups.map(({ heroId }) => [
              heroId,
              ownedItems.some(
                (o) =>
                  o.storeItem.category === 'HERO' &&
                  o.storeItem.heroId === heroId
              ),
            ])
          )
          const ownedHeroCount = [...heroOwnedMap.values()].filter(
            Boolean
          ).length
          const visibleHeroGroups = heroGroups.filter(({ heroId }) =>
            heroFilter === 'owned'
              ? heroOwnedMap.get(heroId)
              : heroFilter === 'locked'
                ? !heroOwnedMap.get(heroId)
                : true
          )
          return (
            <>
              {showHeroSummary && (
                <div className="emote-hero-summary">
                  <p className="emote-hero-summary-text">
                    {ownedHeroCount}/{heroGroups.length} characters unlocked
                  </p>
                  <div
                    className="emote-hero-filter-row"
                    role="tablist"
                    aria-label="Filter characters"
                  >
                    {[
                      ['all', 'All'],
                      ['owned', 'Owned'],
                      ['locked', 'Locked'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={heroFilter === value}
                        className={`emote-hero-filter-btn ${heroFilter === value ? 'active' : ''}`}
                        onClick={() => setHeroFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {visibleHeroGroups.length === 0 ? (
                <p className="game-menu-empty">
                  No {heroFilter} characters to show.
                </p>
              ) : (
                <div className="emote-hero-picker">
                  {visibleHeroGroups.map(
                    ({ heroId, hero, items: heroItems }) => {
                      const heroOwned = heroOwnedMap.get(heroId)
                      return (
                        <button
                          key={heroId}
                          type="button"
                          className={`emote-hero-pick ${heroOwned ? 'is-owned' : 'is-locked'}`}
                          onClick={() => setSelectedHeroId(heroId)}
                          aria-label={`${hero.name}, ${
                            heroOwned
                              ? 'unlocked'
                              : 'locked - unlock in the shop'
                          }`}
                        >
                          <span className="emote-hero-pick-avatar-wrap">
                            <span className="emote-hero-pick-portrait">
                              {renderHeroCardArt(hero, heroItems)}
                            </span>
                            {heroOwned ? (
                              <span
                                className="emote-hero-pick-badge is-check"
                                aria-hidden="true"
                              >
                                <IconCheck />
                              </span>
                            ) : (
                              <span
                                className="emote-hero-pick-badge is-lock"
                                title="Locked: unlock in the shop"
                              >
                                <IconLock />
                              </span>
                            )}
                          </span>
                          <span className="emote-hero-pick-name">
                            {hero.name}
                          </span>
                          <span className="emote-hero-pick-count">
                            {heroItems.length}{' '}
                            {heroItems.length === 1 ? nounSingular : nounPlural}
                          </span>
                          <span className="emote-hero-pick-state">
                            {heroOwned ? 'Owned' : 'Locked'}
                          </span>
                        </button>
                      )
                    }
                  )}
                </div>
              )}
            </>
          )
        })()
      ) : renderGrid && selectedHeroOwned ? (
        renderGrid({
          hero: selected.hero,
          items: selected.items,
          ownedItems,
          onEquip,
          onBack: () => setSelectedHeroId(null),
        })
      ) : (
        <>
          <div className="emote-shelf-subheader">
            <button
              type="button"
              className="emote-shelf-back"
              aria-label="Back to heroes"
              onClick={() => setSelectedHeroId(null)}
            >
              <IconChevronLeft />
            </button>
            {selected.hero.portraitUrl && (
              <img
                className="emote-shelf-hero-portrait"
                src={resolveFileUrl(selected.hero.portraitUrl)}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}
            <span className="emote-shelf-subheader-name">
              {selected.hero.name}
            </span>
          </div>
          <div className="emote-grid">
            {selected.items.map((item) => {
              const heroOwned = ownedItems.some(
                (o) =>
                  o.storeItem.category === 'HERO' &&
                  o.storeItem.heroId === selected.heroId
              )
              const owned = ownedItems.find((o) => o.storeItem.id === item.id)
              const showcase = item.category === 'EMOTE' && onShowcase
              const statusLabel = !heroOwned
                ? `Own ${selected.hero.name} first`
                : showcase
                  ? owned
                    ? owned.equipped
                      ? 'equipped, tap to view'
                      : 'owned, tap to view'
                    : item.priceFahhcoin > 0
                      ? `tap to view - ${item.priceFahhcoin} Fahhcoin`
                      : 'tap to view - free'
                  : owned
                    ? owned.equipped
                      ? 'equipped, tap to unequip'
                      : 'owned, tap to equip'
                    : item.priceFahhcoin > 0
                      ? `tap to preview - ${item.priceFahhcoin} Fahhcoin`
                      : 'tap to preview - free'
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`emote-tile ${owned?.equipped ? 'is-equipped' : owned ? 'is-owned' : ''} ${!heroOwned ? 'is-locked' : ''}`}
                  disabled={!heroOwned}
                  onClick={() =>
                    showcase
                      ? onShowcase(item)
                      : owned
                        ? onEquip(item, owned.equipped)
                        : onBuy(item)
                  }
                  aria-label={`${item.name} - ${statusLabel}`}
                  title={statusLabel}
                >
                  <span className="emote-tile-preview">
                    {item.category === 'EMOTE' ? (
                      <EmoteGlyph
                        heroName={selected.hero.name}
                        emoteName={item.name}
                        size={96}
                      />
                    ) : item.assetUrl ? (
                      <img
                        src={resolveFileUrl(item.assetUrl)}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <IconLock aria-hidden="true" />
                    )}
                  </span>
                  <span className="emote-tile-name">{item.name}</span>
                  <span className="emote-tile-chip">
                    {!heroOwned ? (
                      <>
                        <IconLock /> Locked
                      </>
                    ) : owned ? (
                      owned.equipped ? (
                        <>
                          <IconCheck /> On
                        </>
                      ) : (
                        'Owned'
                      )
                    ) : item.priceFahhcoin > 0 ? (
                      <>
                        <span className="game-coin" aria-hidden="true" />
                        {item.priceFahhcoin}
                      </>
                    ) : (
                      'Free'
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

export default memo(HeroItemShelf)
