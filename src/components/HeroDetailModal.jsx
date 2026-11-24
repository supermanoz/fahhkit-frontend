/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconBolt,
  IconBook,
  IconSparkle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconInfo,
  IconLock,
} from './GameIcons'
import HeroFigure from './HeroFigure'
import HeroStage from './HeroStage'
import EmoteGlyph from './EmoteGlyph'
import { getHeroSprite } from '../utils/heroSprites'
import { heroAbilityParts, heroRoleLabel } from '../utils/hero'
import { describePerk } from '../utils/heroPerks'
import { Modal } from '../game/ui/Panel'
import GameButton from '../game/ui/GameButton'
import { getHeroAccent } from '../utils/heroAccent'
import { resolveHeroEquipState } from '../utils/heroEquipState'
import {
  getItemState,
  isFreeItem,
  isUsableState,
  visibleStoreError,
} from '../utils/itemState'
import { PriceLabel } from './Price'
import {
  filterVisibleEmotes,
  resolveEmoteAsset,
  resolveEquippedEmoteItem,
} from '../utils/emotes'
import './heroLocked.css'
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
function HeroEmoteStage({
  hero,
  sprite,
  ownedItems,
  onShowcase,
  // Level-locked hero: every emote shows locked and can't be opened/bought
  // (the backend wants the hero owned first).
  levelLocked = false,
  // Not owned (any reason): the shared locked look - shaded static art on a
  // matching dimmed stage (heroLocked.css). Nothing animates while locked.
  heroLocked = false,
}) {
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

  // heroManifest.js's resolveManifest sets emotes.emote1 to this exact
  // same object (not a copy) as poses.idle, so comparing by reference
  // here (rather than a `.src`/url field - sheets-pack assets have no
  // single src, see utils/emotes.js) still works regardless of which
  // naming scheme a given hero's backend rows use.
  const idlePose = sprite?.poses?.idle
  // filterVisibleEmotes drops this hero's hidden emotes (see
  // HIDDEN_EMOTES in emotes.js) before any slide/dot/count is built, so
  // they never occupy a slot at all - not even a locked one.
  const emoteItems = filterVisibleEmotes(
    hero.name,
    (hero.skins || []).filter((item) => item.category === 'EMOTE')
  )
  const isIdleAlias = (item) =>
    Boolean(idlePose) && resolveEmoteAsset(hero.name, item.name) === idlePose
  // The one shared selector every "which emote is equipped" screen uses -
  // reads straight off ownedItems (refreshed by GamePage's loadStore after
  // every equip/unequip, and reloaded fresh from the backend on every app
  // start), so each slide's badge below updates the moment an equip call
  // resolves, with nothing extra to wire up, and is still correct after a
  // refresh since there's no separate local "equipped" state to go stale.
  // No ignoreHidden here (unlike GamePage.jsx's Me tab and
  // AthleteTerritoryProfilePanel.jsx, which display an already-equipped
  // pick) - this slider never shows a hidden emote's own slide, so a
  // hidden-but-still-equipped one should resolve to null here, falling
  // the idle slide back to "equipped" on its own.
  const equippedItem = resolveEquippedEmoteItem(
    ownedItems.filter((o) => o.equipped).map((o) => o.storeItem),
    hero.id,
    hero.name
  )
  const idleAliasItem = emoteItems.find(isIdleAlias)
  const emoteSlides = emoteItems
    .filter((item) => !isIdleAlias(item))
    .map((item) => ({
      kind: 'emote',
      item,
      owned:
        !levelLocked &&
        isUsableState(
          getItemState(item, ownedItems, {
            equipped: equippedItem?.id === item.id,
          })
        ),
      equipped: !levelLocked && equippedItem?.id === item.id,
    }))
  // No hero currently has a real "emote1" StoreItem row to find here - the
  // 4 newest heroes never got one created (it's free, nothing to buy), and
  // an older hero's "Classic" row (if it still exists under that name)
  // can't be name-matched against the renamed manifest keys any more (see
  // resolveEmoteAsset: a hero WITH a manifest never falls through to the
  // alias-name check at all, only an unknown hero does) - idleAliasItem
  // above is effectively always undefined in practice. Falls back to a
  // virtual item (id: null - GamePage.jsx's onEquip checks for this and
  // unequips whatever else is active instead of calling the API with a
  // fake id) so the slide/popup still work correctly either way: "idle is
  // equipped" means nothing ELSE is currently equipped for this hero, and
  // "Equip" means clearing that, not equipping a specific row.
  const idleItem = idleAliasItem || {
    id: null,
    name: 'Emote1',
    heroId: hero.id,
    category: 'EMOTE',
    priceFahhcoin: 0,
  }
  const slides = [
    {
      kind: 'idle',
      item: idleItem,
      owned: true,
      // Idle/Classic is the default: equipped when nothing else is.
      equipped: !equippedItem || equippedItem.id === idleAliasItem?.id,
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
        className={`hero-modal-stage ${sprite ? '' : 'is-flat'} ${heroLocked ? 'is-hero-locked' : ''}`}
      >
        <HeroStage hero={hero.name} className="hero-modal-stage-bg" fullBleed>
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={index}
              custom={direction}
              variants={emoteFlipVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
              style={{
                width: '100%',
                height: '100%',
                transformPerspective: 900,
              }}
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
                // Idle counts too now (it carries the real "emote1" item
                // when one exists - see its `item` above) - it used to be
                // excluded entirely, so tapping it silently did nothing and
                // there was no way to ever open its Equip button.
                if (slide.item && !levelLocked)
                  onShowcase(
                    slide.kind === 'idle'
                      ? { ...slide.item, isIdleSlide: true }
                      : slide.item
                  )
              }}
            >
              {/* Idle only - Hip Hop (or whatever a hero's own emote2 is) is
                a purchasable emote (see heroManifest.js: it's under this
                hero's `emotes`, not `poses`), so the idle slide itself
                can't free-preview anything past idle. */}
              <span
                className={`hero-emote-slide-figure ${slide.kind === 'emote' && !slide.owned ? 'is-locked' : ''}`}
              >
                {slide.kind === 'idle' ? (
                  <HeroFigure
                    hero={hero}
                    pose="idle"
                    height={spriteHeight}
                    locked={heroLocked}
                  />
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
                    active={!heroLocked}
                  />
                )}
                {slide.kind === 'emote' && !slide.owned && (
                  <span className="hero-emote-lock-badge" aria-hidden="true">
                    <IconLock />
                  </span>
                )}
                {/* The hero (idle) slide never shows an equipped mark - the
                  hero looks the same equipped or not; that state lives on
                  the Equip button + chip below. An equipped emote keeps its
                  small check symbol. */}
                {slide.kind === 'emote' && slide.equipped && (
                  <span
                    className="hero-emote-equipped-badge"
                    role="img"
                    aria-label="Equipped"
                  >
                    <IconCheck aria-hidden="true" />
                  </span>
                )}
              </span>
            </motion.div>
          </AnimatePresence>
        </HeroStage>

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
// emotes. Rendered at page level by GamePage (inside AnimatePresence) so the
// fixed overlay isn't trapped by the menu's transforms.
export default function HeroDetailModal({
  hero,
  ownedItems,
  activeHeroId,
  isActive,
  // The player's current level (profile.level), for unlockLevel gating.
  level,
  error,
  onClose,
  onEquip,
  onBuy,
  onShowcase,
}) {
  const sprite = getHeroSprite(hero.name)
  const { ownedHeroItem, claimable, state, levelLocked, unlockLevel, locked } =
    resolveHeroEquipState(hero, ownedItems, activeHeroId, level)
  // The hero-unlock item itself - mixed into `hero.skins` (the backend's
  // field name for every active store item tied to this hero, categories
  // and all) alongside his emotes (see the `emoteItems` filter above), not
  // owned yet if `ownedHeroItem` is null. Buying/equipping this is what the
  // gallery card's own "Unlock"/price label and Equip button promise - this
  // modal had no matching action at all before, so tapping "Unlock" landed
  // here with nothing to actually unlock the hero.
  const heroItem = (hero.skins || []).find((item) => item.category === 'HERO')

  // Equip flips the button + chip right away; onEquip (GamePage.handleEquip)
  // resolves only after the API call and the store reload, so without this
  // the modal would sit on "Equip" for that whole round trip. Reset in
  // `finally`: on success `isActive` has caught up by then, on failure it
  // hasn't and the button reverts (handleEquip already toasts the error).
  const [equipping, setEquipping] = useState(false)
  const showEquipped = isActive || state === 'equipped' || equipping
  async function handleEquipTap() {
    if (equipping || !heroItem || !(ownedHeroItem || claimable)) return
    setEquipping(true)
    try {
      await onEquip(heroItem, Boolean(ownedHeroItem?.equipped), {
        claim: claimable,
      })
    } finally {
      setEquipping(false)
    }
  }

  // The perk popup (opened from the Perk panel below). Escape closes just the
  // popup: the hero card's own Escape handler ignores the key while it is
  // open - and for a beat after, since the popup's handler (document) runs
  // first and its re-render would otherwise let this one see it as closed.
  const [perkId, setPerkId] = useState(null)
  const perkOpenRef = useRef(false)
  const perkClosedAtRef = useRef(0)
  perkOpenRef.current = perkId != null
  function closePerk() {
    perkClosedAtRef.current = Date.now()
    setPerkId(null)
  }
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (perkOpenRef.current || Date.now() - perkClosedAtRef.current < 200)
        return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lore starts clamped to 4 lines (.hero-modal-lore) with a fade at the
  // bottom - "Read more" only shows when the text really overflows that, so a
  // short backstory never gets a pointless toggle. Expanding animates
  // max-height to the measured full height (a fresh HeroDetailModal instance
  // per hero - see GamePage.jsx's key={selectedHero.id} - resets it).
  const loreRef = useRef(null)
  const [loreExpanded, setLoreExpanded] = useState(false)
  const [loreOverflows, setLoreOverflows] = useState(false)
  const [loreFullHeight, setLoreFullHeight] = useState(null)
  const backstory = (hero.backstory || '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
  useLayoutEffect(() => {
    const el = loreRef.current
    if (!el) return undefined
    const measure = () => {
      setLoreFullHeight(el.scrollHeight)
      // Collapsed height is 4 lines (6em) - overflow means there is more.
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24
      setLoreOverflows(el.scrollHeight > lineHeight * 4 + 2)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [backstory])

  const { accent, soft } = getHeroAccent(hero.name)
  const role = heroRoleLabel(hero.abilities)
  const isDefaultHero =
    heroItem != null && isFreeItem(heroItem) && heroItem.unlockLevel == null
  const owned = !levelLocked && (Boolean(ownedHeroItem) || claimable)

  const abilities = (hero.abilities || [])
    .map((a) => ({
      id: a.id,
      ...heroAbilityParts(a),
      // Plain-language explanation (utils/heroPerks.js); null if there is none.
      perk: describePerk(a, hero.abilities),
    }))
    .filter((a) => a.label)
  const openPerk = abilities.find((a) => a.id === perkId)?.perk || null
  // Where this hero stands, for the popup's "is it working?" line.
  const perkStatus = levelLocked
    ? {
        tone: 'locked',
        chip: `Locked until level ${unlockLevel}`,
        hint: `Reach level ${unlockLevel} to unlock this hero, then equip it to use this perk.`,
      }
    : showEquipped
      ? {
          tone: 'on',
          chip: 'Equipped',
          hint: 'This perk is working on your runs.',
        }
      : {
          tone: 'off',
          chip: 'Not equipped',
          hint: owned
            ? 'Equip this hero to use it.'
            : 'Unlock this hero, then equip it to use this perk.',
        }

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
        style={{ '--hero-accent': accent, '--hero-accent-soft': soft }}
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
          levelLocked={levelLocked}
          heroLocked={locked}
        />

        <div className="hero-modal-body">
          <header
            className="hero-modal-header hero-reveal"
            style={{ '--i': 0 }}
          >
            <h2 className="hero-modal-name">{hero.name}</h2>
            <span className="hero-modal-ribbon" aria-hidden="true" />
            {hero.tagline && (
              <p className="hero-modal-tagline">
                <span className="hero-modal-quote" aria-hidden="true">
                  “
                </span>
                {hero.tagline}
                <span className="hero-modal-quote" aria-hidden="true">
                  ”
                </span>
              </p>
            )}
            <div className="hero-modal-chips">
              {role && <span className="hero-modal-chip is-role">{role}</span>}
              {isDefaultHero && (
                <span className="hero-modal-chip">Default hero</span>
              )}
              {hero.limited && !owned && (
                <span className="hero-modal-chip">Limited</span>
              )}
              {showEquipped ? (
                <span
                  className="hero-modal-chip is-equipped"
                  data-testid="hero-equipped-chip"
                >
                  <IconCheck aria-hidden="true" /> Equipped
                </span>
              ) : owned ? (
                <span
                  className="hero-modal-chip is-owned"
                  data-testid="hero-owned-chip"
                >
                  <IconCheck aria-hidden="true" /> Owned
                </span>
              ) : null}
              {levelLocked && (
                <span
                  className="hero-modal-chip is-locked"
                  data-testid="hero-level-chip"
                >
                  <IconLock aria-hidden="true" /> Unlocks at level {unlockLevel}
                </span>
              )}
            </div>
          </header>

          <section
            className="hero-modal-section hero-reveal"
            style={{ '--i': 1 }}
            aria-labelledby="hero-perk-title"
          >
            <h3 className="hero-modal-heading" id="hero-perk-title">
              <IconBolt aria-hidden="true" /> Perk
            </h3>
            {abilities.length > 0 ? (
              <ul className="hero-modal-stats">
                {abilities.map((a) => {
                  const bar = (
                    <span className="hero-modal-stat-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.max(Math.min(a.pct / STAT_BAR_MAX_PCT, 1) * 100, 6)}%`,
                        }}
                      />
                    </span>
                  )
                  // A perk with an explanation is a button: the whole row is
                  // the (44px+) tap target for the popup.
                  if (a.perk) {
                    return (
                      <li key={a.id} className="has-perk">
                        <button
                          type="button"
                          className="hero-perk-btn"
                          aria-haspopup="dialog"
                          aria-label={`${a.perk.name}, ${a.sign}${a.pct}%. ${a.perk.summary} Tap to learn more.`}
                          onClick={() => setPerkId(a.id)}
                        >
                          <span className="hero-modal-stat-label">
                            {a.label}
                            <IconInfo
                              className="hero-perk-info"
                              aria-hidden="true"
                            />
                          </span>
                          <span className="hero-modal-stat-value">
                            {a.sign}
                            {a.pct}%
                            <IconChevronRight
                              className="hero-perk-chev"
                              aria-hidden="true"
                            />
                          </span>
                          {bar}
                          <span className="hero-perk-summary">
                            {a.perk.summary}
                          </span>
                        </button>
                      </li>
                    )
                  }
                  return (
                    <li key={a.id}>
                      <span className="hero-modal-stat-label">{a.label}</span>
                      <span className="hero-modal-stat-value">
                        {a.sign}
                        {a.pct}%
                      </span>
                      {bar}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="hero-modal-muted">
                <IconSparkle aria-hidden="true" /> Pure style, no perks - they
                run on vibes alone.
              </p>
            )}
          </section>

          <section
            className="hero-modal-section hero-reveal"
            style={{ '--i': 2 }}
            aria-labelledby="hero-lore-title"
          >
            <h3 className="hero-modal-heading" id="hero-lore-title">
              <IconBook aria-hidden="true" /> Lore
            </h3>
            {backstory ? (
              <>
                <div
                  className={`hero-modal-lore-wrap${loreOverflows && !loreExpanded ? ' is-faded' : ''}`}
                >
                  <p
                    ref={loreRef}
                    className={`hero-modal-lore${loreExpanded ? ' is-expanded' : ''}`}
                    style={
                      loreExpanded && loreFullHeight
                        ? { maxHeight: `${loreFullHeight}px` }
                        : undefined
                    }
                  >
                    {backstory}
                  </p>
                </div>
                {loreOverflows && (
                  <button
                    type="button"
                    className="hero-modal-lore-toggle"
                    aria-expanded={loreExpanded}
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
          </section>
        </div>

        {(heroItem || showEquipped || visibleStoreError(error, state)) && (
          <div className="hero-modal-actionbar">
            {visibleStoreError(error, state) && (
              <p className="hero-modal-error">
                {visibleStoreError(error, state)}
              </p>
            )}
            {(heroItem || showEquipped) &&
              (levelLocked ? (
                <button
                  type="button"
                  className="hero-action-btn is-grey"
                  data-testid="hero-action"
                  disabled
                  aria-disabled="true"
                >
                  <IconLock aria-hidden="true" /> Reach level {unlockLevel} to
                  unlock
                </button>
              ) : showEquipped ? (
                <button
                  type="button"
                  className="hero-action-btn is-neutral"
                  data-testid="hero-action"
                  disabled
                  aria-disabled="true"
                >
                  <IconCheck aria-hidden="true" /> Equipped
                </button>
              ) : ownedHeroItem || claimable ? (
                <button
                  type="button"
                  className="hero-action-btn is-green"
                  data-testid="hero-action"
                  onClick={handleEquipTap}
                >
                  Equip
                </button>
              ) : hero.limited ? (
                <button
                  type="button"
                  className="hero-action-btn is-grey"
                  data-testid="hero-action"
                  disabled
                  aria-disabled="true"
                >
                  <IconLock aria-hidden="true" /> Not available yet
                </button>
              ) : (
                <button
                  type="button"
                  className="hero-action-btn is-green"
                  data-testid="hero-action"
                  onClick={() => onBuy(heroItem)}
                >
                  {heroItem.priceFahhcoin > 0 ? (
                    <PriceLabel
                      label="Unlock for"
                      amount={heroItem.priceFahhcoin}
                    />
                  ) : (
                    'Unlock free'
                  )}
                </button>
              ))}
          </div>
        )}
      </motion.div>

      {/* Perk explanation. Inside the overlay (so it stacks above the card),
          wrapped so taps in it never close the hero card behind. */}
      {openPerk && (
        <div
          className="hero-perk-host"
          style={{ '--hero-accent': accent, '--hero-accent-soft': soft }}
          onClick={(e) => e.stopPropagation()}
        >
          <Modal title={openPerk.name} onClose={closePerk}>
            <div className="hero-perk-pop">
              <p
                className="hero-perk-value"
                aria-label={`${openPerk.sign}${openPerk.pct} percent`}
              >
                {openPerk.valueText}
              </p>
              <p className="hero-perk-sentence">{openPerk.sentence}</p>
              {openPerk.note && (
                <p className="hero-perk-note">{openPerk.note}</p>
              )}
              <p className="hero-perk-example">
                <span className="hero-perk-eg">Example</span> {openPerk.example}
              </p>
              <div className="hero-perk-where">
                <span className="hero-perk-where-label">Works in</span>
                <ul className="hero-perk-chips">
                  {openPerk.where.map((mode) => (
                    <li key={mode} className="hero-perk-chip">
                      {mode}
                    </li>
                  ))}
                </ul>
              </div>
              <p className={`hero-perk-status is-${perkStatus.tone}`}>
                {perkStatus.tone === 'locked' ? (
                  <IconLock aria-hidden="true" />
                ) : perkStatus.tone === 'on' ? (
                  <IconCheck aria-hidden="true" />
                ) : (
                  <IconBolt aria-hidden="true" />
                )}
                {perkStatus.chip}
              </p>
              <p className="hero-perk-hint">{perkStatus.hint}</p>
              <GameButton
                variant="success"
                size="lg"
                className="g-full-width"
                onClick={closePerk}
              >
                OK
              </GameButton>
            </div>
          </Modal>
        </div>
      )}
    </motion.div>
  )
}
