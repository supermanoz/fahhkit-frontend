/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { motion } from 'framer-motion'
import { IconCheck, IconClose } from './GameIcons'
import EmoteGlyph from './EmoteGlyph'
import './EmoteShowcase.css'

// Full-screen "first screen shown after clicking an emote" - replaces the
// old shared buy-confirm card for EMOTE specifically (see GamePage.jsx's
// storeChoice modal, which still renders the old card for
// SKIN/TERRITORY_SHADE/TRAIL_COLOR - only EMOTE gets this treatment).
// Esc and the backdrop click both close through the same `storeChoice`
// state GamePage already had - its own Esc effect keys off storeChoice
// itself, not this component, so no separate listener is needed here.
//
// Stripped down to just the animation + one action button - no name,
// rarity or any other text on screen (an unowned emote's name/flavor isn't
// really "the point" the way it is in, say, Fortnite's locker; the art and
// the buy decision are). The emote name still reaches screen readers via
// this card's own aria-label and the pedestal's, since nothing visual
// carries it anymore. Always plays (EmoteGlyph's `active`, unconditional)
// even when locked - this is the one deliberately-selected instance, same
// reasoning as HeroDetailModal.jsx's slider now uses.
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
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="game-close-btn game-run-viewer-close emote-showcase-close"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>

        <div
          className="emote-showcase-pedestal"
          role="img"
          aria-label={`${item.name} emote`}
        >
          <EmoteGlyph
            heroName={heroName}
            emoteName={item.name}
            size={220}
            active
          />
        </div>

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
            owned.equipped ? (
              <button
                type="button"
                className="btn btn-primary emote-showcase-equipped"
                disabled
                aria-label="Equipped"
              >
                <IconCheck aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onEquip}
              >
                Equip
              </button>
            )
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
