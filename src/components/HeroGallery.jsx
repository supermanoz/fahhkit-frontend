/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
} from './GameIcons'
import HeroFigure from './HeroFigure'
import { getHeroSprite } from '../utils/heroSprites'
import './HeroGallery.css'

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

export default function HeroGallery({
  heroes,
  ownedItems,
  activeHeroId,
  loading,
  onSelect,
}) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const [hovered, setHovered] = useState(false)
  const draggedRef = useRef(false)

  // Keep a valid index if the roster shrinks (or loads in) under us.
  useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(heroes.length - 1, i)))
  }, [heroes.length])

  function goTo(nextIndex) {
    const clamped = Math.max(0, Math.min(heroes.length - 1, nextIndex))
    if (clamped === index) return
    setDirection(clamped > index ? 1 : -1)
    setIndex(clamped)
    setHovered(false)
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
    return <p className="game-menu-empty">Summoning the heroes…</p>
  }
  if (heroes.length === 0) {
    return (
      <p className="game-menu-empty">
        No heroes have answered the call yet. Check back soon!
      </p>
    )
  }

  const hero = heroes[index]
  const equipped = hero.id === activeHeroId
  const owned = ownedItems.some((o) => o.storeItem.heroId === hero.id)
  const comingSoon = !equipped && !owned && hero.skins?.length === 0
  const animated = Boolean(getHeroSprite(hero.name))
  const prices = (hero.skins || [])
    .map((sk) => sk.priceFahhcoin || 0)
    .filter((n) => n > 0)
  const fromPrice = prices.length ? Math.min(...prices) : 0
  // 'soon' (no skin released yet) stays its own tier for the grayscale
  // look, and 'limited' (event/reward heroes, e.g. Blaze) keeps its art in
  // colour - both just read "Limited" to the player (see hero-card-foot
  // below), since "coming soon" over-promised a release date.
  const tier = equipped
    ? 'equipped'
    : owned
      ? 'owned'
      : comingSoon
        ? 'soon'
        : hero.limited
          ? 'limited'
          : 'locked'

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
              className={`hero-card tier-${tier} ${animated ? 'is-animated' : ''}`}
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
              onPointerEnter={() => setHovered(true)}
              onPointerLeave={() => setHovered(false)}
              onFocus={() => setHovered(true)}
              onBlur={() => setHovered(false)}
            >
              <span className="hero-card-stage">
                <HeroFigure
                  hero={hero}
                  pose={hovered ? 'hiphop' : 'idle'}
                  height={240}
                />
              </span>

              <span className="hero-card-name">{hero.name}</span>

              {tier === 'soon' || tier === 'limited' ? (
                <span className="hero-card-foot is-locked">
                  <IconLock />
                  <span>Limited</span>
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
