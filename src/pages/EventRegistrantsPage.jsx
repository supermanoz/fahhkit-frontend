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

const PAGE_SIZE = 20

export default function EventRegistrantsPage() {
  const { id } = useParams()
  const { user, loading: userLoading } = useCurrentUser()
  const [event, setEvent] = useState(null)
  const [registrants, setRegistrants] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const allowed = canManageEvents(user)

  const totalPages = Math.max(1, Math.ceil(registrants.length / PAGE_SIZE))
  const pagedRegistrants = registrants.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  )

  const report = useMemo(() => {
    const paid = registrants.filter((r) => r.paymentStatus === 'PAID').length
    const pending = registrants.filter(
      (r) => r.paymentStatus === 'PENDING'
    ).length
    const failedOrCancelled = registrants.filter(
      (r) => r.paymentStatus === 'FAILED' || r.paymentStatus === 'CANCELLED'
    ).length
    const entryFee = Number(event?.entryFee) || 0
    return {
      total: registrants.length,
      paid,
      pending,
      failedOrCancelled,
      revenue: paid * entryFee,
    }
  }, [registrants, event])

  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    Promise.all([
      getJson(`/v1/event/${id}`),
      postJson(`/v1/event/${id}/registrations`, {
        pageNumber: 1,
        noOfRecords: 500,
      }),
      postJson('/v1/athlete/find', { pageNumber: 1, noOfRecords: 500 }),
    ])
      .then(([eventData, registrantsData, athletesData]) => {
        setEvent(eventData)
        // Only athletes can be applicants for an event — admins/moderators are excluded
        // even if one of them happens to have a registration row.
        const athleteById = new Map(
          (athletesData?.content || []).map((a) => [a.userId, a])
        )
        const applicants = (registrantsData?.content || [])
          .filter((r) => athleteById.has(r.userId))
          .map((r) => ({
            ...r,
            mobileNumber: athleteById.get(r.userId).mobileNumber,
          }))
        setRegistrants(applicants)
        setPage(1)
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
        {!loading && !error && registrants.length === 0 && (
          <p className="event-registrants-muted">
            No one has registered for this event yet.
          </p>
        )}

        {!loading && !error && registrants.length > 0 && (
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
                  {pagedRegistrants.map((registrant) => (
                    <tr key={registrant.registrationId}>
                      <td className="registrant-name-cell">
                        {formatName(registrant.fullName)}
                      </td>
                      <td>{registrant.mobileNumber || '—'}</td>
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
                    disabled={page <= 1}
                  >
                    Previous
                  </button>
                  <span className="registrant-table-pagination-info">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
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
