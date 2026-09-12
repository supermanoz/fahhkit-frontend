import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError, getJson, isAdmin, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { EVENT_TYPE_LABELS, formatDate } from '../utils/events'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import DonutChart from '../components/DonutChart'
import './DashboardPage.css'

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
