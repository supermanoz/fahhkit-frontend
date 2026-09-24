import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ApiError, canManageEvents, getJson, postJson } from '../api/client'
import {
  FaCalendarAlt,
  FaEnvelope,
  FaMoneyCheckAlt,
  FaPhone,
  FaUser,
  FaVenusMars,
} from 'react-icons/fa'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { formatName } from '../utils/format'
import { EVENT_TYPE_LABELS, formatDate } from '../utils/events'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import DonutChart from '../components/DonutChart'
import MiniBarChart from '../components/charts/MiniBarChart'
import SearchFilters from '../components/SearchFilters'
import {
  emptyFilterValues,
  hasActiveFilters,
  toInputDate,
} from '../utils/searchFilters'
import './EventReportPage.css'

const AGE_BUCKETS = [
  { label: 'Under 20', test: (age) => age < 20 },
  { label: '20–29', test: (age) => age >= 20 && age < 30 },
  { label: '30–39', test: (age) => age >= 30 && age < 40 },
  { label: '40–49', test: (age) => age >= 40 && age < 50 },
  { label: '50+', test: (age) => age >= 50 },
]

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

const REPORT_FILTER_FIELDS = [
  {
    key: 'name',
    label: 'Athlete name',
    placeholder: 'e.g. Sita Rai',
    icon: FaUser,
  },
  {
    key: 'phone',
    label: 'Phone number',
    type: 'tel',
    placeholder: 'e.g. 98XXXXXXXX',
    icon: FaPhone,
  },
  {
    key: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'e.g. sita@mail.com',
    icon: FaEnvelope,
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    icon: FaVenusMars,
    options: [
      { value: '', label: 'All genders' },
      ...Object.entries(GENDER_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    ],
  },
  {
    key: 'paymentStatus',
    label: 'Payment status',
    type: 'select',
    icon: FaMoneyCheckAlt,
    options: [
      { value: '', label: 'All statuses' },
      ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    ],
  },
  {
    key: 'registeredOn',
    label: 'Registered on',
    type: 'date',
    icon: FaCalendarAlt,
  },
]

// The report already holds every registrant in memory (the stats and charts
// need the full roster), so the table's filters run client-side rather than
// re-querying the backend.
function matchesFilters(registrant, filters) {
  const includes = (haystack, needle) =>
    !needle ||
    String(haystack || '')
      .toLowerCase()
      .includes(needle.trim().toLowerCase())
  return (
    includes(registrant.fullName, filters.name) &&
    includes(registrant.mobileNumber, filters.phone) &&
    includes(registrant.email, filters.email) &&
    (!filters.gender || registrant.gender === filters.gender) &&
    (!filters.paymentStatus ||
      registrant.paymentStatus === filters.paymentStatus) &&
    (!filters.registeredOn ||
      toInputDate(registrant.registeredDate) === filters.registeredOn)
  )
}

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
  const [filters, setFilters] = useState(() =>
    emptyFilterValues(REPORT_FILTER_FIELDS)
  )
  const debouncedFilters = useDebouncedValue(filters, 200)
  const filtering = hasActiveFilters(debouncedFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const allowed = canManageEvents(user)

  const filteredRegistrants = useMemo(
    () => registrants.filter((r) => matchesFilters(r, debouncedFilters)),
    [registrants, debouncedFilters]
  )
  const totalPages = Math.max(
    1,
    Math.ceil(filteredRegistrants.length / PAGE_SIZE)
  )
  const pagedRegistrants = filteredRegistrants.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  )

  // A new set of filters invalidates whatever page of the table we were on.
  useEffect(() => {
    setPage(1)
  }, [debouncedFilters])

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
            email: athleteById.get(r.userId).email,
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
    const ageDistribution = AGE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      value: ages.filter(bucket.test).length,
    }))
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
      ageDistribution,
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
                  {/* Capacity is only ever enforced against PAID registrations
                      (see EventServiceImpl#validateCapacityAvailable) - PENDING
                      rows don't hold a slot, so they're excluded here too. */}
                  <dt>Capacity Filled</dt>
                  <dd>
                    {report.paid} / {event.capacity}
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

                {report.averageAge != null && (
                  <div
                    className="event-report-chart-card event-report-age-chart glass-card"
                    data-aos="fade-up"
                  >
                    <div className="event-report-age-chart-header">
                      <h3>Age Distribution</h3>
                      <p className="event-report-muted">
                        Average age: {report.averageAge}
                      </p>
                    </div>
                    <MiniBarChart
                      data={report.ageDistribution}
                      color="var(--brand)"
                      height={180}
                    />
                  </div>
                )}
              </div>
            )}

            <section className="event-report-table-section" data-aos="fade-up">
              <h2>
                All Registrants
                {filtering && (
                  <span className="event-report-filter-count">
                    {' '}
                    &middot; {filteredRegistrants.length} of{' '}
                    {registrants.length}
                  </span>
                )}
              </h2>
              {registrants.length > 0 && (
                <SearchFilters
                  fields={REPORT_FILTER_FIELDS}
                  values={filters}
                  onChange={setFilters}
                  title="Find a registrant"
                  idPrefix="report-filter"
                  quickField="name"
                />
              )}
              {registrants.length === 0 ? (
                <p className="event-report-muted">
                  No one has registered for this event yet.
                </p>
              ) : filteredRegistrants.length === 0 ? (
                <p className="event-report-muted">
                  No registrants match those filters. Try loosening one up.
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
