/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { FaCheck, FaLock } from 'react-icons/fa'
import HeroFigure from './HeroFigure'
import { getHeroSprite } from '../utils/heroSprites'
import './HeroGallery.css'

// Dota-style hero select grid for the Heroes tab: tall cards with the hero
// standing in them (animated when they have a sprite strip, breaking into a
// run on hover/focus). Tapping one opens HeroDetailModal via onSelect.
export default function HeroGallery({
  heroes,
  ownedItems,
  activeHeroId,
  loading,
  onSelect,
}) {
  const [activeId, setActiveId] = useState(null)

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
    <div className="hero-gallery">
      {heroes.map((hero) => {
        // activeHeroId covers the default (Blaze) too, which the player
        // doesn't own a skin for.
        const equipped = hero.id === activeHeroId
        const owned = ownedItems.some((o) => o.storeItem.heroId === hero.id)
        const comingSoon = !equipped && !owned && hero.skins?.length === 0
        const animated = Boolean(getHeroSprite(hero.name))
        const active = activeId === hero.id
        return (
          <button
            key={hero.id}
            type="button"
            className={`hero-tile ${equipped ? 'is-equipped' : ''} ${comingSoon ? 'is-soon' : ''} ${animated ? 'is-animated' : ''}`}
            onClick={() => onSelect(hero)}
            onPointerEnter={() => setActiveId(hero.id)}
            onPointerLeave={() => setActiveId(null)}
            onFocus={() => setActiveId(hero.id)}
            onBlur={() => setActiveId(null)}
          >
            <span className="hero-tile-stage">
              <HeroFigure
                hero={hero}
                pose={active ? 'run' : 'idle'}
                height={110}
              />
            </span>
            {equipped ? (
              <span className="hero-tile-badge">
                <FaCheck /> Equipped
              </span>
            ) : owned ? (
              <span className="hero-tile-badge is-owned">Owned</span>
            ) : comingSoon ? (
              <span className="hero-tile-badge is-soon">
                <FaLock /> Soon
              </span>
            ) : null}
            <span className="hero-tile-name">{hero.name}</span>
          </button>
        )
      })}
    </div>
  )
}
