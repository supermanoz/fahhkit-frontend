/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useRef, useState } from 'react'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
} from './GameIcons'
import HeroFigure from './HeroFigure'
import { getHeroSprite } from '../utils/heroSprites'
import { heroAbilityParts } from '../utils/hero'
import './HeroGallery.css'

// Hero roster for the Shop: a sideways-scrolling (swipe / arrow buttons)
// strip of heroes standing free - no card frame - each on a soft glow in
// their tier colour, name and perk count underneath, and a fat action bar
// (price / Equip / Equipped / locked). Tapping one opens HeroDetailModal
// via onSelect.
export default function HeroGallery({
  heroes,
  ownedItems,
  activeHeroId,
  loading,
  onSelect,
}) {
  const [activeId, setActiveId] = useState(null)
  const trackRef = useRef(null)

  function scrollByCards(dir) {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector('.hero-card')
    const step = card ? card.getBoundingClientRect().width + 12 : 160
    track.scrollBy({ left: dir * step * 2, behavior: 'smooth' })
  }

  if (loading && heroes.length === 0) {
    return <p className="game-menu-empty">Summoning the heroes…</p>
  }
  if (heroes.length === 0) {
    return (
      <p className="game-menu-empty">
        No heroes have answered the call yet. Check back soon!
      </p>
    )
  }

  return (
    <div className="hero-roster">
      <button
        type="button"
        className="hero-roster-arrow is-prev"
        onClick={() => scrollByCards(-1)}
        aria-label="Previous heroes"
      >
        <IconChevronLeft />
      </button>
      <div className="hero-roster-track" ref={trackRef}>
        {heroes.map((hero) => {
          // activeHeroId covers the default (Blaze) too, which the player
          // doesn't own a skin for.
          const equipped = hero.id === activeHeroId
          const owned = ownedItems.some((o) => o.storeItem.heroId === hero.id)
          const comingSoon = !equipped && !owned && hero.skins?.length === 0
          const animated = Boolean(getHeroSprite(hero.name))
          const active = activeId === hero.id
          const perkCount = (hero.abilities || []).filter((a) =>
            heroAbilityParts(a)
          ).length
          const prices = (hero.skins || [])
            .map((sk) => sk.priceFahhcoin || 0)
            .filter((n) => n > 0)
          const fromPrice = prices.length ? Math.min(...prices) : 0
          const tier = equipped
            ? 'equipped'
            : owned
              ? 'owned'
              : comingSoon
                ? 'soon'
                : 'locked'
          return (
            <button
              key={hero.id}
              type="button"
              className={`hero-card tier-${tier} ${animated ? 'is-animated' : ''}`}
              onClick={() => onSelect(hero)}
              onPointerEnter={() => setActiveId(hero.id)}
              onPointerLeave={() => setActiveId(null)}
              onFocus={() => setActiveId(hero.id)}
              onBlur={() => setActiveId(null)}
            >
              <span className="hero-card-stage">
                <HeroFigure
                  hero={hero}
                  pose={active ? 'run' : 'idle'}
                  height={150}
                />
              </span>

              <span className="hero-card-name">{hero.name}</span>
              {perkCount > 0 && (
                <span className="hero-card-level">⚡ {perkCount} perks</span>
              )}

              {tier === 'soon' ? (
                <span className="hero-card-foot is-locked">
                  <IconLock />
                  <span>Coming soon</span>
                </span>
              ) : (
                <span className={`hero-card-foot is-${tier}`}>
                  {equipped ? (
                    <>
                      <IconCheck /> Equipped
                    </>
                  ) : owned ? (
                    'Equip'
                  ) : (
                    <>
                      <span className="hero-card-foot-label">
                        {fromPrice > 0 ? 'Unlock' : 'Free'}
                      </span>
                      {fromPrice > 0 && (
                        <span className="hero-card-foot-price">
                          {fromPrice}
                          <span className="game-coin" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="hero-roster-arrow is-next"
        onClick={() => scrollByCards(1)}
        aria-label="More heroes"
      >
        <IconChevronRight />
      </button>
    </div>
  )
}
