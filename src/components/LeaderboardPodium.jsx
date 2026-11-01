/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { IconCrown } from './GameIcons'
import Avatar from '../game/ui/Avatar'
import './LeaderboardPodium.css'

// Top-3 podium (2 · 1 · 3, winner raised with light rays) above a ranked
// list for everyone else. Shared by the Solo and Club leaderboards, so it
// takes pre-shaped rows: { key, rank, name, area, avatarSrc?, badge?,
// isPlayer?, onClick? }. The leaderboard API has no profile pictures, so
// anyone without an avatarSrc gets coloured initials instead; the Club
// leaderboard passes `badge` (a <ClubBadge>) to show the same badge used
// everywhere else a club appears, instead of an avatar.

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
        {place === 1 && (
          <IconCrown className="lb-podium-crown" aria-hidden="true" />
        )}
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
          {entry.badge ? (
            <span className="lb-podium-badge">{entry.badge}</span>
          ) : (
            <Avatar
              name={entry.name}
              src={entry.avatarSrc}
              size={place === 1 ? 84 : 66}
              fallbackColor={colorFor(entry.name)}
              initials={2}
              className="lb-avatar lb-podium-avatar"
            />
          )}
        </span>
        <span className="lb-podium-medal">{place}</span>
      </span>
      <span className="lb-podium-name">{entry.name}</span>
      <span className="lb-podium-area">{entry.area}</span>
    </button>
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
            <span className="lb-col-area">{statLabel}</span>
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
