/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getClubWarHistory, getClubWarHistoryDetail } from '../api/clubWar'
import { DEFAULT_HERO_NAME, isPlaceholderHero } from '../utils/hero'
import ClubBadge from './ClubBadge'
import ClubWarMemberAvatar from './ClubWarMemberAvatar'
import { IconCheck, IconChevronLeft, IconClose, IconTrophy } from './GameIcons'
import { playerNameOf } from '../utils/playerName'

// 10 per page - matches the backend's own default noOfRecords for this
// endpoint (see api/clubWar.js's getClubWarHistory).
const PAGE_SIZE = 10

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
  return score == null ? '—' : Math.round(score).toLocaleString()
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
function sortByContribution(list) {
  return [...(list || [])].sort((a, b) => {
    const aRan = Boolean(a.runId)
    const bRan = Boolean(b.runId)
    if (aRan !== bRan) return aRan ? -1 : 1
    return (b.contributedScore || 0) - (a.contributedScore || 0)
  })
}

// Past (COMPLETED) club wars - a list, paginated against the real backend
// endpoint (see getClubWarHistory in api/clubWar.js), tap a row for the
// full breakdown (both squads' per-player contribution). Mounted as a
// full-screen takeover of ClubWarPanel (see its historyOpen state) rather
// than a route, same pattern the rest of the game's in-menu screens use.
//
// NOTE: the backend's ClubWarParticipantScoreResponse has no distance
// field (confirmed by reading it directly) - only pace/effort score
// components and the final contributedScore. There's nothing to show for
// "distance run" per member without a backend change; this shows
// contributed score instead, which IS real.
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
  }

  const participantRows = (list) => {
    const sorted = sortByContribution(list)
    // MVP = top contributor who actually ran, within this squad - not
    // awarded if nobody on this side ran at all.
    const mvpUserId = sorted.find((p) => p.runId)?.userId

    return (
      <ul className="club-war-history-participants">
        {sorted.map((p) => {
          const ran = Boolean(p.runId)
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
          return (
            <li key={p.userId}>
              <button
                type="button"
                className={`game-row game-row-clickable club-war-history-participant ${p.userId === userId ? 'is-me' : ''} ${!ran ? 'is-no-run' : ''}`}
                onClick={() =>
                  onViewProfile?.({
                    userId: p.userId,
                    fullName: p.fullName,
                    nickname: p.nickname,
                  })
                }
              >
                <span className="club-war-history-avatar">
                  <ClubWarMemberAvatar />
                </span>
                <span className="game-row-info">
                  <span className="game-row-name">
                    {p.userId === userId ? 'You' : playerNameOf(p)}
                    {p.userId === mvpUserId && (
                      <span
                        className="club-war-mvp-badge"
                        title="Top contributor"
                      >
                        <IconTrophy /> MVP
                      </span>
                    )}
                  </span>
                  <span className="game-row-meta">{heroName}</span>
                </span>
                <span
                  className={`club-war-run-badge ${ran ? 'is-done' : 'is-missed'}`}
                  title={ran ? runOutcomeLabel(p.runOutcome) : 'Did not run'}
                >
                  {ran ? <IconCheck /> : <IconClose />}
                </span>
                <span className="club-war-points">
                  {ran ? formatScore(p.contributedScore) : '—'}
                </span>
              </button>
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
            <p className="game-menu-empty">Loading past wars…</p>
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
        <p className="game-menu-empty">Loading war…</p>
      ) : (
        <>
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

          <section className="game-card game-card-dark">
            <h3 className="game-card-title game-card-title-sm">
              {detail.myClubName}
            </h3>
            {participantRows(detail.myParticipants)}
          </section>

          <section className="game-card game-card-dark">
            <h3 className="game-card-title game-card-title-sm">
              {detail.opponentClubName}
            </h3>
            {participantRows(detail.opponentParticipants)}
          </section>
        </>
      )}
    </div>
  )
}
