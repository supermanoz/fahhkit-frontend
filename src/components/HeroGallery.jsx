/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
} from './GameIcons'
import HeroFigure from './HeroFigure'
import HeroStage from './HeroStage'
import { getHeroSprite } from '../utils/heroSprites'
import { resolveHeroEquipState } from '../utils/heroEquipState'
import { getHeroUnlockPrice } from '../utils/price'
import { PriceLabel } from './Price'
import { useUnlockReveal } from '../hooks/useUnlockReveal'
import './heroLocked.css'
import './HeroGallery.css'
import { HeroGallerySkeleton } from './ScreenSkeletons'

// A swipe distance/velocity past either of these commits to the next/prev
// hero - same thresholds ShareRunCarousel.jsx uses for its drag-to-advance
// carousel.
const DRAG_DISTANCE_THRESHOLD = 60
const DRAG_VELOCITY_THRESHOLD = 500
// Anything under this counts as a tap (opens the hero), not a swipe.
const DRAG_CLICK_THRESHOLD = 10

// One hero at a time (the Shop has the room for exactly one full-size
// figure, not a shelf of them) with a flip-box transition between them:
// arrows, dot jumps or a swipe all land the same way - the current card
// rotates away like the far face of a box and the next one rotates in
// from the opposite face.
const flipVariants = {
  enter: (dir) => ({ rotateY: dir >= 0 ? 90 : -90, opacity: 0 }),
  center: { rotateY: 0, opacity: 1 },
  exit: (dir) => ({ rotateY: dir >= 0 ? -90 : 90, opacity: 0 }),
}

