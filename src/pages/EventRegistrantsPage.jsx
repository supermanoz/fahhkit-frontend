import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ApiError, canManageEvents, getJson, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { formatName } from '../utils/format'
import { formatDate } from '../utils/events'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './EventRegistrantsPage.css'

const STATUS_LABELS = {
  PAID: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

const PAGE_SIZE = 30

// Only athletes can be applicants for an event — admins/moderators are
// excluded even if one of them happens to have a registration row. This
// join-filter (rather than fetching every registrant and every athlete to
// cross-reference client-side) is what lets the table below page through
// the backend 30 at a time instead of pulling the whole roster up front.
const ATHLETE_ONLY_FILTER = [
  { field: 'userType', value: 'ATHLETE', type: 'object', object: 'user' },
]

export default function EventRegistrantsPage() {
  const { id } = useParams()
  const { user, loading: userLoading } = useCurrentUser()
  const [event, setEvent] = useState(null)
  const [registrants, setRegistrants] = useState([])
  const [athleteById, setAthleteById] = useState(new Map())
  const [stats, setStats] = useState({ paid: 0, pending: 0 })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [error, setError] = useState(null)

  const allowed = canManageEvents(user)

  const report = useMemo(() => {
    const entryFee = Number(event?.entryFee) || 0
    return {
      total: stats.paid + stats.pending,
      paid: stats.paid,
      pending: stats.pending,
      // /v1/event/{id}/registrations only ever returns PENDING/PAID rows —
      // a FAILED/CANCELLED attempt never became a real registrant — so this
      // bucket is always empty.
      failedOrCancelled: 0,
      revenue: stats.paid * entryFee,
    }
  }, [stats, event])

  // A new event id invalidates whatever page we were on for the old one.
  useEffect(() => {
    setPage(1)
  }, [id])

  // Event details, the athlete roster (for mobile numbers), and the
  // paid/pending counts — loaded once per event, independent of which page
  // of the registrant table is showing.
  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      getJson(`/v1/event/${id}`),
      postJson('/v1/athlete/find', { pageNumber: 1, noOfRecords: 500 }),
      postJson(`/v1/event/${id}/registrations`, {
        pageNumber: 1,
        noOfRecords: 1,
        actionType: 'FILTER',
        search: [
          ...ATHLETE_ONLY_FILTER,
          { field: 'paymentStatus', value: 'PAID', type: 'exact' },
        ],
      }),
      postJson(`/v1/event/${id}/registrations`, {
        pageNumber: 1,
        noOfRecords: 1,
        actionType: 'FILTER',
        search: [
          ...ATHLETE_ONLY_FILTER,
          { field: 'paymentStatus', value: 'PENDING', type: 'exact' },
        ],
      }),
    ])
      .then(([eventData, athletesData, paidPage, pendingPage]) => {
        setEvent(eventData)
        setAthleteById(
          new Map((athletesData?.content || []).map((a) => [a.userId, a]))
        )
        setStats({
          paid: paidPage?.totalElements ?? 0,
          pending: pendingPage?.totalElements ?? 0,
        })
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load registrants. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [id, userLoading, allowed])

  // The actual table — fetched 30 rows at a time, refetched on every page
  // change, instead of loading every registrant up front and paging through
  // them in memory.
  useEffect(() => {
    if (userLoading || !allowed) return
    setTableLoading(true)
    postJson(`/v1/event/${id}/registrations`, {
      pageNumber: page,
      noOfRecords: PAGE_SIZE,
      actionType: 'FILTER',
      search: ATHLETE_ONLY_FILTER,
    })
      .then((data) => {
        setRegistrants(data?.content || [])
        setTotalPages(Math.max(1, data?.totalPages || 1))
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load registrants. Please try again.'
        )
      )
      .finally(() => setTableLoading(false))
  }, [id, page, userLoading, allowed])

  if (userLoading) {
    return (
      <div className="event-registrants-page">
        <Navbar />
        <div className="event-registrants-wrap">
          <p className="event-registrants-muted">Loading...</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to={`/events/${id}`} replace />
  }

  return (
    <div className="event-registrants-page">
      <Navbar />
      <div className="event-registrants-wrap">
        <p className="event-registrants-back">
          <Link to={`/events/${id}`}>&larr; Back to event</Link>
        </p>

        <header className="event-registrants-header" data-aos="fade-down">
          <div>
            <h1>Applicants{event ? ` — ${event.name}` : ''}</h1>
            <p>Everyone who&apos;s registered for this event.</p>
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="event-registrants-muted">Loading...</p>}
        {!loading && !error && !tableLoading && report.total === 0 && (
          <p className="event-registrants-muted">
            No one has registered for this event yet.
          </p>
        )}

        {!loading && !error && (tableLoading || report.total > 0) && (
          <div className="event-registrants-body">
            <div className="registrant-table-wrap">
              <table className="registrant-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile Number</th>
                    <th>Payment Status</th>
                    <th>Registered</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tableLoading && registrants.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="event-registrants-muted registrant-table-loading-cell"
                      >
                        Loading...
                      </td>
                    </tr>
                  )}
                  {registrants.map((registrant) => (
                    <tr key={registrant.registrationId}>
                      <td className="registrant-name-cell">
                        {formatName(registrant.fullName)}
                      </td>
                      <td>
                        {athleteById.get(registrant.userId)?.mobileNumber ||
                          '—'}
                      </td>
                      <td>
                        <span
                          className={`registrant-status status-${(registrant.paymentStatus || '').toLowerCase()}`}
                        >
                          {STATUS_LABELS[registrant.paymentStatus] ||
                            registrant.paymentStatus}
                        </span>
                      </td>
                      <td className="registrant-meta-cell">
                        {formatDate(registrant.registeredDate)}
                      </td>
                      <td>
                        <Link
                          to={`/athletes/${registrant.userId}`}
                          className="btn btn-outline"
                        >
                          View Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="registrant-table-pagination">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || tableLoading}
                  >
                    Previous
                  </button>
                  <span className="registrant-table-pagination-info">
                    {tableLoading
                      ? 'Loading…'
                      : `Page ${page} of ${totalPages}`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || tableLoading}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            <aside
              className="registrant-report glass-card"
              data-aos="fade-left"
            >
              <Link
                to={`/events/${id}/report`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-block"
              >
                View Detailed Report
              </Link>
              <dl className="registrant-report-list">
                <div>
                  <dt>Total Registrants</dt>
                  <dd>{report.total}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{report.paid}</dd>
                </div>
                <div>
                  <dt>Pending Payment</dt>
                  <dd>{report.pending}</dd>
                </div>
                <div>
                  <dt>Failed / Cancelled</dt>
                  <dd>{report.failedOrCancelled}</dd>
                </div>
                {Number(event?.entryFee) > 0 && (
                  <div>
                    <dt>Revenue Collected</dt>
                    <dd>{report.revenue}</dd>
                  </div>
                )}
              </dl>
            </aside>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
