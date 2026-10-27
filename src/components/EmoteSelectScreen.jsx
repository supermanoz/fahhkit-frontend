/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useMemo, useState } from 'react'
import { IconChevronLeft, IconClose, IconLock } from './GameIcons'
import EmoteGlyph from './EmoteGlyph'
import { getEmoteRarity, getEmoteFlavorText } from '../utils/emoteRarity'
import { loadSeenEmoteIds, markEmotesSeen } from '../utils/seenEmotes'
import './EmoteSelectScreen.css'

// Fortnite-locker-style redesign of the per-hero emote grid (see
// HeroItemShelf.jsx's `renderGrid` override, wired up by EmoteShelf.jsx) -
// only swapped in once the hero itself is owned (HeroItemShelf still shows
// the plain locked grid otherwise, same as before this existed). Matches
// the real Fortnite locker's own behavior, not just its look: tapping an
// OWNED tile selects AND equips it right here, no separate screen (same
// as tapping any owned tile in the old plain grid did); tapping a LOCKED
// one opens the full-screen showcase instead (EmoteShowcase.jsx, via
// `onView`) to preview/buy it - arrow-key navigation only moves the
// preview/detail-card selection, it never equips anything by itself.
export default function EmoteSelectScreen({
  hero,
  items,
  ownedItems,
  onEquip,
  onView,
  onBack,
}) {
  function ownedOf(item) {
    return ownedItems.find((o) => o.storeItem.id === item.id)
  }

  // Frozen for as long as this hero's screen stays mounted - a pure read
  // (see loadSeenEmoteIds's own comment on why marking them seen is a
  // separate effect below, not done here).
  const newIds = useMemo(() => {
    const seen = loadSeenEmoteIds()
    return new Set(items.filter((i) => !seen.has(i.id)).map((i) => i.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero.id])

  // Marks this visit's ids seen for next time, once per hero mount - after
  // newIds above has already captured which ones were new for this one.
  useEffect(() => {
    markEmotesSeen(items.map((i) => i.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero.id])

  const defaultId =
    items.find((i) => ownedOf(i)?.equipped)?.id ||
    items.find((i) => ownedOf(i))?.id ||
    items[0]?.id ||
    null
  const [selectedId, setSelectedId] = useState(defaultId)
  useEffect(() => setSelectedId(defaultId), [defaultId])

  const selected = items.find((i) => i.id === selectedId) || null
  const selectedOwned = selected ? ownedOf(selected) : null
  const rarity = selected ? getEmoteRarity(selected.priceFahhcoin) : null

  // Tapping a tile: owned -> equip/unequip right here (same toggle the old
  // plain grid used); locked -> open the full-screen showcase to buy it.
  // Either way it also becomes the selected (previewed) tile.
  function handleTileActivate(item) {
    setSelectedId(item.id)
    const owned = ownedOf(item)
    if (owned) {
      onEquip(item, owned.equipped)
    } else {
      onView(item)
    }
  }

  // Arrow-key navigation across the grid - Left/Up step back, Right/Down
  // step forward, wrapping around both ends. Only moves the preview/detail
  // selection - Enter/Space activates (equip or open showcase) whichever
  // tile is currently selected, same as a tap.
  useEffect(() => {
    function handleKeyDown(e) {
      if (items.length === 0) return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const idx = items.findIndex((i) => i.id === selectedId)
        if (idx === -1) return
        e.preventDefault()
        const delta = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
        const next = items[(idx + delta + items.length) % items.length]
        if (next) setSelectedId(next.id)
        return
      }
      if ((e.key === 'Enter' || e.key === ' ') && selected) {
        e.preventDefault()
        handleTileActivate(selected)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId, selected])

  return (
    <div className="emote-select">
      <div className="emote-select-header">
        <button
          type="button"
          className="emote-shelf-back"
          aria-label="Back to heroes"
          onClick={onBack}
        >
          <IconChevronLeft />
        </button>
        <span className="emote-select-tab">Select Emote</span>
      </div>

      <div className="emote-select-body">
        <div className="emote-select-left">
          {selected && (
            <div className="emote-select-detail">
              <div className="emote-select-detail-top">
                <span className="emote-select-detail-thumb">
                  <EmoteGlyph
                    heroName={hero.name}
                    emoteName={selected.name}
                    size={44}
                  />
                </span>
                <div className="emote-select-detail-text">
                  <p
                    className="emote-select-rarity"
                    style={{ color: rarity.color }}
                  >
                    {rarity.label}{' '}
                    <span className="emote-select-rarity-sep">|</span> EMOTE
                  </p>
                  <p className="emote-select-name">{selected.name}</p>
                </div>
              </div>
              <p className="emote-select-desc">
                {getEmoteFlavorText(selected.name)}
              </p>
            </div>
          )}

          <div className="emote-select-grid">
            {items.map((item) => {
              const itemOwned = ownedOf(item)
              const itemRarity = getEmoteRarity(item.priceFahhcoin)
              const isSelected = item.id === selectedId
              const isNew = newIds.has(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`emote-tile emote-select-tile rarity-${itemRarity.key} ${isSelected ? 'is-selected' : ''} ${!itemOwned ? 'is-locked' : ''}`}
                  style={{ '--rarity-color': itemRarity.color }}
                  onClick={() => handleTileActivate(item)}
                  aria-pressed={isSelected}
                  aria-label={`${item.name}${!itemOwned ? `, locked, ${item.priceFahhcoin > 0 ? `${item.priceFahhcoin} Fahhcoin` : 'free'}` : itemOwned.equipped ? ', equipped' : ', owned'}`}
                >
                  {isNew && <span className="emote-select-new-badge">!</span>}
                  {isSelected && itemOwned?.equipped && (
                    <span
                      className="emote-select-equipped-badge"
                      aria-hidden="true"
                    >
                      <IconClose />
                    </span>
                  )}
                  <span className="emote-select-tile-art">
                    <EmoteGlyph
                      heroName={hero.name}
                      emoteName={item.name}
                      size={48}
                      active={isSelected}
                    />
                  </span>
                  {!itemOwned && (
                    <span className="emote-select-tile-lock">
                      <IconLock />
                      <span className="emote-select-tile-price">
                        {item.priceFahhcoin > 0 ? (
                          <>
                            <span className="game-coin" aria-hidden="true" />{' '}
                            {item.priceFahhcoin}
                          </>
                        ) : (
                          'Free'
                        )}
                      </span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="emote-select-preview">
          {selected ? (
            <button
              type="button"
              className="emote-select-preview-stage"
              onClick={() => !selectedOwned && onView(selected)}
              aria-label={
                selectedOwned
                  ? selected.name
                  : `View and unlock ${selected.name}`
              }
            >
              <EmoteGlyph
                heroName={hero.name}
                emoteName={selected.name}
                size={240}
                active
              />
              <span className="emote-select-pedestal" aria-hidden="true" />
            </button>
          ) : (
            <p className="game-menu-empty">No emotes for {hero.name} yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
