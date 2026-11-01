/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconLock,
} from './GameIcons'
import HeroFigure from './HeroFigure'
import EmoteGlyph from './EmoteGlyph'
import { resolveFileUrl } from '../api/client'
import { getHeroSprite } from '../utils/heroSprites'
import { heroAbilityParts } from '../utils/hero'
import { resolveHeroEquipState } from '../utils/heroEquipState'
import { resolveEmoteAsset, resolveEquippedEmoteItem } from '../utils/emotes'
import './HeroDetailModal.css'

// Stat bars fill against this boost - no hero perk goes near it, so a +10%
// still reads as a solid chunk instead of a sliver.
const STAT_BAR_MAX_PCT = 25

// Same thresholds/variants as HeroGallery's own hero roster (see there) -
// deliberately not shared as one generic component: the slide content and
// actions here (emote ownership, a showcase popup) are different enough
// from a hero card (equip/buy) that threading both through one shell would
// cost more than the ~80 lines this duplicates.
const EMOTE_DRAG_DISTANCE_THRESHOLD = 60
const EMOTE_DRAG_VELOCITY_THRESHOLD = 500
const EMOTE_DRAG_CLICK_THRESHOLD = 10
const emoteFlipVariants = {
  enter: (dir) => ({ rotateY: dir >= 0 ? 90 : -90, opacity: 0 }),
  center: { rotateY: 0, opacity: 1 },
  exit: (dir) => ({ rotateY: dir >= 0 ? -90 : 90, opacity: 0 }),
}

