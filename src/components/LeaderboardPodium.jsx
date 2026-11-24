/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import Avatar from '../game/ui/Avatar'
import RankBadge from './RankBadge'
import GameButton from './ui/GameButton'
import { formatRank } from '../utils/leaderboardPaging'
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
  // Large ranks ("1,178") shrink to fit the round chip; an unknown rank is a
  // dash, never an invented number.
  const rankText =
    typeof entry.rank === 'number' || entry.rank == null
      ? formatRank(entry.rank)
      : String(entry.rank)
  const rankSize =
    rankText.length > 5 ? ' is-xlong' : rankText.length > 3 ? ' is-long' : ''
  return (
    <>
      <span className={`lb-col-rank${rankSize}`}>{rankText}</span>
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

// Prev / Next + "Page 2 · 21-40". The list above keeps showing the current
// page while the next one loads; a failed load keeps it too and offers Retry.
function Pager({ pager }) {
  const { page, hasPrev, hasNext, loading, error, range, onPrev, onNext } =
    pager
  if (!hasPrev && !hasNext && !error) return null
  return (
    <div className="lb-pager" data-testid="lb-pager">
      {error && (
        <div className="lb-pager-error" role="alert">
          <span>{error.message || "Couldn't load that page."}</span>
          <GameButton size="sm" variant="neutral" onClick={pager.onRetry}>
            Retry
          </GameButton>
        </div>
      )}
      <div className="lb-pager-row">
        <GameButton
          size="sm"
          variant="neutral"
          onClick={onPrev}
          disabled={!hasPrev || loading}
          aria-label="Previous page"
        >
          Prev
        </GameButton>
        <span className="lb-pager-label" aria-live="polite">
          Page {page}
          {range && <span className="lb-pager-range"> · {range}</span>}
        </span>
        <GameButton
          size="sm"
          variant="neutral"
          onClick={onNext}
          disabled={!hasNext}
          loading={loading}
          aria-label="Next page"
        >
          Next
        </GameButton>
      </div>
    </div>
  )
}

export default function LeaderboardPodium({
  entries,
  nameLabel = 'Runner',
  statLabel = 'Territory',
  page = 1,
  pager = null,
  // The player's own standing, always pinned at the bottom of the card:
  // { rank (number | null = unranked), name, avatarSrc?, badge?, area,
  //   onClick? }. null = nothing to pin (e.g. no club yet).
  me = null,
}) {
  // The podium (top 3) belongs to page 1 only; later pages are plain rows.
  const showPodium = page === 1
  const [first, second, third] = showPodium ? entries : []
  const rest = showPodium ? entries.slice(3) : entries

  return (
    <div className="lb">
      <div className="lb-scroll" key={page}>
        {showPodium && (
          <div className="lb-podium">
            <PodiumSpot entry={second} place={2} />
            <PodiumSpot entry={first} place={1} />
            <PodiumSpot entry={third} place={3} />
          </div>
        )}

        {rest.length > 0 && (
          <div className={pager?.loading ? 'lb-page is-loading' : 'lb-page'}>
            <div className="lb-list-head">
              <span className="lb-col-rank">Rank</span>
              <span className="lb-col-name">{nameLabel}</span>
              <span className="lb-col-area">{statLabel}</span>
            </div>
            <ul className="lb-list" aria-busy={pager?.loading || undefined}>
              {rest.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    className={`lb-row ${entry.isPlayer ? 'is-player' : ''}`}
                    onClick={entry.onClick}
                    disabled={!entry.onClick}
                  >
                    <RowContent entry={entry} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {pager && <Pager pager={pager} />}

      {me && (
        <div className="lb-pinned-you" data-testid="lb-pinned-you">
          <button
            type="button"
            className="lb-row is-player"
            onClick={me.onClick}
            disabled={!me.onClick}
          >
            <RowContent entry={{ ...me, isPlayer: true }} />
          </button>
        </div>
      )}
    </div>
  )
}
