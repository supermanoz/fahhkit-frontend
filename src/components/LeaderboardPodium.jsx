/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import Avatar from '../game/ui/Avatar'
import RankBadge from './RankBadge'
import './LeaderboardPodium.css'

// Top-3 podium (2 · 1 · 3, winner raised) above a ranked list for everyone
// else. Shared by the Solo and Club leaderboards, so it takes pre-shaped
// rows: { key, rank, name, area, avatarSrc?, badge?, isPlayer?, onClick? }.
// The podium spot IS the rank badge now (RankBadge - real art, see
// scripts/slice-badges.mjs) - no avatar/club-badge/crown/rays/frame behind
// it any more (see git history for that version); `entry.badge` (still set
// by the Club leaderboard, a <ClubBadge>) is only read here for its
// presence, to pick the player vs club badge art, never rendered itself.
// Rank 4+ below keeps the plain numbered chip + real avatar/club-badge
// treatment untouched - this replacement is the podium's top 3 only.

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

function PodiumSpot({ entry, place, innerRef }) {
  if (!entry) return <div className={`lb-podium-spot place-${place}`} />
  return (
    <button
      type="button"
      ref={innerRef}
      className={`lb-podium-spot place-${place} ${entry.isPlayer ? 'is-player' : ''}`}
      onClick={entry.onClick}
      disabled={!entry.onClick}
    >
      <RankBadge
        type={entry.badge ? 'club' : 'player'}
        rank={place}
        className="lb-podium-badge-img"
      />
      <span className="lb-podium-name">
        {entry.name}
        {entry.isPlayer && <span className="lb-you-tag">You</span>}
      </span>
      <span className="lb-podium-area">{entry.area}</span>
    </button>
  )
}

// Rank/avatar-or-badge/name(+You tag)/stat - the one row layout shared by
// the rank-4+ list and the pinned duplicate below, so "the same row
// everyone else gets" (see GamePage.jsx's brief) can't drift between the
// two call sites.
function RowContent({ entry }) {
  return (
    <>
      <span className="lb-col-rank">{entry.rank}</span>
      {entry.badge ? (
        <span className="lb-row-badge">{entry.badge}</span>
      ) : (
        <Avatar
          name={entry.name}
          src={entry.avatarSrc}
          size={40}
          fallbackColor={colorFor(entry.name)}
          initials={2}
          className="lb-avatar lb-row-avatar"
        />
      )}
      <span className="lb-col-name">
        {entry.name}
        {entry.isPlayer && <span className="lb-you-tag">You</span>}
      </span>
      <span className="lb-col-area">{entry.area}</span>
    </>
  )
}

// Shown in place of the podium/list while a request is in flight - without
// a distinct loading state, the panel briefly showed its "no one here yet"
// empty message on every first load (the array is empty before the
// request even lands), reading as "there's nothing here" rather than
// "still loading." Shaped like the real podium+rows so the layout doesn't
// jump once data arrives.
export function LeaderboardSkeleton() {
  return (
    <div className="lb lb-skeleton" aria-hidden="true">
      <div className="lb-podium">
        <div className="lb-podium-spot place-2">
          <span className="lb-skeleton-block lb-skeleton-podium" />
        </div>
        <div className="lb-podium-spot place-1">
          <span className="lb-skeleton-block lb-skeleton-podium" />
        </div>
        <div className="lb-podium-spot place-3">
          <span className="lb-skeleton-block lb-skeleton-podium" />
        </div>
      </div>
      <ul className="lb-list">
        {[0, 1, 2].map((i) => (
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

export default function LeaderboardPodium({
  entries,
  nameLabel = 'Runner',
  statLabel = 'Territory',
}) {
  const [first, second, third] = entries
  const rest = entries.slice(3)
  // Whichever one of these is actually `isPlayer` - the leaderboard rows
  // already carry that flag (see GamePage.jsx), never recomputed here.
  const myEntry = entries.find((entry) => entry.isPlayer)

  // Pins a duplicate of the player's own row to the bottom of the panel
  // once their real row (wherever it lands - a podium spot or a list row)
  // scrolls out of view, so their standing is always visible without
  // hunting for it. `root: null` (the browser viewport) is correct here,
  // not just a shortcut - GamePage.css's .game-menu-sheet, which this
  // panel always lives inside, is itself `position: fixed; inset: 0`
  // with its own scrolling, so its scrollable bounds already ARE the
  // viewport; there's no narrower clipping ancestor in between that would
  // make a viewport-rooted observer report the wrong thing.
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
    // Re-observe whenever which entry is "me" changes (a new page of
    // results, a different scope) - the DOM node from a previous render
    // may no longer exist. Keyed on myEntry?.key, not the whole object -
    // `entries` is a fresh array/object every render (GamePage builds it
    // inline), so depending on `myEntry` itself would tear down and
    // recreate the observer on every render instead of only when it's
    // actually a different row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEntry?.key])

  const showPinned = Boolean(myEntry) && !myRowVisible

  return (
    <div className="lb">
      <div className="lb-podium">
        <PodiumSpot
          entry={second}
          place={2}
          innerRef={second?.isPlayer ? myRowRef : undefined}
        />
        <PodiumSpot
          entry={first}
          place={1}
          innerRef={first?.isPlayer ? myRowRef : undefined}
        />
        <PodiumSpot
          entry={third}
          place={3}
          innerRef={third?.isPlayer ? myRowRef : undefined}
        />
      </div>

      {rest.length > 0 && (
        <>
          <div className="lb-list-head">
            <span className="lb-col-rank">Rank</span>
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
        <div className="lb-pinned-you">
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
