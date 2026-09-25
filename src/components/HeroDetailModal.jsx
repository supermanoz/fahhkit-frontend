/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FaBolt, FaCheck, FaTimes } from 'react-icons/fa'
import HeroFigure from './HeroFigure'
import { resolveFileUrl } from '../api/client'
import { getHeroSprite } from '../utils/heroSprites'
import { heroAbilityParts } from '../utils/hero'
import './HeroDetailModal.css'

// Stat bars fill against this boost - no hero perk goes near it, so a +10%
// still reads as a solid chunk instead of a sliver.
const STAT_BAR_MAX_PCT = 25

const POSE_LABELS = { idle: 'Idle', run: 'Run', charge: 'Charge' }

// A hero's codex page: big animated figure, stats (score perks), lore and
// skins. Rendered at page level by GamePage (inside AnimatePresence) so the
// fixed overlay isn't trapped by the menu's transforms.
export default function HeroDetailModal({
  hero,
  ownedItems,
  isActive,
  error,
  onClose,
  onEquip,
  onBuy,
}) {
  const sprite = getHeroSprite(hero.name)
  const poses = sprite ? Object.keys(sprite.poses) : []
  const [pose, setPose] = useState('run')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const abilities = (hero.abilities || [])
    .map((a) => ({ id: a.id, ...heroAbilityParts(a) }))
    .filter((a) => a.label)
  const skins = hero.skins || []

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
          className="game-run-viewer-close"
          aria-label="Close"
          onClick={onClose}
        >
          <FaTimes />
        </button>

        <div className={`hero-modal-stage ${sprite ? '' : 'is-flat'}`}>
          <HeroFigure hero={hero} pose={pose} height={190} />
          {poses.length > 1 && (
            <div className="hero-modal-poses" role="group" aria-label="Pose">
              {poses.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={pose === p ? 'is-active' : ''}
                  aria-pressed={pose === p}
                  onClick={() => setPose(p)}
                >
                  {POSE_LABELS[p] || p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hero-modal-body">
          <h2 className="hero-modal-name">
            {hero.name}
            {isActive && <span className="hero-modal-active">Your hero</span>}
          </h2>
          {hero.tagline && (
            <p className="hero-modal-tagline">“{hero.tagline}”</p>
          )}

          <h3 className="hero-modal-heading">Stats</h3>
          {abilities.length > 0 ? (
            <ul className="hero-modal-stats">
              {abilities.map((a) => (
                <li key={a.id}>
                  <span className="hero-modal-stat-label">
                    <FaBolt aria-hidden="true" /> {a.label}
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
            <p className="hero-modal-lore">{hero.backstory}</p>
          ) : (
            <p className="hero-modal-muted">
              Their story is still being written… one lap at a time.
            </p>
          )}

          <h3 className="hero-modal-heading">Skins</h3>
          {skins.length === 0 ? (
            <p className="hero-modal-muted">Arriving in the shop soon.</p>
          ) : (
            <ul className="hero-modal-skins">
              {skins.map((skin) => {
                const owned = ownedItems.find((o) => o.storeItem.id === skin.id)
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
                    <span className="hero-modal-skin-name">{skin.name}</span>
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
                            <FaCheck /> Equip
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => onBuy(skin)}
                      >
                        {skin.priceFahhcoin > 0
                          ? `${skin.priceFahhcoin} Fahhcoin`
                          : 'Free'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {error && <p className="hero-modal-error">{error}</p>}
        </div>
      </motion.div>
    </motion.div>
  )
}
