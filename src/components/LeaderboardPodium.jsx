/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import './LeaderboardPodium.css'

// Top-3 podium (2 · 1 · 3, winner raised with light rays) above a ranked
// list for everyone else. Shared by the Solo and Club leaderboards, so it
// takes pre-shaped rows: { key, rank, name, area, avatarSrc?, isPlayer?,
// onClick? }. The leaderboard API has no profile pictures, so anyone
// without an avatarSrc gets coloured initials instead.

const AVATAR_COLORS = [
  '#ff7a29',
  '#4fc85e',
  '#4d9bff',
  '#b36bff',
  '#ff5a8a',
  '#20c3b0',
  '#e0a355',
]

function colorFor(name) {
  let hash = 0
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initialsOf(name) {
  const parts = (name || '?').trim().split(/\s+/)
  return (
    parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase()
}

function Avatar({ name, src, className }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      <img
        className={`lb-avatar ${className}`}
        src={src}
        alt=""
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className={`lb-avatar lb-avatar-initials ${className}`}
      style={{ background: colorFor(name) }}
    >
      {initialsOf(name)}
    </span>
  )
}

// Ray angles (deg, 0 = pointing right) fanned out on both sides of #1.
const RAYS = [-44, -22, 0, 22, 44].flatMap((a) => [a, 180 - a])

function PodiumSpot({ entry, place }) {
  if (!entry) return <div className={`lb-podium-spot place-${place}`} />
  return (
    <button
      type="button"
      className={`lb-podium-spot place-${place} ${entry.isPlayer ? 'is-player' : ''}`}
      onClick={entry.onClick}
      disabled={!entry.onClick}
    >
      <span className="lb-podium-frame">
        {place === 1 &&
          RAYS.map((angle, i) => (
            <span
              key={angle}
              className="lb-podium-ray"
              style={{
                '--ray-angle': `${angle}deg`,
                '--ray-len': `${i % 4 < 2 ? 26 : 18}px`,
              }}
            />
          ))}
        <span className="lb-podium-border">
          <Avatar
            name={entry.name}
            src={entry.avatarSrc}
            className="lb-podium-avatar"
          />
        </span>
        <span className="lb-podium-medal">{place}</span>
      </span>
      <span className="lb-podium-name">{entry.name}</span>
      <span className="lb-podium-area">{entry.area}</span>
    </button>
  )
}

export default function LeaderboardPodium({ entries, nameLabel = 'Runner' }) {
  const [first, second, third] = entries
  const rest = entries.slice(3)

  return (
    <div className="lb">
      <div className="lb-podium">
        <PodiumSpot entry={second} place={2} />
        <PodiumSpot entry={first} place={1} />
        <PodiumSpot entry={third} place={3} />
      </div>

      {rest.length > 0 && (
        <>
          <div className="lb-list-head">
            <span className="lb-col-rank">Rank</span>
            <span className="lb-col-name">{nameLabel}</span>
            <span className="lb-col-area">Territory</span>
          </div>
          <ul className="lb-list">
            {rest.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`lb-row ${entry.isPlayer ? 'is-player' : ''}`}
                  onClick={entry.onClick}
                  disabled={!entry.onClick}
                >
                  <span className="lb-col-rank">{entry.rank}</span>
                  <Avatar
                    name={entry.name}
                    src={entry.avatarSrc}
                    className="lb-row-avatar"
                  />
                  <span className="lb-col-name">{entry.name}</span>
                  <span className="lb-col-area">{entry.area}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
