import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ApiError, canManageEvents, getJson, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { formatName } from '../utils/format'
import { EVENT_TYPE_LABELS, formatDate } from '../utils/events'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import DonutChart from '../components/DonutChart'
import './EventReportPage.css'

const STATUS_LABELS = {
  PAID: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

const EVENT_STATUS_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

const GENDER_LABELS = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHERS: 'Others',
}

const PAGE_SIZE = 20

function calculateAge(birthDate) {
  if (!birthDate) return null
  const dob = new Date(birthDate)
  if (Number.isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const hasHadBirthdayThisYear =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age
}

export default function EventReportPage() {
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
      // /v1/athlete/find doesn't carry gender/birthDate — those live on the
      // base User record, so a second bulk lookup is needed to enrich the
      // report with demographics.
      postJson('/v1/user/find', {
        pageNumber: 1,
        noOfRecords: 1000,
        actionType: 'FILTER',
        search: [{ field: 'userType', value: 'ATHLETE', type: 'exact' }],
      }),
    ])
      .then(([eventData, registrantsData, athletesData, athleteUsersPage]) => {
        setEvent(eventData)
        const athleteById = new Map(
          (athletesData?.content || []).map((a) => [a.userId, a])
        )
        const userById = new Map(
          (athleteUsersPage?.content || []).map((u) => [u.id, u])
        )
        const applicants = (registrantsData?.content || [])
          .filter((r) => athleteById.has(r.userId))
          .map((r) => ({
            ...r,
            mobileNumber: athleteById.get(r.userId).mobileNumber,
            gender: userById.get(r.userId)?.gender || null,
            birthDate: userById.get(r.userId)?.birthDate || null,
          }))
        setRegistrants(applicants)
        setPage(1)
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load the report. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [id, userLoading, allowed])

  const report = useMemo(() => {
    const paid = registrants.filter((r) => r.paymentStatus === 'PAID').length
    const pending = registrants.filter(
      (r) => r.paymentStatus === 'PENDING'
    ).length
    const failedOrCancelled = registrants.filter(
      (r) => r.paymentStatus === 'FAILED' || r.paymentStatus === 'CANCELLED'
    ).length
    const entryFee = Number(event?.entryFee) || 0
    const men = registrants.filter((r) => r.gender === 'MALE').length
    const women = registrants.filter((r) => r.gender === 'FEMALE').length
    const others = registrants.filter((r) => r.gender === 'OTHERS').length
    const ages = registrants
      .map((r) => calculateAge(r.birthDate))
      .filter((age) => age != null)
    const averageAge = ages.length
      ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)
      : null
    return {
      total: registrants.length,
      paid,
      pending,
      failedOrCancelled,
      revenue: paid * entryFee,
      men,
      women,
      others,
      averageAge,
    }
  }, [registrants, event])

  if (userLoading) {
    return (
      <div className="event-report-page">
        <Navbar />
        <div className="event-report-wrap">
          <p className="event-report-muted">Loading...</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to={`/events/${id}`} replace />
  }

  return (
    <div className="event-report-page">
      <Navbar />
      <div className="event-report-wrap">
        <p className="event-report-back">
          <Link to={`/events/${id}/registrations`}>
            &larr; Back to applicants
          </Link>
        </p>

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="event-report-muted">Loading report...</p>}

        {!loading && !error && event && (
          <>
            <header className="event-report-header" data-aos="fade-down">
              <div>
                <h1>Registration Report — {event.name}</h1>
                <p>Full breakdown of this event&apos;s registrations.</p>
              </div>
              <span
                className={`event-report-event-status status-${(event.status || '').toLowerCase()}`}
              >
                {EVENT_STATUS_LABELS[event.status] || event.status}
              </span>
            </header>

            <dl className="event-report-meta glass-card" data-aos="fade-up">
              <div>
                <dt>Type</dt>
                <dd>{EVENT_TYPE_LABELS[event.type] || event.type}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(event.date)}</dd>
              </div>
              {event.venue && (
                <div>
                  <dt>Venue</dt>
                  <dd>{event.venue}</dd>
                </div>
              )}
              <div>
                <dt>Entry Fee</dt>
                <dd>{Number(event.entryFee) > 0 ? event.entryFee : 'Free'}</dd>
              </div>
              {event.capacity != null && (
                <div>
                  <dt>Capacity Filled</dt>
                  <dd>
                    {report.total} / {event.capacity}
                  </dd>
                </div>
              )}
            </dl>

            <div className="event-report-stats-grid" data-aos="fade-up">
              <div className="event-report-stat-card">
                <span className="event-report-stat-number">{report.total}</span>
                <span className="event-report-stat-label">
                  Total Registrants
                </span>
              </div>
              <div className="event-report-stat-card">
                <span className="event-report-stat-number">{report.paid}</span>
                <span className="event-report-stat-label">Paid</span>
              </div>
              <div className="event-report-stat-card">
                <span className="event-report-stat-number">
                  {report.pending}
                </span>
                <span className="event-report-stat-label">Pending Payment</span>
              </div>
              <div className="event-report-stat-card">
                <span className="event-report-stat-number">
                  {report.failedOrCancelled}
                </span>
                <span className="event-report-stat-label">
                  Failed / Cancelled
                </span>
              </div>
              {Number(event.entryFee) > 0 && (
                <div className="event-report-stat-card">
                  <span className="event-report-stat-number">
                    {report.revenue}
                  </span>
                  <span className="event-report-stat-label">
                    Revenue Collected
                  </span>
                </div>
              )}
              {report.averageAge != null && (
                <div className="event-report-stat-card">
                  <span className="event-report-stat-number">
                    {report.averageAge}
                  </span>
                  <span className="event-report-stat-label">Average Age</span>
                </div>
              )}
            </div>

            {report.total > 0 && (
              <div className="event-report-charts-row">
                <div
                  className="event-report-chart-card glass-card"
                  data-aos="fade-up"
                >
                  <DonutChart
                    data={[
                      {
                        label: 'Paid',
                        value: report.paid,
                        color: 'var(--success)',
                      },
                      {
                        label: 'Pending',
                        value: report.pending,
                        color: 'var(--brand-amber)',
                      },
                      {
                        label: 'Failed / Cancelled',
                        value: report.failedOrCancelled,
                        color: 'var(--error)',
                      },
                    ]}
                  />
                  <div className="event-report-chart-legend">
                    <span className="event-report-legend-item">
                      <span
                        className="event-report-legend-dot"
                        style={{ background: 'var(--success)' }}
                      />
                      Paid ({report.paid})
                    </span>
                    <span className="event-report-legend-item">
                      <span
                        className="event-report-legend-dot"
                        style={{ background: 'var(--brand-amber)' }}
                      />
                      Pending ({report.pending})
                    </span>
                    <span className="event-report-legend-item">
                      <span
                        className="event-report-legend-dot"
                        style={{ background: 'var(--error)' }}
                      />
                      Failed / Cancelled ({report.failedOrCancelled})
                    </span>
                  </div>
                </div>

                <div
                  className="event-report-chart-card glass-card"
                  data-aos="fade-up"
                >
                  <DonutChart
                    data={[
                      {
                        label: 'Men',
                        value: report.men,
                        color: 'var(--brand)',
                      },
                      {
                        label: 'Women',
                        value: report.women,
                        color: 'var(--success)',
                      },
                      {
                        label: 'Others',
                        value: report.others,
                        color: 'var(--brand-amber)',
                      },
                    ]}
                  />
                  <div className="event-report-chart-legend">
                    <span className="event-report-legend-item">
                      <span
                        className="event-report-legend-dot"
                        style={{ background: 'var(--brand)' }}
                      />
                      Men ({report.men})
                    </span>
                    <span className="event-report-legend-item">
                      <span
                        className="event-report-legend-dot"
                        style={{ background: 'var(--success)' }}
                      />
                      Women ({report.women})
                    </span>
                    {report.others > 0 && (
                      <span className="event-report-legend-item">
                        <span
                          className="event-report-legend-dot"
                          style={{ background: 'var(--brand-amber)' }}
                        />
                        Others ({report.others})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <section className="event-report-table-section" data-aos="fade-up">
              <h2>All Registrants</h2>
              {registrants.length === 0 ? (
                <p className="event-report-muted">
                  No one has registered for this event yet.
                </p>
              ) : (
                <div className="event-report-table-wrap">
                  <table className="event-report-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Mobile Number</th>
                        <th>Gender</th>
                        <th>Payment Status</th>
                        <th>Transaction ID</th>
                        <th>Registered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRegistrants.map((registrant) => (
                        <tr key={registrant.registrationId}>
                          <td className="event-report-name-cell">
                            {formatName(registrant.fullName)}
                          </td>
                          <td>{registrant.mobileNumber || '—'}</td>
                          <td>{GENDER_LABELS[registrant.gender] || '—'}</td>
                          <td>
                            <span
                              className={`event-report-status status-${(registrant.paymentStatus || '').toLowerCase()}`}
                            >
                              {STATUS_LABELS[registrant.paymentStatus] ||
                                registrant.paymentStatus}
                            </span>
                          </td>
                          <td className="event-report-meta-cell">
                            {registrant.transactionId || '—'}
                          </td>
                          <td className="event-report-meta-cell">
                            {formatDate(registrant.registeredDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {totalPages > 1 && (
                    <div className="event-report-table-pagination">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        Previous
                      </button>
                      <span className="event-report-table-pagination-info">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={page >= totalPages}
                      >
                        Next
                      </button>
                    </div>
                  )}
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
