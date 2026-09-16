/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { FaTimes, FaTrophy } from 'react-icons/fa'
import { motion } from 'framer-motion'
import { getTerritoryProfileByUserId } from '../api/territory'
import { formatArea } from '../utils/territoryGame'
import './AthleteTerritoryProfilePanel.css'

// A player's public game profile, opened full-screen from a leaderboard row.
// Deliberately separate from map-highlight ("view their territory") - a
// player can own more than one parcel, so highlighting one on the map isn't
// a meaningful destination the way it is for a single tapped parcel.
export default function AthleteTerritoryProfilePanel({
  userId,
  fullName,
  areaEmoji,
  onClose,
}) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

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

  return (
    <motion.div
      className="athlete-profile-overlay"
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
        <FaTimes />
      </button>

      <div className="athlete-profile-content">
        <p className="game-menu-player-name">{fullName}</p>

        {error ? (
          <p className="game-menu-empty">{error}</p>
        ) : !profile ? (
          <p className="game-menu-empty">Loading…</p>
        ) : (
          <>
            <div className="game-menu-summary">
              <span className="game-menu-summary-value">
                {areaEmoji} {formatArea(profile.totalAreaSqMeters)}
              </span>
              <span className="game-menu-summary-label">
                held across {profile.parcelCount ?? 0} parcel
                {profile.parcelCount === 1 ? '' : 's'}
              </span>
            </div>

            {profile.level != null && (
              <p className="game-menu-summary-label">
                Level {profile.level} · {profile.xp ?? 0} XP
                {profile.clubName ? ` · ${profile.clubName}` : ''}
              </p>
            )}

            <p className="game-menu-section-title">
              <FaTrophy /> Medals
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
      </div>
    </motion.div>
  )
}
