/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IconMap, IconChevronDown, IconCheck, IconLock } from './GameIcons'
import './MapStylePicker.css'

// OpenFreeMap doesn't ship static preview images for its styles, and
// there's nothing in this repo to generate one from - a flat gradient
// standing in for each style's actual palette is the colour-swatch
// fallback the brief allows instead.
const STYLE_SWATCHES = {
  positron: 'linear-gradient(135deg, #f4f1ea 0%, #d6cfbf 100%)',
  liberty: 'linear-gradient(135deg, #cdead9 0%, #a6c8ec 100%)',
  bright: 'linear-gradient(135deg, #ffd27a 0%, #74b4ff 100%)',
}

// Settings' own home for choosing TerritoryMap's basemap - moved back
// here from the Shop (see GamePage.jsx's handleChooseMapStyle, which this
// just calls into; selection/persistence logic is unchanged, only the UI
// around it). All three styles in constants/mapStyles.js are free and
// local-only today, so the locked/priced branch below never actually
// fires - it's there in case a style ever ships with a priceFahhcoin, but
// wiring a real purchase for one would need a MAP_STYLE store category on
// the backend first (map styles aren't a storeItem at all right now).
export default function MapStylePicker({ styles, selectedId, onSelect }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = styles.find((s) => s.id === selectedId) || styles[0]

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  function focusOption(fromIndex, delta) {
    const list = rootRef.current?.querySelectorAll('[role="option"]')
    if (!list?.length) return
    const next = list[Math.max(0, Math.min(list.length - 1, fromIndex + delta))]
    next?.focus()
  }

  function choose(style) {
    onSelect(style)
    setOpen(false)
  }

  return (
    <div className="map-style-picker" ref={rootRef}>
      <button
        type="button"
        className="game-settings-row"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="game-settings-row-label">
          <span className="game-settings-row-icon">
            <span className="game-settings-row-icon-badge" aria-hidden="true">
              <IconMap />
            </span>
          </span>
          <span className="game-settings-row-text">
            Map style
            <span className="game-settings-row-sub">{current?.name}</span>
          </span>
        </span>
        <IconChevronDown
          className={`game-settings-row-chevron map-style-picker-chevron${
            open ? ' is-open' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            className="map-style-picker-list"
            role="listbox"
            aria-label="Map style"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
          >
            {styles.map((style, i) => {
              const isSelected = style.id === selectedId
              const locked = Boolean(style.priceFahhcoin) && !isSelected
              return (
                <li key={style.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`map-style-picker-option${
                      isSelected ? ' is-selected' : ''
                    }`}
                    onClick={() => choose(style)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        focusOption(i, 1)
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        focusOption(i, -1)
                      }
                    }}
                  >
                    <span
                      className="map-style-picker-swatch"
                      style={{
                        background:
                          STYLE_SWATCHES[style.id] || 'var(--game-stone)',
                      }}
                      aria-hidden="true"
                    />
                    <span className="map-style-picker-name">{style.name}</span>
                    <span className="map-style-picker-state">
                      {isSelected ? (
                        <IconCheck aria-label="Selected" />
                      ) : locked ? (
                        <>
                          {style.priceFahhcoin}
                          <span className="game-coin" aria-label="Fahhcoin" />
                          <IconLock aria-hidden="true" />
                        </>
                      ) : (
                        'Free'
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
