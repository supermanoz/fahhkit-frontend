/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconLock } from './GameIcons'
import HeroFigure from './HeroFigure'
import { getHeroSprite } from '../utils/heroSprites'
import { resolveFileUrl } from '../api/client'

// Swipeable "pick your war hero" slider - CSS scroll-snap (real native
// swipe/momentum, no drag-gesture library), one full-width card visible at
// a time, with arrow buttons, dots and Left/Right keys all driving the same
// `index`. Same shield-lock look as the Shop's own HeroGallery.jsx, but its
// own component rather than that one reused directly: HeroGallery flips
// between cards via a framer-motion drag gesture (no scroll-snap at all)
// and equips immediately on tap, where this needs native scroll-snap plus
// a two-step Select-then-"Lock In" confirm (so a swipe never locks anything
// in by itself) - different enough mechanics that bolting both onto one
// component would need more branching than just having two.
export default function ClubWarHeroPicker({
  heroItems,
  ownedItems,
  lockedHeroStoreItemId,
  onLockIn,
  busy,
}) {
  const trackRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const startIndex = Math.max(
    0,
    heroItems.findIndex((h) => h.id === lockedHeroStoreItemId)
  )
  const [index, setIndex] = useState(startIndex)
  const [selectedId, setSelectedId] = useState(lockedHeroStoreItemId || null)

  function goTo(nextIndex) {
    setIndex(Math.max(0, Math.min(heroItems.length - 1, nextIndex)))
  }

  // Arrow/dot/keyboard navigation scrolls the track; a manual swipe is
  // picked up by handleScroll below instead, so both paths keep `index`
  // (which card is centred) in sync with what's actually on screen.
  useEffect(() => {
    const card = trackRef.current?.children[index]
    card?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [index])

  useEffect(() => {
    return () => clearTimeout(scrollTimeoutRef.current)
  }, [])

  // Debounced, not computed on every scroll tick: each full-width card is a
  // long scrollIntoView trip, so a tap on an arrow/dot fires a steady stream
  // of native scroll events while it animates there - reading "closest card"
  // mid-flight kept finding the old one and snapping `index` straight back,
  // which made the arrows look dead. Waiting for scrolling to actually stop
  // avoids fighting the still-in-progress scrollIntoView from goTo() above.
  function handleScroll() {
    clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      const track = trackRef.current
      if (!track) return
      const center = track.getBoundingClientRect().left + track.clientWidth / 2
      let closest = 0
      let closestDist = Infinity
      Array.from(track.children).forEach((child, i) => {
        const rect = child.getBoundingClientRect()
        const dist = Math.abs(rect.left + rect.width / 2 - center)
        if (dist < closestDist) {
          closestDist = dist
          closest = i
        }
      })
      setIndex(closest)
    }, 120)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(index - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(index + 1)
    }
  }

  const selectedItem = heroItems.find((h) => h.id === selectedId)
  const alreadyLockedIn = selectedId && selectedId === lockedHeroStoreItemId

  return (
    <div className="club-war-hero-picker">
      <div className="club-war-hero-picker-row">
        <button
          type="button"
          className="hero-roster-arrow is-prev"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Previous hero"
        >
          <IconChevronLeft />
        </button>

        <ul
          className="club-war-hero-track"
          ref={trackRef}
          onScroll={handleScroll}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="listbox"
          aria-label="Choose your war hero"
        >
          {heroItems.map((item, i) => {
            const owned = ownedItems.some((o) => o.storeItem.id === item.id)
            const isCentred = i === index
            const isSelected = item.id === selectedId
            const isLockedIn = item.id === lockedHeroStoreItemId
            const animated = Boolean(getHeroSprite(item.name))
            return (
              <li
                key={item.id}
                className="club-war-hero-slide"
                role="option"
                aria-selected={isSelected}
              >
                <button
                  type="button"
                  className={`club-war-hero-card ${isSelected ? 'is-selected' : ''} ${!owned ? 'is-locked' : ''}`}
                  disabled={!owned}
                  onClick={() => {
                    goTo(i)
                    setSelectedId(item.id)
                  }}
                >
                  <span className="club-war-hero-card-stage">
                    {/* Only the centred card actually animates - every
                        other slide shows the shop's own flat art, same
                        image the old grid used for non-animated heroes,
                        so swiping through a full roster never has more
                        than one sprite running at once. */}
                    {isCentred && animated ? (
                      <HeroFigure
                        hero={{ name: item.name }}
                        pose="idle"
                        height={160}
                      />
                    ) : item.assetUrl ? (
                      <img
                        src={resolveFileUrl(item.assetUrl)}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      animated && (
                        <HeroFigure
                          hero={{ name: item.name }}
                          pose="idle"
                          height={160}
                        />
                      )
                    )}
                    {!owned && (
                      <span
                        className="club-war-hero-card-lock"
                        aria-hidden="true"
                      >
                        <IconLock />
                        <span>Unlock</span>
                      </span>
                    )}
                  </span>
                  <span className="club-war-hero-card-name">{item.name}</span>
                  {isLockedIn ? (
                    <span className="club-war-hero-card-cta is-locked-in">
                      Locked In
                    </span>
                  ) : owned ? (
                    <span className="club-war-hero-card-cta">
                      {isSelected ? 'Selected' : 'Select'}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          className="hero-roster-arrow is-next"
          onClick={() => goTo(index + 1)}
          disabled={index === heroItems.length - 1}
          aria-label="Next hero"
        >
          <IconChevronRight />
        </button>
      </div>

      {heroItems.length > 1 && (
        <div className="hero-roster-dots">
          {heroItems.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`hero-roster-dot ${i === index ? 'active' : ''}`}
              aria-label={`Show ${item.name}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="game-btn game-btn-green game-btn-lg club-war-hero-lock-in-btn"
        disabled={!selectedItem || alreadyLockedIn || busy}
        onClick={() => onLockIn(selectedItem)}
      >
        {busy
          ? 'Locking in…'
          : alreadyLockedIn
            ? 'Locked In'
            : selectedItem
              ? `Lock In ${selectedItem.name}`
              : 'Select a Hero'}
      </button>
    </div>
  )
}
