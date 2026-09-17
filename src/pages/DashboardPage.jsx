import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError, getJson, isAdmin, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { EVENT_TYPE_LABELS, formatDate } from '../utils/events'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import DonutChart from '../components/DonutChart'
import MiniBarChart from '../components/charts/MiniBarChart'
import './DashboardPage.css'

// Buckets events by calendar month so the dashboard can show a trend of
// how event volume is moving, not just a single cumulative total.
function groupEventsByMonth(events) {
  const byMonth = new Map()
  events.forEach((event) => {
    if (!event.date) return
    const d = new Date(event.date)
    if (Number.isNaN(d.getTime())) return
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    const label = d.toLocaleString(undefined, {
      month: 'short',
      year: '2-digit',
    })
    byMonth.set(key, {
      key,
      label,
      value: (byMonth.get(key)?.value || 0) + 1,
      sort: d.getFullYear() * 12 + d.getMonth(),
    })
  })
  return [...byMonth.values()].sort((a, b) => a.sort - b.sort).slice(-6)
}

const EVENT_STATUS_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

function formatKm(km) {
  if (!km) return '0'
  if (km >= 1000) return `${(km / 1000).toFixed(1)}K`
  return `${Math.round(km)}`
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useCurrentUser()
  const [stats, setStats] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const allowed = isAdmin(user)

  const eventsByMonth = useMemo(() => groupEventsByMonth(events), [events])

  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    Promise.all([
      getJson('/v1/event/accomplishment'),
      postJson('/v1/user/find', {
        pageNumber: 1,
        noOfRecords: 1,
        actionType: 'FILTER',
        search: [{ field: 'userType', value: 'ATHLETE', type: 'exact' }],
      }),
      postJson('/v1/user/moderator/find', { pageNumber: 1, noOfRecords: 1 }),
      postJson('/v1/event/moderator/all', { pageNumber: 1, noOfRecords: 500 }),
    ])
      .then(([accomplishment, athletePage, moderatorPage, allEvents]) => {
        setStats({
          totalAthletes: athletePage?.totalElements ?? 0,
          totalModerators: moderatorPage?.totalElements ?? 0,
          joinedMembers: accomplishment?.joinedMembers ?? 0,
          kmLogged: accomplishment?.kmLogged ?? 0,
          runningMonths: accomplishment?.runningMonths ?? 0,
        })
        setEvents(allEvents?.content || [])
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load dashboard data. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [userLoading, allowed])

  if (userLoading) {
    return (
      <div className="dashboard-page">
        <Navbar />
        <div className="dashboard-wrap">
          <p className="dashboard-muted">Loading...</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="dashboard-page">
      <Navbar />
      <div className="dashboard-wrap">
        <header className="dashboard-header" data-aos="fade-down">
          <h1>Dashboard</h1>
          <p>A quick pulse on the club — members, moderators, and events.</p>
        </header>

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="dashboard-muted">Loading dashboard...</p>}

        {!loading && !error && stats && (
          <>
            <div className="dashboard-stats-grid" data-aos="fade-up">
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-number">
                  {stats.totalAthletes}
                </span>
                <span className="dashboard-stat-label">Athletes</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-number">
                  {stats.totalModerators}
                </span>
                <span className="dashboard-stat-label">Moderators</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-number">{events.length}</span>
                <span className="dashboard-stat-label">Total Events</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-number">
                  {stats.joinedMembers}
                </span>
                <span className="dashboard-stat-label">Members Joined</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-number">
                  {formatKm(stats.kmLogged)}
                </span>
                <span className="dashboard-stat-label">KM Logged</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-number">
                  {stats.runningMonths}
                </span>
                <span className="dashboard-stat-label">Months Running</span>
              </div>
            </div>

            <div className="dashboard-chart-card glass-card" data-aos="fade-up">
              <DonutChart
                data={[
                  {
                    label: 'Athletes',
                    value: stats.totalAthletes,
                    color: 'var(--brand)',
                  },
                  {
                    label: 'Moderators',
                    value: stats.totalModerators,
                    color: 'var(--success)',
                  },
                ]}
              />
              <div className="dashboard-chart-legend">
                <span className="dashboard-legend-item">
                  <span
                    className="dashboard-legend-dot"
                    style={{ background: 'var(--brand)' }}
                  />
                  Athletes ({stats.totalAthletes})
                </span>
                <span className="dashboard-legend-item">
                  <span
                    className="dashboard-legend-dot"
                    style={{ background: 'var(--success)' }}
                  />
                  Moderators ({stats.totalModerators})
                </span>
              </div>
            </div>

            {eventsByMonth.length > 1 && (
              <div
                className="dashboard-chart-card glass-card dashboard-trend-card"
                data-aos="fade-up"
              >
                <div className="dashboard-trend-header">
                  <h2>Events per Month</h2>
                  <p className="dashboard-muted">
                    Event volume over the last {eventsByMonth.length} months.
                  </p>
                </div>
                <MiniBarChart data={eventsByMonth} color="var(--brand)" />
              </div>
            )}

            <section className="dashboard-events-section" data-aos="fade-up">
              <h2>Events</h2>
              <p className="dashboard-muted">
                Click an event to see its registration report.
              </p>

              {events.length === 0 ? (
                <p className="dashboard-muted">No events yet.</p>
              ) : (
                <div className="dashboard-events-list">
                  {events.map((event) => (
                    <Link
                      to={`/events/${event.id}/registrations`}
                      className="dashboard-event-row"
                      key={event.id}
                    >
                      <div className="dashboard-event-info">
                        <span className="dashboard-event-name">
                          {event.name}
                        </span>
                        <span className="dashboard-event-meta">
                          {EVENT_TYPE_LABELS[event.type] || event.type} &middot;{' '}
                          {formatDate(event.date)}
                        </span>
                      </div>
                      <span
                        className={`dashboard-event-status status-${(event.status || '').toLowerCase()}`}
                      >
                        {EVENT_STATUS_LABELS[event.status] || event.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
