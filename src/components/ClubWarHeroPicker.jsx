/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
} from './GameIcons'
import HeroFigure from './HeroFigure'
import { getHeroSprite } from '../utils/heroSprites'
import { resolveFileUrl } from '../api/client'
import { useToast } from '../game/ui/Toast'
import { claimFreeItem } from '../api/store'
import { getItemState, ITEM_STATE, needsClaim } from '../utils/itemState'

// Swipeable "pick your war hero" slider - CSS scroll-snap (real native
// swipe/momentum, no drag-gesture library), one full-width card visible at
// a time, with arrow buttons, dots and Left/Right keys all driving the same
// `index`. Same shield-lock look as the Shop's own HeroGallery.jsx, but its
// own component rather than that one reused directly - different enough
// mechanics (native scroll-snap vs. a drag gesture) that bolting both onto
// one component would need more branching than just having two.
//
// Whichever hero is centred (`index`) IS the selection now - there's no
// separate tap-to-select step any more (that used to live here as its own
// `selectedId` state + a per-card Select/Selected button). One "Lock In"
// button at the bottom always reads off the centred hero directly, so
// swiping to a new hero and tapping it locks THAT one, never a stale pick.
export default function ClubWarHeroPicker({
  heroItems,
  ownedItems,
  lockedHeroStoreItemId,
  onLockIn,
  busy,
}) {
  const toast = useToast()
  const trackRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const startIndex = Math.max(
    0,
    heroItems.findIndex((h) => h.id === lockedHeroStoreItemId)
  )
  const [index, setIndex] = useState(startIndex)

  function goTo(nextIndex) {
    setIndex(Math.max(0, Math.min(heroItems.length - 1, nextIndex)))
  }

  // Which card is actually centred, independent of `index` driving a
  // scrollIntoView - recomputed on scroll-end (swipe/arrow/dot) and on
  // resize (an orientation change can leave a different card centred
  // without ever firing a scroll event), so this never goes stale.
  function syncIndexToScroll() {
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
    function onResize() {
      clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(syncIndexToScroll, 120)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  // Debounced, not computed on every scroll tick: each full-width card is a
  // long scrollIntoView trip, so a tap on an arrow/dot fires a steady stream
  // of native scroll events while it animates there - reading "closest card"
  // mid-flight kept finding the old one and snapping `index` straight back,
  // which made the arrows look dead. Waiting for scrolling to actually stop
  // avoids fighting the still-in-progress scrollIntoView from goTo() above.
  function handleScroll() {
    clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(syncIndexToScroll, 120)
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

  const currentItem = heroItems[index]
  const currentOwned = currentItem
    ? getItemState(currentItem, ownedItems) !== ITEM_STATE.LOCKED
    : false
  const currentIsLockedIn = currentItem?.id === lockedHeroStoreItemId

  async function handleLockIn() {
    if (!currentItem) return
    // A free hero with no backend row is owned by rule but the server's
    // lock-in needs the row: claim it first.
    if (needsClaim(currentItem, ownedItems)) {
      try {
        await claimFreeItem(currentItem.id)
      } catch {
        toast.push(`Couldn't lock in ${currentItem.name} - tap to try again.`, {
          type: 'error',
        })
        return
      }
    }
    const ok = await onLockIn(currentItem)
    if (ok) {
      toast.push(`${currentItem.name} locked in`, { type: 'success' })
    } else {
      toast.push(`Couldn't lock in ${currentItem.name} - tap to try again.`, {
        type: 'error',
      })
    }
  }

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
            const owned = getItemState(item, ownedItems) !== ITEM_STATE.LOCKED
            const isCentred = i === index
            const isLockedIn = item.id === lockedHeroStoreItemId
            const animated = Boolean(getHeroSprite(item.name))
            return (
              <li
                key={item.id}
                className="club-war-hero-slide"
                role="option"
                aria-selected={isCentred}
              >
                {/* Display only now - swiping/arrows/dots change `index`,
                    a card itself no longer does anything on tap. */}
                <div
                  className={`club-war-hero-card ${!owned ? 'is-locked' : ''}`}
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
                  {isLockedIn && (
                    <span className="club-war-hero-card-cta is-locked-in">
                      <IconCheck /> Locked In
                    </span>
                  )}
                </div>
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

      {/* Sticky so a tall card (long roster list above, small phone
          viewport) never pushes this below the fold - it's the only way
          to lock in a hero now, so it has to stay reachable without
          scrolling. */}
      <button
        type="button"
        className={`club-war-hero-lock-in-btn ${
          busy
            ? 'is-busy'
            : !currentOwned
              ? 'is-unowned'
              : currentIsLockedIn
                ? 'is-locked-in'
                : ''
        }`}
        disabled={!currentItem || !currentOwned || currentIsLockedIn || busy}
        onClick={handleLockIn}
      >
        {busy ? (
          <>
            <span
              className="club-war-hero-lock-in-spinner"
              aria-hidden="true"
            />
            Locking in…
          </>
        ) : !currentOwned ? (
          <>
            <IconLock /> Hero locked
          </>
        ) : currentIsLockedIn ? (
          <>
            <IconCheck /> Locked In
          </>
        ) : (
          `Lock In ${currentItem?.name || 'Hero'}`
        )}
      </button>
    </div>
  )
}