function HeroGallery({
  heroes,
  ownedItems,
  activeHeroId,
  // The player's current level (profile.level) - heroes with a higher
  // unlockLevel show level-locked (utils/itemState.js).
  level,
  loading,
  onSelect,
  onEquip,
}) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  // Keyed by hero id (not a plain bool) so switching heroes mid-request
  // doesn't leave the new card showing the old one's spinner, and a
  // reused true/false can't go stale across the swap either.
  const [equippingHeroId, setEquippingHeroId] = useState(null)
  const draggedRef = useRef(false)
  // Locked -> owned while this hero is on screen (just bought): a short reveal.
  const current = heroes[index]
  const currentLocked = current
    ? resolveHeroEquipState(current, ownedItems, activeHeroId, level).locked
    : false
  const unlocking = useUnlockReveal(current?.id, currentLocked)

  // Keep a valid index if the roster shrinks (or loads in) under us.
  useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(heroes.length - 1, i)))
  }, [heroes.length])

  function goTo(nextIndex) {
    const clamped = Math.max(0, Math.min(heroes.length - 1, nextIndex))
    if (clamped === index) return
    setDirection(clamped > index ? 1 : -1)
    setIndex(clamped)
  }

  async function handleEquipClick(e, item, claim = false) {
    // The card itself opens the detail modal on click (onSelect below) -
    // without this, tapping Equip would do both at once.
    e.stopPropagation()
    if (equippingHeroId) return
    setEquippingHeroId(item.heroId)
    try {
      await onEquip(item, false, { claim })
    } finally {
      setEquippingHeroId(null)
    }
  }

  function handleDragEnd(_, info) {
    if (
      Math.abs(info.offset.x) > DRAG_CLICK_THRESHOLD ||
      Math.abs(info.velocity.x) > DRAG_VELOCITY_THRESHOLD
    ) {
      draggedRef.current = true
    }
    if (
      info.offset.x < -DRAG_DISTANCE_THRESHOLD ||
      info.velocity.x < -DRAG_VELOCITY_THRESHOLD
    ) {
      goTo(index + 1)
    } else if (
      info.offset.x > DRAG_DISTANCE_THRESHOLD ||
      info.velocity.x > DRAG_VELOCITY_THRESHOLD
    ) {
      goTo(index - 1)
    }
  }

  if (loading && heroes.length === 0) {
    return <HeroGallerySkeleton />
  }
  if (heroes.length === 0) {
    return (
      <p className="game-menu-empty">
        No heroes have answered the call yet. Check back soon!
      </p>
    )
  }

  const hero = heroes[index]
  const {
    equipped,
    owned,
    ownedHeroItem,
    heroItem,
    claimable,
    tier,
    levelLocked,
    unlockLevel,
    locked,
  } = resolveHeroEquipState(hero, ownedItems, activeHeroId, level)
  const equipping = equippingHeroId === hero.id
  const animated = Boolean(getHeroSprite(hero.name))
  // The HERO unlock item's own price - the same one the detail modal and the
  // purchase use (see utils/price.js).
  const unlockPrice = getHeroUnlockPrice(hero)

  return (
    <div className="hero-roster">
      <div className="hero-roster-row">
        <button
          type="button"
          className="hero-roster-arrow is-prev"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Previous hero"
        >
          <IconChevronLeft />
        </button>

        <div className="hero-roster-stage">
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={hero.id}
              custom={direction}
              variants={flipVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformPerspective: 900 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragStart={() => {
                draggedRef.current = false
              }}
              onDragEnd={handleDragEnd}
              role="button"
              tabIndex={0}
              aria-label={`${hero.name} - view details`}
              className={`hero-card tier-${tier} ${animated ? 'is-animated' : ''} ${locked ? 'is-hero-locked' : ''}`}
              onClick={() => {
                if (draggedRef.current) {
                  draggedRef.current = false
                  return
                }
                onSelect(hero)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(hero)
                }
              }}
            >
              <span
                className={`hero-card-stage ${unlocking ? 'is-unlocking' : ''}`}
              >
                <HeroStage hero={hero.name} className="hero-card-stage-bg">
                  {(h) => (
                    // Idle only - Hip Hop is a purchasable emote (see
                    // heroManifest.js: it's no longer under this hero's
                    // `poses` at all, only under `emotes`), so it can't be
                    // free-previewed here regardless of ownership. Falls
                    // back to 240 (the old fixed size) only for the one
                    // frame before HeroStage's ResizeObserver reports a
                    // real height.
                    <HeroFigure
                      hero={hero}
                      pose="idle"
                      height={h || 240}
                      releaseGraceMs={0}
                    />
                  )}
                </HeroStage>
              </span>

              <span className="hero-card-name">{hero.name}</span>

              {levelLocked && (
                <span
                  className="hero-card-level-chip"
                  data-testid="hero-level-chip"
                >
                  <IconLock aria-hidden="true" /> Unlocks at level {unlockLevel}
                </span>
              )}

              {levelLocked ? (
                <span className="hero-card-foot is-level-locked">
                  <button
                    type="button"
                    className="hero-card-equip-btn"
                    data-testid="hero-card-action"
                    disabled
                    aria-disabled="true"
                  >
                    Reach level {unlockLevel} to unlock
                  </button>
                </span>
              ) : tier === 'soon' || tier === 'limited' ? (
                <span className="hero-card-foot is-locked">
                  <IconLock />
                  <span>Limited</span>
                </span>
              ) : (
                <span className={`hero-card-foot is-${tier}`}>
                  {equipped ? (
                    <button
                      type="button"
                      className="hero-card-equip-btn"
                      disabled
                    >
                      <IconCheck /> Equipped
                    </button>
                  ) : ownedHeroItem || claimable ? (
                    <button
                      type="button"
                      className="hero-card-equip-btn"
                      disabled={equipping}
                      onClick={(e) =>
                        handleEquipClick(
                          e,
                          ownedHeroItem ? ownedHeroItem.storeItem : heroItem,
                          claimable
                        )
                      }
                    >
                      {equipping ? 'Equipping…' : 'Equip'}
                    </button>
                  ) : owned ? (
                    'Equip'
                  ) : unlockPrice > 0 ? (
                    <PriceLabel label="Unlock" amount={unlockPrice} />
                  ) : (
                    <span className="hero-card-foot-label">
                      {unlockPrice == null ? 'Unavailable' : 'Free'}
                    </span>
                  )}
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          className="hero-roster-arrow is-next"
          onClick={() => goTo(index + 1)}
          disabled={index === heroes.length - 1}
          aria-label="Next hero"
        >
          <IconChevronRight />
        </button>
      </div>

      {heroes.length > 1 && (
        <div className="hero-roster-dots">
          {heroes.map((h, i) => (
            <button
              key={h.id}
              type="button"
              className={`hero-roster-dot ${i === index ? 'active' : ''}`}
              aria-label={`Show ${h.name}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(HeroGallery)
