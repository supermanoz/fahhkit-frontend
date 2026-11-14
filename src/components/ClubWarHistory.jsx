/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import {
  CLUB_WAR_REWARDS,
  getClubWarHistory,
  getClubWarHistoryDetail,
} from '../api/clubWar'
import { DEFAULT_HERO_NAME, isPlaceholderHero } from '../utils/hero'
import {
  formatDistance,
  formatDuration as formatRunDuration,
  formatPace,
} from '../utils/run'
import ClubBadge from './ClubBadge'
import ClubWarMemberAvatar from './ClubWarMemberAvatar'
import {
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconClock,
  IconClose,
  IconCrown,
  IconHelmet,
  IconRunning,
} from './GameIcons'
import { playerNameOf } from '../utils/playerName'
import { formatNumber } from '../utils/format'

// 10 per page - matches the backend's own default noOfRecords for this
// endpoint (see api/clubWar.js's getClubWarHistory).
const PAGE_SIZE = 10

// Skeleton row counts - arbitrary, just enough to fill a typical screen
// without the shimmer list itself needing to scroll.
const SKELETON_WAR_ROWS = [0, 1, 2, 3, 4]
const SKELETON_PARTICIPANT_ROWS = [0, 1, 2, 3, 4]

// Matches ClubWarResultConstant exactly (WIN/LOSS/DRAW - confirmed by
// reading the backend enum directly, not guessed).
const RESULT_LABEL = {
  WIN: 'Victory',
  LOSS: 'Defeat',
  DRAW: 'Draw',
}

function resultLabel(result) {
  return RESULT_LABEL[result] || result || '—'
}

// A squad member's run outcome (ClubWarParticipantScoreResponse.runOutcome,
// RunProcessingOutcomeConstant on the backend) - SUCCESS is the normal
// "ran, scored" case; NON_TERRITORY_SCORED covers a war run that scored on
// pace/effort without closing a territory loop (expected for a war run,
// which isn't trying to claim ground). Falls back to a humanized version
// of anything else rather than a shouting raw backend constant, in case
// the backend ever adds a value this doesn't know about yet.
const RUN_OUTCOME_LABEL = {
  SUCCESS: 'Ran',
  NON_TERRITORY_SCORED: 'Ran',
  CHEAT_DETECTED: 'Flagged',
}

function runOutcomeLabel(outcome) {
  if (!outcome) return 'Ran'
  return (
    RUN_OUTCOME_LABEL[outcome] ||
    outcome
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  )
}

function formatScore(score) {
  return score == null ? '—' : formatNumber(score)
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
}

