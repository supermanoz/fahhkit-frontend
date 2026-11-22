/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import Avatar from '../game/ui/Avatar'
import GameButton from '../game/ui/GameButton'
import RankBadge from './RankBadge'
import { IconTrophy } from './GameIcons'
import './LeaderboardPodium.css'

// Top-3 podium (2 · 1 · 3, winner raised and largest) above a clean ranked
// list for everyone else. Shared by the Solo and Club leaderboards, so it
// takes pre-shaped rows:
//   { key, rank, name, area, sub?, avatarSrc?, badge?, isPlayer?, onClick? }
// `sub` is an optional second line (a player's club tag, a club's member
// count) - only shown when the row really has one. `badge` (Club board) is a
// function (size) => emblem node; players get an Avatar instead.
// Rank 1 keeps the existing TOP 1 badge art (RankBadge); 2 and 3 get a
// silver / bronze medal. Gold/silver/bronze are used for ranks 1-3 only.

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

function Face({ entry, size }) {
  if (entry.badge) {
    return (
      <span className="lb-emblem" style={{ '--lb-face': `${size}px` }}>
        {entry.badge(size)}
      </span>
    )
  }
  return (
    <Avatar
      name={entry.name}
      src={entry.avatarSrc}
      size={size}
      fallbackColor={colorFor(entry.name)}
      initials={2}
      className="lb-avatar"
    />
  )
}

function YouTag() {
  return <span className="lb-you-tag">You</span>
}

function PodiumSpot({ entry, place, innerRef }) {
  const first = place === 1
  return (
    <button
      type="button"
      ref={innerRef}
      className={`lb-podium-spot place-${place} ${entry.isPlayer ? 'is-player' : ''}`}
      onClick={entry.onClick}
      disabled={!entry.onClick}
      aria-label={`Rank ${place}, ${entry.name}`}
    >
      {first && (
        <RankBadge
          type={entry.badge ? 'club' : 'player'}
          rank={1}
          className="lb-podium-badge-img"
        />
      )}
      <span className="lb-podium-face">
        <Face entry={entry} size={first ? 68 : 54} />
        {!first && (
          <span className={`lb-medal lb-medal-${place}`} aria-hidden="true">
            {place}
          </span>
        )}
      </span>
      <span className="lb-podium-name">{entry.name}</span>
      {entry.isPlayer && <YouTag />}
      {entry.sub && <span className="lb-sub">{entry.sub}</span>}
      <span className="lb-podium-area">{entry.area}</span>
    </button>
  )
}

// Rank/avatar-or-emblem/name(+You tag, +sub line)/stat - the one row layout
// shared by the rank-4+ list and the pinned bar, so the two can't drift.
function RowContent({ entry }) {
  return (
    <>
      <span className="lb-col-rank">{entry.rank}</span>
      <Face entry={entry} size={40} />
      <span className="lb-col-main">
        <span className="lb-col-name">
          <span className="lb-col-name-text">{entry.name}</span>
          {entry.isPlayer && <YouTag />}
        </span>
        {entry.sub && <span className="lb-sub">{entry.sub}</span>}
      </span>
      <span className="lb-col-area">{entry.area}</span>
    </>
  )
}

// Shown in place of the podium/list while a request is in flight - shaped
// like the real podium + rows so nothing jumps when data arrives.
export function LeaderboardSkeleton() {
  return (
    <div
      className="lb lb-skeleton"
      aria-hidden="true"
      data-testid="lb-skeleton"
    >
      <div className="lb-podium">
        {[2, 1, 3].map((p) => (
          <div key={p} className={`lb-podium-spot place-${p}`}>
            <span className="lb-skeleton-block lb-skeleton-podium" />
          </div>
        ))}
      </div>
      <ul className="lb-list">
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <span className="lb-row lb-skeleton-row">
              <span className="lb-skeleton-block lb-skeleton-chip" />
              <span className="lb-skeleton-block lb-skeleton-avatar" />
              <span className="lb-skeleton-block lb-skeleton-name" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Friendly empty state. `message` is the headline; `hint` an optional
// smaller second line (e.g. why a district board can look empty).
export function LeaderboardEmpty({ message, hint }) {
  return (
    <div className="lb-state lb-empty" role="status">
      <IconTrophy className="lb-state-art" aria-hidden="true" />
      <p className="lb-state-title">{message}</p>
      {hint && <p className="lb-state-hint">{hint}</p>}
    </div>
  )
}

export function LeaderboardError({ message, onRetry }) {
  return (
    <div className="lb-state lb-error" role="alert">
      <p className="lb-state-title">{message}</p>
      <p className="lb-state-hint">Check your connection and try again.</p>
      {onRetry && (
        <GameButton variant="success" size="lg" onClick={onRetry}>
          Retry
        </GameButton>
      )}
    </div>
  )
}

export default function LeaderboardPodium({
  entries,
  nameLabel = 'Runner',
  statLabel = 'Territory',
}) {
  const [first, second, third] = entries
  const rest = entries.slice(3)
  // Fewer than 3 entries: just the cards that exist, in rank order, centred
  // (no empty podium slots). With 3+: 2 · 1 · 3.
  const podium =
    entries.length >= 3
      ? [
          [second, 2],
          [first, 1],
          [third, 3],
        ]
      : [
          [first, 1],
          [second, 2],
        ].filter(([e]) => e)
  // Whichever one of these is actually `isPlayer` - the leaderboard rows
  // already carry that flag (see GamePage.jsx), never recomputed here.
  const myEntry = entries.find((entry) => entry.isPlayer)

  // Pins the player's own row to the bottom of the panel once their real
  // row (a podium spot or a list row) scrolls out of view, so their standing
  // is always visible. Uses only data already in the list - no new request.
  // `root: null` (the viewport) is right: .game-menu-sheet, which this panel
  // always lives inside, is itself position:fixed; inset:0.
  const myRowRef = useRef(null)
  const [myRowVisible, setMyRowVisible] = useState(true)
  useEffect(() => {
    const el = myRowRef.current
    if (!myEntry || !el) {
      setMyRowVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver(
      ([intersection]) => setMyRowVisible(intersection.isIntersecting),
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
    // Keyed on myEntry?.key, not the object - `entries` is rebuilt inline on
    // every render, so depending on `myEntry` would recreate the observer
    // each time instead of only when it's a different row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEntry?.key])

  const showPinned = Boolean(myEntry) && !myRowVisible

  return (
    <div className="lb">
      <div className="lb-podium" data-count={Math.min(entries.length, 3)}>
        {podium.map(([entry, place]) => (
          <PodiumSpot
            key={entry.key}
            entry={entry}
            place={place}
            innerRef={entry.isPlayer ? myRowRef : undefined}
          />
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div className="lb-list-head">
            <span className="lb-col-rank">#</span>
            <span className="lb-col-name">{nameLabel}</span>
            <span className="lb-col-area">{statLabel}</span>
          </div>
          <ul className="lb-list">
            {rest.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  ref={entry.isPlayer ? myRowRef : undefined}
                  className={`lb-row ${entry.isPlayer ? 'is-player' : ''}`}
                  onClick={entry.onClick}
                  disabled={!entry.onClick}
                >
                  <RowContent entry={entry} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {showPinned && (
        <div className="lb-pinned-you" data-testid="lb-pinned-you">
          <span className="lb-pinned-label">Your rank</span>
          <button
            type="button"
            className="lb-row is-player"
            onClick={myEntry.onClick}
            disabled={!myEntry.onClick}
          >
            <RowContent entry={myEntry} />
          </button>
        </div>
      )}
    </div>
  )
}
