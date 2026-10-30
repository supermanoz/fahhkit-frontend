/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { IconClose, IconPlay } from './GameIcons'
import EmoteGlyph from './EmoteGlyph'
import { getEmoteRarity } from '../utils/emoteRarity'
import './EmoteShowcase.css'

// Full-screen "first screen shown after clicking an emote" - replaces the
// old shared buy-confirm card for EMOTE specifically (see GamePage.jsx's
// storeChoice modal, which still renders the old card for
// SKIN/TERRITORY_SHADE/TRAIL_COLOR - only EMOTE gets this treatment).
// Esc and the backdrop click both close through the same `storeChoice`
// state GamePage already had - its own Esc effect keys off storeChoice
// itself, not this component, so no separate listener is needed here.
export default function EmoteShowcase({
  item,
  heroName,
  owned,
  price,
  balance,
  short,
  purchasing,
  purchaseError,
  storeActionError,
  onClose,
  onBuy,
  onEquip,
  onGetCoins,
}) {
  // "Preview" replays the animation from frame 1 - AnimatedSprite's CSS
  // already loops infinitely, so there's nothing to actually start/stop;
  // remounting EmoteGlyph via a changing key is the simplest way to give
  // it a visible, deliberate restart on tap.
  const [playKey, setPlayKey] = useState(0)
  const rarity = getEmoteRarity(item.priceFahhcoin)

  return (
    <motion.div
      className="emote-showcase-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="emote-showcase-card"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="game-close-btn game-run-viewer-close emote-showcase-close"
          aria-label="Back"
          onClick={onClose}
        >
          <IconClose />
        </button>

        <p className="emote-showcase-rarity" style={{ color: rarity.color }}>
          {rarity.label} <span className="emote-showcase-rarity-sep">|</span>{' '}
          EMOTE
        </p>
        <p className="emote-showcase-name">{item.name}</p>

        <div className="emote-showcase-pedestal">
          <span className="emote-showcase-pedestal-ring" aria-hidden="true" />
          <EmoteGlyph
            key={playKey}
            heroName={heroName}
            emoteName={item.name}
            size={220}
            active
          />
        </div>

        <button
          type="button"
          className="btn btn-outline emote-showcase-play"
          onClick={() => setPlayKey((k) => k + 1)}
        >
          <IconPlay /> Preview
        </button>

        {(purchaseError || storeActionError) && (
          <p className="game-controls-hint game-controls-hint-error">
            {purchaseError || storeActionError}
          </p>
        )}
        {!owned && short && (
          <p className="emote-showcase-short">
            Not enough Fahhcoin - you have {balance}, need {price - balance}{' '}
            more.
          </p>
        )}

        <div className="emote-showcase-actions">
          {owned ? (
            <button type="button" className="btn btn-primary" onClick={onEquip}>
              {owned.equipped ? 'Unequip' : 'Equip'}
            </button>
          ) : short ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onGetCoins}
            >
              Get Fahhcoin
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onBuy}
              disabled={purchasing}
            >
              {purchasing ? (
                'Buying…'
              ) : price > 0 ? (
                <>
                  Buy for {price}{' '}
                  <span className="game-coin" aria-label="Fahhcoin" />
                </>
              ) : (
                'Unlock free'
              )}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