// The hero showcase's own slider: idle (always first, always unlocked - a
// free preview regardless of ownership, same as the old static stage
// always showed), then this hero's real EMOTE StoreItems one at a time.
// Idle-alias entries (old heroes' "Classic", new heroes' "emote1" - see
// scripts/build_<hero>_stretch_strips.py) are left out of that list by
// comparing resolved art src, not name, so it works regardless of which
// naming scheme a given hero's backend rows still use. An unowned emote
// (or one with no art built yet - EmoteGlyph's own lock fallback covers
// that) renders dimmed with a lock badge, frozen on its first frame
// (EmoteGlyph only animates the `active` instance); tapping it opens the
// same buy/showcase popup the old Shop Emotes tab used.
function HeroEmoteStage({ hero, sprite, ownedItems, onShowcase }) {
  const stageRef = useRef(null)
  const [stageHeight, setStageHeight] = useState(0)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) =>
      setStageHeight(entry.contentRect.height)
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const spriteHeight = stageHeight ? Math.round(stageHeight * 0.875) : 190

  const idleSrc = sprite?.poses?.idle?.src
  const emoteItems = (hero.skins || []).filter(
    (item) => item.category === 'EMOTE'
  )
  const isIdleAlias = (item) =>
    resolveEmoteAsset(hero.name, item.name)?.src === idleSrc
  // The one shared selector every "which emote is equipped" screen uses
  // (also GamePage.jsx's Me tab and AthleteTerritoryProfilePanel.jsx) -
  // reads straight off ownedItems (refreshed by GamePage's loadStore after
  // every equip/unequip, and reloaded fresh from the backend on every app
  // start), so each slide's badge below updates the moment an equip call
  // resolves, with nothing extra to wire up, and is still correct after a
  // refresh since there's no separate local "equipped" state to go stale.
  const equippedItem = resolveEquippedEmoteItem(
    ownedItems.filter((o) => o.equipped).map((o) => o.storeItem),
    hero.id
  )
  const idleAliasItem = emoteItems.find(isIdleAlias)
  const emoteSlides = emoteItems
    .filter((item) => !isIdleAlias(item))
    .map((item) => ({
      kind: 'emote',
      item,
      owned: ownedItems.some((o) => o.storeItem.id === item.id),
      equipped: equippedItem?.id === item.id,
    }))
  const slides = [
    {
      kind: 'idle',
      equipped: idleAliasItem ? equippedItem?.id === idleAliasItem.id : false,
    },
    ...emoteSlides,
  ]

  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const draggedRef = useRef(false)

  function goTo(nextIndex) {
    const clamped = Math.max(0, Math.min(slides.length - 1, nextIndex))
    if (clamped === index) return
    setDirection(clamped > index ? 1 : -1)
    setIndex(clamped)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') goTo(index - 1)
      else if (e.key === 'ArrowRight') goTo(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slides.length])

  function handleDragEnd(_, info) {
    if (
      Math.abs(info.offset.x) > EMOTE_DRAG_CLICK_THRESHOLD ||
      Math.abs(info.velocity.x) > EMOTE_DRAG_VELOCITY_THRESHOLD
    ) {
      draggedRef.current = true
    }
    if (
      info.offset.x < -EMOTE_DRAG_DISTANCE_THRESHOLD ||
      info.velocity.x < -EMOTE_DRAG_VELOCITY_THRESHOLD
    ) {
      goTo(index + 1)
    } else if (
      info.offset.x > EMOTE_DRAG_DISTANCE_THRESHOLD ||
      info.velocity.x > EMOTE_DRAG_VELOCITY_THRESHOLD
    ) {
      goTo(index - 1)
    }
  }

  const slide = slides[Math.min(index, slides.length - 1)]
  const slideLabel =
    slide.kind === 'emote' && !slide.owned
      ? 'Locked emote'
      : `Emote ${index + 1} of ${slides.length}`

  return (
    <>
      <div
        ref={stageRef}
        className={`hero-modal-stage ${sprite ? '' : 'is-flat'}`}
      >
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div
            key={index}
            custom={direction}
            variants={emoteFlipVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
            style={{ width: '100%', height: '100%', transformPerspective: 900 }}
            className="hero-emote-slide"
            role="group"
            aria-label={slideLabel}
            drag={slides.length > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragStart={() => {
              draggedRef.current = false
            }}
            onDragEnd={handleDragEnd}
            onClick={() => {
              if (draggedRef.current) {
                draggedRef.current = false
                return
              }
              if (slide.kind === 'emote') onShowcase(slide.item)
            }}
          >
            {/* Idle only - Hip Hop (or whatever a hero's own emote2 is) is
                a purchasable emote (see heroManifest.js: it's under this
                hero's `emotes`, not `poses`), so the idle slide itself
                can't free-preview anything past idle. */}
            <span
              className={`hero-emote-slide-figure ${slide.kind === 'emote' && !slide.owned ? 'is-locked' : ''} ${slide.equipped ? 'is-equipped' : ''}`}
            >
              {slide.kind === 'idle' ? (
                <HeroFigure hero={hero} pose="idle" height={spriteHeight} />
              ) : (
                // Plays regardless of ownership - only the current slide is
                // ever mounted at all (AnimatePresence swaps one slide at a
                // time, see above), so there's no "every tile animating at
                // once" cost here the way a grid has (that's what
                // EmoteGlyph's `active` gate was originally built to avoid
                // - see its own comment). Locked is communicated by the
                // lock badge + a light dim below, not a frozen frame.
                <EmoteGlyph
                  heroName={hero.name}
                  emoteName={slide.item.name}
                  size={spriteHeight}
                  active
                />
              )}
              {slide.kind === 'emote' && !slide.owned && (
                <span className="hero-emote-lock-badge" aria-hidden="true">
                  <IconLock />
                </span>
              )}
              {slide.equipped && (
                <span
                  className="hero-emote-equipped-badge"
                  role="img"
                  aria-label="Equipped"
                >
                  <IconCheck aria-hidden="true" />
                </span>
              )}
              {/* Owned but not the active one - nothing else on the slide
                  said "you already bought this, tap to equip it" (the lock
                  badge only covers the unowned case). Purely informational;
                  tapping the slide already opens the showcase popup with
                  the real Equip button either way, same as before. */}
              {slide.kind === 'emote' && slide.owned && !slide.equipped && (
                <span className="hero-emote-available-badge">Equip</span>
              )}
            </span>
          </motion.div>
        </AnimatePresence>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              className="hero-roster-arrow hero-emote-arrow is-prev"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous emote"
            >
              <IconChevronLeft />
            </button>
            <button
              type="button"
              className="hero-roster-arrow hero-emote-arrow is-next"
              onClick={() => goTo(index + 1)}
              disabled={index === slides.length - 1}
              aria-label="Next emote"
            >
              <IconChevronRight />
            </button>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div className="hero-roster-dots hero-emote-dots">
          {slides.map((s, i) => (
            <button
              key={s.kind === 'idle' ? 'idle' : s.item.id}
              type="button"
              // A dot is too small (8px) for the 24px+ check badge the
              // slide itself gets - green fill is this dot's own version
              // of the same "equipped" signal, distinct from .active
              // (which just means "this is the slide on screen right now"
              // - the two can agree or not).
              className={`hero-roster-dot ${i === index ? 'active' : ''} ${s.equipped ? 'is-equipped' : ''}`}
              aria-label={
                (s.kind === 'idle' ? 'Show idle' : `Show emote ${i}`) +
                (s.equipped ? ', equipped' : '')
              }
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </>
  )
}

// A hero's codex page: big animated figure, stats (score perks), lore and
// skins. Rendered at page level by GamePage (inside AnimatePresence) so the
// fixed overlay isn't trapped by the menu's transforms.
export default function HeroDetailModal({
  hero,
  ownedItems,
  activeHeroId,
  isActive,
  error,
  onClose,
  onEquip,
  onBuy,
  onShowcase,
}) {
  const sprite = getHeroSprite(hero.name)
  const { ownedHeroItem } = resolveHeroEquipState(
    hero,
    ownedItems,
    activeHeroId
  )
  // The hero-unlock item itself - mixed into `hero.skins` alongside his
  // real skins/emotes (see the `skins` filter below), not owned yet if
  // `ownedHeroItem` is null. Buying/equipping this (not a skin) is what
  // the gallery card's own "Unlock"/price label and Equip button promise -
  // this modal had no matching action at all before, so tapping "Unlock"
  // landed on Stats/Lore/Skins with nothing to actually unlock the hero.
  const heroItem = (hero.skins || []).find((item) => item.category === 'HERO')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lore starts clamped to ~3 lines (see .hero-modal-lore's max-height) -
  // "Read more" only shows up if the text actually overflows that clamp,
  // so a short backstory never gets a pointless toggle. Re-measured
  // whenever the backstory text itself changes (a fresh HeroDetailModal
  // instance per hero - see GamePage.jsx's key={selectedHero.id} - already
  // resets loreExpanded to its default on its own).
  const loreRef = useRef(null)
  const [loreExpanded, setLoreExpanded] = useState(false)
  const [loreOverflows, setLoreOverflows] = useState(false)
  useLayoutEffect(() => {
    const el = loreRef.current
    if (!el) return
    setLoreOverflows(el.scrollHeight - el.clientHeight > 1)
  }, [hero.backstory])

  // Skins starts collapsed, same "less dominant" goal as Lore's clamp -
  // the hero figure above is the point of this screen now, not a scroll
  // of secondary lists.
  const [skinsOpen, setSkinsOpen] = useState(false)

  const abilities = (hero.abilities || [])
    .map((a) => ({ id: a.id, ...heroAbilityParts(a) }))
    .filter((a) => a.label)
  // The backend's "skins" field is really every active store item tied to
  // this hero (findByHeroAndActiveTrue has no category filter of its own),
  // so it mixes in the hero-unlock item itself, his emotes (see
  // HeroEmoteStage above) and real skins together - filtered down to just
  // SKIN here so this section doesn't show either of the other two as a
  // "skin" card.
  const skins = (hero.skins || []).filter((item) => item.category === 'SKIN')

  return (
    <motion.div
      className="game-confirm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="hero-modal"
        role="dialog"
        aria-modal="true"
        aria-label={hero.name}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="game-close-btn game-run-viewer-close hero-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>

        <HeroEmoteStage
          hero={hero}
          sprite={sprite}
          ownedItems={ownedItems}
          onShowcase={onShowcase}
        />

        <div className="hero-modal-body">
          <h2 className="hero-modal-name">
            {hero.name}
            {isActive && <span className="hero-modal-active">Your hero</span>}
          </h2>
          {hero.tagline && (
            <p className="hero-modal-tagline">“{hero.tagline}”</p>
          )}

          {heroItem && !isActive && (
            <div className="hero-modal-unlock">
              {ownedHeroItem ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onEquip(heroItem, ownedHeroItem.equipped)}
                >
                  <IconCheck /> Equip
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onBuy(heroItem)}
                  // Limited heroes can't be bought (server rejects with
                  // HERO_LIMITED) - same guard the skins section below uses.
                  disabled={hero.limited}
                >
                  {hero.limited
                    ? 'Not for sale'
                    : heroItem.priceFahhcoin > 0
                      ? `Unlock for ${heroItem.priceFahhcoin} Fahhcoin`
                      : 'Unlock free'}
                </button>
              )}
            </div>
          )}

          <h3 className="hero-modal-heading">Stats</h3>
          {abilities.length > 0 ? (
            <ul className="hero-modal-stats">
              {abilities.map((a) => (
                <li key={a.id}>
                  <span className="hero-modal-stat-label">
                    <IconBolt aria-hidden="true" /> {a.label}
                  </span>
                  <span className="hero-modal-stat-value">
                    {a.sign}
                    {a.pct}%
                  </span>
                  <span className="hero-modal-stat-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(a.pct / STAT_BAR_MAX_PCT, 1) * 100}%`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hero-modal-muted">
              Pure style, no perks - they run on vibes alone.
            </p>
          )}

          <h3 className="hero-modal-heading">Lore</h3>
          {hero.backstory ? (
            <>
              <p
                ref={loreRef}
                className={`hero-modal-lore${loreExpanded ? ' is-expanded' : ''}`}
              >
                {hero.backstory}
              </p>
              {loreOverflows && (
                <button
                  type="button"
                  className="hero-modal-lore-toggle"
                  onClick={() => setLoreExpanded((v) => !v)}
                >
                  {loreExpanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </>
          ) : (
            <p className="hero-modal-muted">
              Their story is still being written… one lap at a time.
            </p>
          )}

          <button
            type="button"
            className={`hero-modal-section-toggle${skinsOpen ? ' is-open' : ''}`}
            onClick={() => setSkinsOpen((v) => !v)}
            aria-expanded={skinsOpen}
          >
            <h3 className="hero-modal-heading">Skins</h3>
            <IconChevronDown />
          </button>
          <div className={`hero-modal-collapse${skinsOpen ? ' is-open' : ''}`}>
            <div>
              {skins.length === 0 ? (
                <p className="hero-modal-muted">Arriving in the shop soon.</p>
              ) : (
                <ul className="hero-modal-skins">
                  {skins.map((skin) => {
                    const owned = ownedItems.find(
                      (o) => o.storeItem.id === skin.id
                    )
                    return (
                      <li key={skin.id}>
                        <span className="hero-modal-skin-swatch">
                          {skin.assetUrl && (
                            <img
                              src={resolveFileUrl(skin.assetUrl)}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          )}
                        </span>
                        <span className="hero-modal-skin-name">
                          {skin.name}
                        </span>
                        {owned ? (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => onEquip(skin, owned.equipped)}
                          >
                            {owned.equipped ? (
                              'Unequip'
                            ) : (
                              <>
                                <IconCheck /> Equip
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => onBuy(skin)}
                            // Limited heroes can't be bought (server
                            // rejects with HERO_LIMITED) - reserved for
                            // events/rewards.
                            disabled={hero.limited}
                          >
                            {hero.limited
                              ? 'Not for sale'
                              : skin.priceFahhcoin > 0
                                ? `${skin.priceFahhcoin} Fahhcoin`
                                : 'Free'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
          {error && <p className="hero-modal-error">{error}</p>}
        </div>
      </motion.div>
    </motion.div>
  )
}
