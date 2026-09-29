/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { IconClose, IconFlag, IconTrophy } from './GameIcons'
import { motion } from 'framer-motion'
import HeroSprite from './HeroSprite'
import LevelBar from './LevelBar'
import ClubBadge from './ClubBadge'
import { playerName } from '../utils/playerName'
import { getTerritoryProfileByUserId } from '../api/territory'
import { resolveFileUrl } from '../api/client'
import { PARCELS_PER_FLAG, formatArea } from '../utils/territoryGame'
import { isBlazeHero, isPlaceholderHero } from '../utils/hero'
import defaultAvatarImage from '../assets/images/player-avatar-blaze.png'
import './AthleteTerritoryProfilePanel.css'

// TEMP: the territory flag tally and the Medals section are hidden on other
// players' profiles for now. Flip to true to bring both back.
const SHOW_FLAGS_AND_MEDALS = false

// A player's public game profile, opened full-screen from a leaderboard row.
// Laid out like the player's own "Me" tab (same GamePage.css classes) -
// their equipped hero over their equipped profile background, phrase, level
// bar and territory flags - so every profile in the game reads the same.
// Deliberately separate from map-highlight ("view their territory") - a
// player can own more than one parcel, so highlighting one on the map isn't
// a meaningful destination the way it is for a single tapped parcel.
export default function AthleteTerritoryProfilePanel({
  userId,
  fullName,
  // Shown instead of the full name when set (else the first name).
  nickname,
  onClose,
  canInvite = false,
  onInvite,
  // Club management buttons for a clubmate ({ id, label, tone, confirm?,
  // run }) - built by ClubPanel's memberActions. Ones with `confirm` need a
  // second tap. The panel closes after one succeeds.
  actions = [],
}) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [inviteState, setInviteState] = useState(null)
  const [actionBusy, setActionBusy] = useState(null)
  const [actionConfirm, setActionConfirm] = useState(null)
  const [actionError, setActionError] = useState(null)

  async function handleAction(action) {
    if (action.confirm && actionConfirm !== action.id) {
      setActionConfirm(action.id)
      return
    }
    setActionBusy(action.id)
    setActionError(null)
    try {
      await action.run()
      onClose()
    } catch (err) {
      setActionError(err?.message || 'That did not work - try again.')
      setActionBusy(null)
      setActionConfirm(null)
    }
  }

  async function handleInvite() {
    setInviteState({ phase: 'sending' })
    try {
      await onInvite(userId)
      setInviteState({ phase: 'sent' })
    } catch (err) {
      setInviteState({
        phase: 'error',
        message: err?.message || 'Could not send that invite.',
      })
    }
  }

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setError(null)
    getTerritoryProfileByUserId(userId)
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this profile.")
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Their equipped cosmetics, resolved the same way GamePage does for the
  // player's own: the placeholder "Default Hero" counts as none, and no hero
  // means Blaze (the default).
  const cosmetics = profile?.equippedCosmetics || []
  const equippedOf = (category) =>
    cosmetics.find((c) => c.storeItem?.category === category)
  const hero = cosmetics.find(
    (c) =>
      c.storeItem?.category === 'HERO' && !isPlaceholderHero(c.storeItem.name)
  )
  const heroIsBlaze = !hero || isBlazeHero(hero.storeItem.name)
  const background = equippedOf('PROFILE_BACKGROUND')
  const phrase = equippedOf('PHRASE')
  const parcelCount = profile?.parcelCount ?? 0
  const flagCount = Math.min(Math.ceil(parcelCount / PARCELS_PER_FLAG), 8)

  return (
    <motion.div
      className="athlete-profile-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        className="game-menu-close athlete-profile-close"
        onClick={onClose}
        aria-label="Close profile"
      >
        <IconClose />
      </button>

      <div
        className="athlete-profile-content game-menu-panel"
        onClick={(e) => e.stopPropagation()}
        style={
          background?.storeItem?.assetUrl
            ? {
                backgroundImage: `url(${resolveFileUrl(background.storeItem.assetUrl)})`,
              }
            : undefined
        }
      >
        {profile && (
          <div className="game-menu-hero">
            {heroIsBlaze ? (
              <HeroSprite size={260} />
            ) : (
              <img
                className="game-menu-hero-img"
                src={resolveFileUrl(hero.storeItem.assetUrl)}
                alt=""
                onError={(e) => {
                  // Same broken-asset fallback as the Me tab.
                  e.currentTarget.onerror = null
                  e.currentTarget.src = defaultAvatarImage
                }}
              />
            )}
          </div>
        )}

        <p className="game-menu-player-name">
          {fullName === 'You' ? 'You' : playerName(nickname, fullName)}
        </p>

        {error ? (
          <p className="game-menu-empty">{error}</p>
        ) : !profile ? (
          <p className="game-menu-empty">Loading…</p>
        ) : (
          <>
            {phrase && (
              <p className="game-menu-phrase">“{phrase.storeItem.name}”</p>
            )}

            {profile.level != null && (
              <div className="game-level-hud">
                <LevelBar level={profile.level} xp={profile.xp} showXp />
              </div>
            )}

            <div
              className="game-menu-summary"
              // TEMP: nothing below to divide from while Medals is hidden.
              style={
                SHOW_FLAGS_AND_MEDALS ? undefined : { borderBottom: 'none' }
              }
            >
              <span className="game-menu-summary-value">
                {formatArea(profile.totalAreaSqMeters)}
              </span>
              {SHOW_FLAGS_AND_MEDALS && (
                <span
                  className="game-menu-parcel-flags"
                  aria-label={`${parcelCount} territor${parcelCount === 1 ? 'y' : 'ies'} held (each flag = ${PARCELS_PER_FLAG})`}
                  title={`Each flag = ${PARCELS_PER_FLAG} territories`}
                >
                  {Array.from({ length: flagCount }).map((_, i) => (
                    <IconFlag key={i} />
                  ))}
                  {parcelCount > 8 * PARCELS_PER_FLAG && (
                    <span className="game-menu-parcel-flags-more">
                      +{parcelCount - 8 * PARCELS_PER_FLAG}
                    </span>
                  )}
                </span>
              )}
            </div>

            {profile.clubName && (
              <div className="athlete-profile-club">
                <ClubBadge name={profile.clubName} size={40} />
                <span className="athlete-profile-club-text">
                  <span className="athlete-profile-club-label">Club</span>
                  <span className="athlete-profile-club-name">
                    {profile.clubName}
                  </span>
                </span>
              </div>
            )}

            {/* Leaders/co-leaders only, and only for players not already in
                a club - the backend enforces both, this just hides a button
                that could never work. */}
            {canInvite && onInvite && !profile.clubName && (
              <div className="athlete-profile-invite">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleInvite}
                  disabled={
                    inviteState?.phase === 'sending' ||
                    inviteState?.phase === 'sent'
                  }
                >
                  {inviteState?.phase === 'sent'
                    ? 'Invite sent 📬'
                    : inviteState?.phase === 'sending'
                      ? 'Sending…'
                      : 'Invite to my club'}
                </button>
                {inviteState?.phase === 'error' && (
                  <p className="game-controls-hint game-controls-hint-error">
                    {inviteState.message}
                  </p>
                )}
              </div>
            )}

            {actions.length > 0 && (
              <div className="athlete-profile-club-actions">
                <p className="game-menu-section-title">Club actions</p>
                <div className="athlete-profile-club-actions-row">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className={`game-btn game-btn-sm game-btn-${action.tone}`}
                      disabled={actionBusy !== null}
                      onClick={() => handleAction(action)}
                    >
                      {actionBusy === action.id
                        ? '…'
                        : actionConfirm === action.id
                          ? action.confirm
                          : action.label}
                    </button>
                  ))}
                </div>
                {actionError && (
                  <p className="game-controls-hint game-controls-hint-error">
                    {actionError}
                  </p>
                )}
              </div>
            )}

            {SHOW_FLAGS_AND_MEDALS && (
              <>
                <p className="game-menu-section-title">
                  <IconTrophy /> Medals
                </p>
                {!profile.medals || profile.medals.length === 0 ? (
                  <p className="game-menu-empty">No medals yet.</p>
                ) : (
                  <ul className="game-menu-list">
                    {profile.medals.map((medal) => (
                      <li key={medal.id}>
                        <span className="game-menu-list-area">
                          Season {medal.seasonNumber} · #{medal.rankPosition}
                        </span>
                        <span className="game-menu-list-meta">
                          {medal.medalType === 'CLUB' ? 'Club' : 'Individual'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