// matchedAt -> resolvedAt, the war's actual real-world duration (not the
// fixed 24h+24h prep/battle windows - a war can resolve early if every
// member on both sides has already run). "Duration" per the brief.
function formatDuration(startValue, endValue) {
  if (!startValue || !endValue) return null
  const start = new Date(startValue).getTime()
  const end = new Date(endValue).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
  const totalMins = Math.round((end - start) / 60000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return `${days}d ${remHours}h`
  }
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function errorText(err, fallback) {
  return err instanceof ApiError ? err.message : fallback
}

// Highest contribution first; anyone who didn't run sinks to the bottom
// regardless of score (a no-run is always worse than any real run) -
// see the brief's "members who didn't run go at the bottom, greyed out."
// The row's rank number is just this sorted position (i + 1) - one
// definition of "ranked by points" for both the list and the summary bar.
function sortByContribution(list) {
  return [...(list || [])].sort((a, b) => {
    const aRan = Boolean(a.runId)
    const bRan = Boolean(b.runId)
    if (aRan !== bRan) return aRan ? -1 : 1
    return (b.contributedScore || 0) - (a.contributedScore || 0)
  })
}

// Flat per-war reward, only ever paid to a winning-side participant who ran
// (ClubWarServiceImpl#payoutRewards - checked directly: it iterates the
// winning club's participants, filters to `run != null`, and awards exactly
// clubWarProperties.getWinXpAmount(), mirrored here as
// CLUB_WAR_REWARDS.winXp). A completed war's `rewarded` flag is already the
// settled outcome of that filter, so this reads it straight off instead of
// re-deriving "did my side win" separately - correct for both squads (a
// losing/drawn participant's `rewarded` is always false) with no extra
// data needed.
function participantXp(p) {
  return p.rewarded ? CLUB_WAR_REWARDS.winXp : null
}

// Per-club summary row (brief: "total points, members who ran / total,
// total km, average points per runner"). totalPoints prefers the club's
// own declared score (what actually decided the war) over the sum of
// member contributions - mismatch flags when those two disagree by more
// than float/rounding noise, which the brief asked to surface rather than
// silently show two numbers that don't add up. totalDistance is only ever
// non-null once the backend sends each participant's `distance` (see this
// file's own header comment) - every member who ran needs it, or it's
// left out entirely rather than silently undercounting.
function squadTotals(list, declaredScore) {
  const all = list || []
  const ran = all.filter((p) => p.runId)
  const summedScore = ran.reduce((sum, p) => sum + (p.contributedScore || 0), 0)
  const totalPoints = declaredScore != null ? declaredScore : summedScore
  return {
    totalPoints,
    summedScore,
    ranCount: ran.length,
    totalCount: all.length,
    avgPerRunner: ran.length ? totalPoints / ran.length : null,
    totalDistance:
      ran.length > 0 && ran.every((p) => p.distance != null)
        ? ran.reduce((sum, p) => sum + p.distance, 0)
        : null,
    mismatch:
      declaredScore != null && Math.abs(summedScore - declaredScore) > 0.5,
  }
}

// "10:42 AM" - when the one war run was actually submitted (distinct from
// formatDate above, which is the war's own resolution date in the list/
// banner).
function formatTimeOfDay(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Past (COMPLETED) club wars - a list, paginated against the real backend
// endpoint (see getClubWarHistory in api/clubWar.js), tap a row for the
// full breakdown (both squads' per-player contribution). Mounted as a
// full-screen takeover of ClubWarPanel (see its historyOpen state) rather
// than a route, same pattern the rest of the game's in-menu screens use.
//
// NOTE: the backend's ClubWarParticipantScoreResponse has no distance/
// duration/avgPace/heroBonus fields yet (confirmed by reading it directly -
// only pace/effort SCORE components and the final contributedScore, not the
// real running stats behind them). Every per-member stat below reads these
// optional fields defensively (`p.distance`, `p.duration`, `p.avgPace`,
// `p.heroBonus`) and simply renders nothing for a field that's missing, per
// the brief's own "use only real fields; hide any stat the backend doesn't
// send" - so this component needs no further change once the backend adds
// them (see SESSION_NOTES.md's own handoff spec for the exact DTO/method
// addition: Run.distance/duration/avgPace are already loaded via
// participant.getRun() in ClubWarServiceImpl#toParticipantScores, and
// RunScoreBreakdownResponse already has a heroBonusFor() computation ready
// to reuse - this is a response-field addition, not new data).
export default function ClubWarHistory({ userId, onClose, onViewProfile }) {
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [wars, setWars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  // "<squadKey>:<userId>" of the one expanded participant row, or null -
  // shared across both squad columns so "one open at a time" (brief's own
  // words) holds for the whole detail view, not just within one club.
  const [expandedKey, setExpandedKey] = useState(null)

  const load = useCallback(async (nextPage) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getClubWarHistory(nextPage, PAGE_SIZE)
      setWars(data?.content || [])
      setPage(nextPage)
      setTotalPages(data?.totalPages || 1)
    } catch (err) {
      setError(errorText(err, 'Could not load war history.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(1)
  }, [load])

  async function openWar(warId) {
    setSelectedId(warId)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    setExpandedKey(null)
    try {
      const data = await getClubWarHistoryDetail(warId)
      setDetail(data)
    } catch (err) {
      setDetailError(errorText(err, 'Could not load that war.'))
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setSelectedId(null)
    setDetail(null)
    setExpandedKey(null)
  }

  // squadKey/squadScore drive the shared expandedKey + the contribution-%
  // bar (each row's slice of ITS OWN club's declared total, not the
  // opponent's) - both squads call this with their own list.
  const participantRows = (list, squadKey, squadScore, squadName) => {
    const sorted = sortByContribution(list)
    const hasScores = sorted.some((p) => p.contributedScore != null)
    // Top scorer, within this squad - not awarded if nobody on this side
    // ran, or if there's nothing to actually rank them by.
    const mvpUserId = hasScores ? sorted.find((p) => p.runId)?.userId : null

    return (
      <ul className="club-war-history-participants">
        {sorted.map((p, i) => {
          const ran = Boolean(p.runId)
          const isMe = p.userId === userId
          const rowKey = `${squadKey}:${p.userId}`
          const isOpen = expandedKey === rowKey
          // The backend's own heroName field reads straight off the
          // StoreItem's name column (ClubWarServiceImpl#toParticipantScores
          // - checked directly), which for this item is still literally
          // "Default Hero" (see isPlaceholderHero) even though the
          // underlying hero itself was renamed to Comet - never shown
          // as-is, same substitution ClubWarPanel's live roster applies.
          const heroName = p.heroName
            ? isPlaceholderHero(p.heroName)
              ? DEFAULT_HERO_NAME
              : p.heroName
            : DEFAULT_HERO_NAME
          const distanceText =
            ran && p.distance != null ? formatDistance(p.distance) : null
          const timeText =
            ran && p.duration != null ? formatRunDuration(p.duration) : null
          const paceText =
            ran && p.avgPace != null ? formatPace(p.avgPace) : null
          const xp = ran ? participantXp(p) : null
          const hasStatLine = Boolean(
            distanceText || timeText || paceText || xp != null
          )
          const contributionPct =
            ran && squadScore
              ? Math.max(
                  0,
                  Math.min(100, ((p.contributedScore || 0) / squadScore) * 100)
                )
              : null
          const runTimeOfDay = formatTimeOfDay(p.runSubmittedAt)

          return (
            <li key={p.userId}>
              <button
                type="button"
                className={`club-war-history-participant ${isMe ? 'is-me' : ''} ${!ran ? 'is-no-run' : ''} ${isOpen ? 'is-open' : ''}`}
                onClick={() => setExpandedKey(isOpen ? null : rowKey)}
                aria-expanded={isOpen}
              >
                <span className="club-war-history-rank">{i + 1}</span>
                <span className="club-war-history-avatar">
                  {/* Same hero-slot icon as the live roster (squadList in
                      ClubWarPanel.jsx) - a flat icon standing in for
                      "has a hero locked in", not a per-hero portrait (see
                      ClubWarMemberAvatar's own comment); the helmet is
                      that same view's fallback for no hero data. */}
                  {p.heroName ? <ClubWarMemberAvatar /> : <IconHelmet />}
                </span>
                <span className="club-war-history-info">
                  <span className="club-war-history-name">
                    {isMe ? 'You' : playerNameOf(p)}
                    {isMe && <span className="club-war-you-tag">You</span>}
                    {p.userId === mvpUserId && (
                      <span
                        className="club-war-mvp-badge"
                        title="MVP - top contributor"
                      >
                        <IconCrown />
                      </span>
                    )}
                  </span>
                  <span className="club-war-history-hero">{heroName}</span>
                  {/* Compact stat line - only the fields this participant
                      actually has (brief: "only the ones available"). XP
                      is the one field derivable today without a backend
                      change (see participantXp above); distance/time/pace
                      stay dark until the backend sends them. */}
                  {hasStatLine && (
                    <span className="club-war-history-stats">
                      {distanceText && (
                        <span className="club-war-history-stat">
                          <IconRunning /> {distanceText}
                        </span>
                      )}
                      {timeText && (
                        <span className="club-war-history-stat">
                          <IconClock /> {timeText}
                        </span>
                      )}
                      {paceText && (
                        <span className="club-war-history-stat">
                          <IconBolt /> {paceText}
                        </span>
                      )}
                      {xp != null && (
                        <span className="club-war-history-stat club-war-history-stat-xp">
                          +{formatNumber(xp)} XP
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className="club-war-history-participant-result">
                  <span
                    className={`club-war-run-badge ${ran ? 'is-done' : 'is-missed'}`}
                    title={ran ? runOutcomeLabel(p.runOutcome) : 'Did not run'}
                  >
                    {ran ? <IconCheck /> : <IconClose />}
                  </span>
                  <span
                    className={`club-war-history-points ${ran ? '' : 'is-muted'}`}
                  >
                    {ran ? `+${formatScore(p.contributedScore)}` : '0'} pts
                  </span>
                  <span className="club-war-history-result-label">
                    {ran ? 'RAN' : 'MISSED'}
                  </span>
                </span>
                {ran && (
                  <IconChevronDown
                    className={`club-war-history-expand-chevron ${isOpen ? 'is-open' : ''}`}
                  />
                )}
              </button>
              {isOpen && ran && (
                <div className="club-war-history-expanded">
                  <ul className="club-war-history-expanded-runs">
                    {/* Exactly one run per member per war today (see
                        api/clubWar.js's own flow comment) - rendered as a
                        list of one anyway so a future multi-run war scores
                        the same way with no markup change. */}
                    <li className="club-war-history-expanded-run">
                      {runTimeOfDay && (
                        <span className="club-war-history-expanded-run-time">
                          {runTimeOfDay}
                        </span>
                      )}
                      {distanceText && <span>{distanceText}</span>}
                      {paceText && <span>{paceText}</span>}
                      <span className="club-war-history-expanded-run-points">
                        +{formatScore(p.contributedScore)} pts
                      </span>
                    </li>
                  </ul>
                  {p.heroBonus?.totalBonus > 0 && (
                    <p className="club-war-history-perk-bonus">
                      +{formatScore(p.heroBonus.totalBonus)} from{' '}
                      {p.heroBonus.heroName || heroName} perk
                    </p>
                  )}
                  {contributionPct != null && (
                    <div className="club-war-history-contribution">
                      <span className="club-war-history-contribution-label">
                        {Math.round(contributionPct)}% of {squadName || 'club'}{' '}
                        total
                      </span>
                      <div
                        className="club-war-history-contribution-bar"
                        role="progressbar"
                        aria-valuenow={Math.round(contributionPct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="club-war-history-contribution-fill"
                          style={{ width: `${contributionPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="club-war-history-view-profile"
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewProfile?.({
                        userId: p.userId,
                        fullName: p.fullName,
                        nickname: p.nickname,
                        profilePictureUrl: p.profilePictureUrl,
                      })
                    }}
                  >
                    View Profile
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="game-cards">
      <section className="game-card game-card-dark club-war-history-head">
        {selectedId ? (
          <button
            type="button"
            className="club-war-history-back"
            onClick={closeDetail}
            aria-label="Back to war history"
          >
            <IconChevronLeft />
          </button>
        ) : (
          <span />
        )}
        <h3 className="game-card-title game-card-title-sm">War History</h3>
        <button
          type="button"
          className="game-close-btn club-war-history-close"
          onClick={onClose}
          aria-label="Close war history"
        >
          <IconClose />
        </button>
      </section>

      {!selectedId ? (
        <>
          {error ? (
            <p className="game-menu-empty">{error}</p>
          ) : loading ? (
            <ul
              className="game-rows club-war-history-list"
              aria-label="Loading past wars"
            >
              {SKELETON_WAR_ROWS.map((row) => (
                <li key={row} className="club-war-history-skeleton-row">
                  <span className="g-skeleton club-war-history-skeleton-badges" />
                  <span className="club-war-history-skeleton-info">
                    <span className="g-skeleton club-war-history-skeleton-name" />
                    <span className="g-skeleton club-war-history-skeleton-meta" />
                  </span>
                  <span className="g-skeleton club-war-history-skeleton-result" />
                </li>
              ))}
            </ul>
          ) : wars.length === 0 ? (
            <p className="game-menu-empty">
              No wars yet - start one from the War Room.
            </p>
          ) : (
            <ul className="game-rows club-war-history-list">
              {wars.map((w) => {
                const won = w.result === 'WIN'
                const lost = w.result === 'LOSS'
                return (
                  <li key={w.warId}>
                    <button
                      type="button"
                      className="game-row game-row-clickable club-war-history-row"
                      onClick={() => openWar(w.warId)}
                    >
                      <span className="club-war-history-badges">
                        <ClubBadge
                          name={w.myClubName}
                          size={30}
                          className="club-war-history-badge-mine"
                        />
                        <ClubBadge name={w.opponentClubName} size={30} />
                      </span>
                      <span className="game-row-info">
                        <span className="game-row-name">
                          {w.myClubName} vs {w.opponentClubName}
                        </span>
                        <span className="game-row-meta">
                          {formatDate(w.resolvedAt || w.battleEndsAt)} ·{' '}
                          {formatScore(w.myScore)} -{' '}
                          {formatScore(w.opponentScore)}
                        </span>
                      </span>
                      <span
                        className={`club-war-history-result ${won ? 'is-won' : lost ? 'is-lost' : ''}`}
                      >
                        {resultLabel(w.result)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="game-route-pager">
              <button
                type="button"
                className="game-btn game-btn-wood game-btn-sm"
                aria-label="Show previous wars"
                disabled={page <= 1}
                onClick={() => load(page - 1)}
              >
                ◀
              </button>
              <span className="game-route-pager-label">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="game-btn game-btn-wood game-btn-sm"
                aria-label="Show more wars"
                disabled={page >= totalPages}
                onClick={() => load(page + 1)}
              >
                ▶
              </button>
            </div>
          )}
        </>
      ) : detailError ? (
        <p className="game-menu-empty">{detailError}</p>
      ) : detailLoading || !detail ? (
        <div className="club-war-history-detail" aria-label="Loading war">
          <section className="game-card game-card-dark club-war-banner">
            <span className="g-skeleton club-war-skeleton-phase" />
            <div className="club-war-vs">
              <div className="club-war-side">
                <span className="g-skeleton club-war-skeleton-crest" />
                <span className="g-skeleton club-war-skeleton-side-name" />
              </div>
              <span className="g-skeleton club-war-skeleton-vs-badge" />
              <div className="club-war-side">
                <span className="g-skeleton club-war-skeleton-crest" />
                <span className="g-skeleton club-war-skeleton-side-name" />
              </div>
            </div>
            <span className="g-skeleton club-war-skeleton-sub" />
          </section>
          <div className="club-war-history-squads">
            {[0, 1].map((col) => (
              <section
                key={col}
                className="game-card game-card-dark club-war-history-squad"
              >
                <div className="club-war-history-squad-head">
                  <span className="g-skeleton club-war-skeleton-badge" />
                  <span className="g-skeleton club-war-skeleton-name" />
                </div>
                {/* Sized to the real row's new min-height (84px, see
                    ClubPanel.css) - the whole point of "update the
                    skeleton to match the new row height" is that this
                    can't just reuse the live roster's shorter skeleton
                    row above. */}
                {SKELETON_PARTICIPANT_ROWS.map((row) => (
                  <span
                    key={row}
                    className="g-skeleton club-war-history-skeleton-participant"
                  />
                ))}
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="club-war-history-detail">
          <section className="game-card game-card-dark club-war-banner">
            <span className="club-war-phase phase-completed">
              {resultLabel(detail.result)}
            </span>
            <div className="club-war-vs">
              <div className="club-war-side">
                <ClubBadge name={detail.myClubName} size={56} />
                <span className="game-row-name">{detail.myClubName}</span>
                <span className="club-war-score">
                  {formatScore(detail.myScore)}
                </span>
              </div>
              <span className="game-card-title club-war-vs-label">VS</span>
              <div className="club-war-side">
                <ClubBadge name={detail.opponentClubName} size={56} />
                <span className="game-row-name">{detail.opponentClubName}</span>
                <span className="club-war-score">
                  {formatScore(detail.opponentScore)}
                </span>
              </div>
            </div>
            <p className="game-row-meta club-war-sub">
              {detail.squadSize} vs {detail.squadSize} ·{' '}
              {formatDate(detail.resolvedAt || detail.battleEndsAt)}
              {formatDuration(detail.matchedAt, detail.resolvedAt) &&
                ` · ${formatDuration(detail.matchedAt, detail.resolvedAt)} war`}
            </p>
          </section>

          <div className="club-war-history-squads">
            {[
              {
                key: 'mine',
                name: detail.myClubName,
                score: detail.myScore,
                list: detail.myParticipants,
              },
              {
                key: 'opponent',
                name: detail.opponentClubName,
                score: detail.opponentScore,
                list: detail.opponentParticipants,
              },
            ].map((squad) => {
              const totals = squadTotals(squad.list, squad.score)
              return (
                <section
                  key={squad.key}
                  className="game-card game-card-dark club-war-history-squad"
                >
                  <div className="club-war-history-squad-head">
                    <ClubBadge name={squad.name} size={28} />
                    <span className="club-war-history-squad-name">
                      {squad.name}
                    </span>
                    <span className="club-war-history-squad-score">
                      {formatScore(squad.score)}
                    </span>
                  </div>
                  {/* Summary row (brief: "total points, members who ran /
                      total, total km, average points per runner") - total
                      km only once the backend sends per-member distance
                      (see squadTotals above), everything else is always
                      derivable from what the API already returns today. */}
                  <p className="club-war-history-squad-summary">
                    <span>
                      <strong>{formatScore(totals.totalPoints)}</strong> pts
                      {totals.mismatch && (
                        <span
                          className="club-war-history-mismatch"
                          title={`Member points sum to ${formatScore(totals.summedScore)}, but the club's declared total is ${formatScore(totals.totalPoints)}`}
                        >
                          ⚠
                        </span>
                      )}
                    </span>
                    <span>
                      {totals.ranCount}/{totals.totalCount} ran
                    </span>
                    {totals.totalDistance != null && (
                      <span>{formatDistance(totals.totalDistance)}</span>
                    )}
                    {totals.avgPerRunner != null && (
                      <span>{formatScore(totals.avgPerRunner)} avg/runner</span>
                    )}
                  </p>
                  {participantRows(
                    squad.list,
                    squad.key,
                    squad.score,
                    squad.name
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
