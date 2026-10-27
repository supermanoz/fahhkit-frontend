import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError, canManageEvents, isAdmin } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { formatName } from '../utils/format'
import {
  findFraudFlags,
  findModeratorRuns,
  getModeratorRunDetail,
  lockUser,
  reviewFraudFlag,
} from '../api/moderation'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import RunMap from '../components/RunMap'
import './FraudFlagsPage.css'

const PAGE_SIZE = 20
const STATUS_TABS = [
  { id: 'PENDING', label: 'Pending' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'DISMISSED', label: 'Dismissed' },
  { id: 'ALL', label: 'All' },
]

function errorText(err, fallback) {
  return err instanceof ApiError ? err.message : fallback
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

function formatDistance(meters) {
  if (meters == null) return '—'
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${Math.round(meters)} m`
}

function formatPace(secPerKm) {
  if (secPerKm == null) return '—'
  const mins = Math.floor(secPerKm / 60)
  const secs = Math.round(secPerKm % 60)
  return `${mins}:${String(secs).padStart(2, '0')} /km`
}

// Highest speed (m/s -> km/h) seen across a run's recorded points - the
// quickest way to eyeball "did this run have an impossible spike" without
// reading every point's speed by hand.
function maxSpeedKmh(points) {
  if (!points || points.length === 0) return null
  const max = Math.max(...points.map((p) => p.speed || 0))
  return max > 0 ? (max * 3.6).toFixed(1) : null
}

// Moderator/admin-only anti-cheat review queue (see src/api/moderation.js).
// Gated BOTH here (canManageEvents - ADMIN or MODERATOR) and server-side
// (the backend's SecurityConfig requires the same roles on every
// /v1/fraud-flag and /v1/moderator endpoint, confirmed by reading it - this
// frontend check is a UX convenience, not the actual security boundary).
// Banning a player (lockUser) is a stricter ADMIN-only action server-side,
// so that one button is additionally gated with isAdmin.
export default function FraudFlagsPage() {
  const { user, loading: userLoading } = useCurrentUser()
  const allowed = canManageEvents(user)
  const canBan = isAdmin(user)

  const [status, setStatus] = useState('PENDING')
  const [flags, setFlags] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyFlagId, setBusyFlagId] = useState(null)
  const [actionError, setActionError] = useState(null)

  // Drill-down: a flagged player's runs, then one run's full detail.
  const [player, setPlayer] = useState(null)
  const [runs, setRuns] = useState([])
  const [runsPage, setRunsPage] = useState(1)
  const [runsTotalPages, setRunsTotalPages] = useState(1)
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [runDetailLoading, setRunDetailLoading] = useState(false)
  const [confirmBan, setConfirmBan] = useState(false)
  const [banBusy, setBanBusy] = useState(false)
  const [banError, setBanError] = useState(null)
  const [banDone, setBanDone] = useState(false)

  async function loadFlags(nextPage) {
    setLoading(true)
    setError(null)
    try {
      const data = await findFraudFlags(
        status === 'ALL' ? null : status,
        nextPage,
        PAGE_SIZE
      )
      setFlags(data?.content || [])
      setPage(nextPage)
      setTotalPages(data?.totalPages || 1)
    } catch (err) {
      setError(errorText(err, 'Could not load flagged players.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    loadFlags(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, allowed, status])

  async function loadRuns(userId, nextPage) {
    setRunsLoading(true)
    setRunsError(null)
    try {
      const data = await findModeratorRuns(userId, nextPage, PAGE_SIZE)
      setRuns(data?.content || [])
      setRunsPage(nextPage)
      setRunsTotalPages(data?.totalPages || 1)
    } catch (err) {
      setRunsError(errorText(err, 'Could not load this player’s runs.'))
    } finally {
      setRunsLoading(false)
    }
  }

  function openPlayer(flag) {
    setPlayer(flag)
    setRunDetail(null)
    setConfirmBan(false)
    setBanError(null)
    setBanDone(false)
    loadRuns(flag.userId, 1)
  }

  function backToFlags() {
    setPlayer(null)
    setRuns([])
    setRunDetail(null)
  }

  async function openRun(runId) {
    setRunDetailLoading(true)
    setRunsError(null)
    try {
      const detail = await getModeratorRunDetail(runId)
      setRunDetail(detail)
    } catch (err) {
      setRunsError(errorText(err, 'Could not load that run.'))
    } finally {
      setRunDetailLoading(false)
    }
  }

  async function handleReview(flag, nextStatus) {
    setBusyFlagId(flag.id)
    setActionError(null)
    try {
      await reviewFraudFlag(flag.id, nextStatus)
      await loadFlags(page)
      if (player?.id === flag.id)
        setPlayer((p) => ({ ...p, status: nextStatus }))
    } catch (err) {
      setActionError(errorText(err, 'Could not update that flag.'))
    } finally {
      setBusyFlagId(null)
    }
  }

  async function handleBan() {
    if (!confirmBan) {
      setConfirmBan(true)
      return
    }
    setBanBusy(true)
    setBanError(null)
    try {
      await lockUser(
        player.userId,
        `Fraud flag #${player.id}: ${player.reason}`
      )
      setBanDone(true)
      setConfirmBan(false)
    } catch (err) {
      setBanError(errorText(err, 'Could not lock that account.'))
    } finally {
      setBanBusy(false)
    }
  }

  if (userLoading) {
    return (
      <div className="fraud-page">
        <Navbar />
        <div className="fraud-wrap">
          <p className="moderators-muted">Loading…</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="fraud-page">
      <Navbar />
      <div className="fraud-wrap">
        {!player ? (
          <>
            <header className="moderators-header" data-aos="fade-down">
              <div>
                <h1>Fraud Flags</h1>
                <p>Review flagged players and their run history.</p>
              </div>
            </header>

            <div className="fraud-status-tabs">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`fraud-status-tab ${status === tab.id ? 'active' : ''}`}
                  onClick={() => setStatus(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {error && <div className="banner error">{error}</div>}
            {actionError && <div className="banner error">{actionError}</div>}
            {loading ? (
              <p className="moderators-muted">Loading flagged players…</p>
            ) : flags.length === 0 ? (
              <p className="moderators-muted">
                No {status === 'ALL' ? '' : status.toLowerCase()} flags right
                now.
              </p>
            ) : (
              <ul className="fraud-flag-list">
                {flags.map((flag) => (
                  <li key={flag.id} className="fraud-flag-card">
                    <button
                      type="button"
                      className="fraud-flag-main"
                      onClick={() => openPlayer(flag)}
                    >
                      <span className="fraud-flag-avatar">
                        {(flag.userFullName || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="fraud-flag-info">
                        <span className="fraud-flag-name">
                          {formatName(flag.userFullName)}
                          {flag.userNickname ? ` (${flag.userNickname})` : ''}
                        </span>
                        <span className="fraud-flag-reason">{flag.reason}</span>
                        <span className="fraud-flag-meta">
                          {flag.source} · {formatDate(flag.createdDate)}
                          {flag.userTotalFlags > 1
                            ? ` · ${flag.userTotalFlags} total flags`
                            : ''}
                        </span>
                      </span>
                      <span
                        className={`fraud-status-pill status-${flag.status?.toLowerCase()}`}
                      >
                        {flag.status}
                      </span>
                    </button>
                    {flag.status === 'PENDING' && (
                      <div className="fraud-flag-actions">
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={busyFlagId === flag.id}
                          onClick={() => handleReview(flag, 'DISMISSED')}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyFlagId === flag.id}
                          onClick={() => handleReview(flag, 'CONFIRMED')}
                        >
                          {busyFlagId === flag.id ? 'Working…' : 'Confirm'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <div className="fraud-pager">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={page <= 1}
                  onClick={() => loadFlags(page - 1)}
                >
                  ← Prev
                </button>
                <span className="fraud-pager-label">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={page >= totalPages}
                  onClick={() => loadFlags(page + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        ) : !runDetail ? (
          <>
            <header className="moderators-header" data-aos="fade-down">
              <div>
                <button
                  type="button"
                  className="fraud-back-link"
                  onClick={backToFlags}
                >
                  ← Back to flags
                </button>
                <h1>{formatName(player.userFullName)}</h1>
                <p>
                  Flagged for: {player.reason} ·{' '}
                  <span
                    className={`fraud-status-pill status-${player.status?.toLowerCase()}`}
                  >
                    {player.status}
                  </span>
                </p>
              </div>
              {canBan && (
                <div className="fraud-ban-box">
                  {banDone ? (
                    <span className="fraud-ban-done">Account locked</span>
                  ) : (
                    <button
                      type="button"
                      className={`fraud-ban-btn ${confirmBan ? 'is-confirming' : ''}`}
                      onClick={handleBan}
                      disabled={banBusy}
                    >
                      {banBusy
                        ? 'Locking…'
                        : confirmBan
                          ? 'Tap again to confirm ban'
                          : 'Lock Account'}
                    </button>
                  )}
                  {banError && <p className="fraud-ban-error">{banError}</p>}
                </div>
              )}
            </header>

            {runsError && <div className="banner error">{runsError}</div>}
            {runsLoading ? (
              <p className="moderators-muted">Loading runs…</p>
            ) : runs.length === 0 ? (
              <p className="moderators-muted">
                This player has no logged runs.
              </p>
            ) : (
              <ul className="fraud-run-list">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      className={`fraud-run-row ${run.flagged ? 'is-flagged' : ''}`}
                      onClick={() => openRun(run.id)}
                    >
                      <span className="fraud-run-info">
                        <span className="fraud-run-mode">
                          {run.mode || 'Run'} · {formatDate(run.startedAt)}
                        </span>
                        <span className="fraud-run-meta">
                          {formatDistance(run.distance)} ·{' '}
                          {formatPace(run.avgPace)} · {run.outcome}
                        </span>
                      </span>
                      {run.flagged && (
                        <span className="fraud-run-flagged-pill">Flagged</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {runsTotalPages > 1 && (
              <div className="fraud-pager">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={runsPage <= 1}
                  onClick={() => loadRuns(player.userId, runsPage - 1)}
                >
                  ← Prev
                </button>
                <span className="fraud-pager-label">
                  Page {runsPage} of {runsTotalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={runsPage >= runsTotalPages}
                  onClick={() => loadRuns(player.userId, runsPage + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <header className="moderators-header" data-aos="fade-down">
              <div>
                <button
                  type="button"
                  className="fraud-back-link"
                  onClick={() => setRunDetail(null)}
                >
                  ← Back to runs
                </button>
                <h1>Run detail</h1>
              </div>
            </header>
            {runDetailLoading ? (
              <p className="moderators-muted">Loading run…</p>
            ) : (
              <div className="fraud-run-detail">
                <div className="fraud-run-stats">
                  <div className="fraud-run-stat">
                    <span className="fraud-run-stat-value">
                      {formatDistance(runDetail.run?.distance)}
                    </span>
                    <span className="fraud-run-stat-label">Distance</span>
                  </div>
                  <div className="fraud-run-stat">
                    <span className="fraud-run-stat-value">
                      {formatPace(runDetail.run?.avgPace)}
                    </span>
                    <span className="fraud-run-stat-label">Avg pace</span>
                  </div>
                  <div className="fraud-run-stat">
                    <span className="fraud-run-stat-value">
                      {maxSpeedKmh(runDetail.points) ?? '—'} km/h
                    </span>
                    <span className="fraud-run-stat-label">Peak speed</span>
                  </div>
                  <div className="fraud-run-stat">
                    <span className="fraud-run-stat-value">
                      {runDetail.run?.outcome || '—'}
                    </span>
                    <span className="fraud-run-stat-label">Outcome</span>
                  </div>
                </div>
                <RunMap points={runDetail.points} />
                {runDetail.flags?.length > 0 && (
                  <div className="fraud-run-flags">
                    <p className="fraud-run-flags-title">Flags on this run</p>
                    <ul>
                      {runDetail.flags.map((f) => (
                        <li key={f.id}>
                          {f.reason} ·{' '}
                          <span
                            className={`fraud-status-pill status-${f.status?.toLowerCase()}`}
                          >
                            {f.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
