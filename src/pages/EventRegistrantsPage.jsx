/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaEnvelope,
  FaMoneyCheckAlt,
  FaPhone,
  FaUser,
} from 'react-icons/fa'
import { ApiError, canManageEvents, getJson, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { formatName } from '../utils/format'
import { formatDate } from '../utils/events'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import SearchFilters from '../components/SearchFilters'
import {
  emptyFilterValues,
  hasActiveFilters,
  toBackendDate,
} from '../utils/searchFilters'
import './EventRegistrantsPage.css'

const STATUS_LABELS = {
  PAID: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

// Mods/admins can only manually move a registration to one of these two
// statuses — everything else (PENDING/FAILED) is Khalti-driven.
const UPDATABLE_STATUSES = [
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const PAGE_SIZE = 30

// The backend auto-assigns the next sequential bib number the moment a
// registration is PAID (moderators can still override it) and exposes it as
// `bibNumber` (older deploys still send `extra1`). Whether the athlete has
// physically picked the bib up is tracked separately as `bibCollected`.
function bibNumberOf(registrant) {
  return registrant?.bibNumber || registrant?.extra1 || ''
}

function isBibCollected(registrant) {
  return registrant?.bibCollected === true
}

function BibBadge({ registrant, showNumber = true }) {
  const number = bibNumberOf(registrant)
  const collected = isBibCollected(registrant)
  return (
    <span
      className={`bib-badge ${collected ? 'bib-collected' : 'bib-pending'}`}
      title={collected ? 'BIB collected' : 'BIB not collected yet'}
    >
      {showNumber && number && <>#{number} &middot; </>}
      {collected ? 'Collected' : 'Not collected'}
    </span>
  )
}

// Only athletes can be applicants for an event — admins/moderators are
// excluded even if one of them happens to have a registration row. This
// join-filter (rather than fetching every registrant and every athlete to
// cross-reference client-side) is what lets the table below page through
// the backend 30 at a time instead of pulling the whole roster up front.
const ATHLETE_ONLY_FILTER = [
  { field: 'userType', value: 'ATHLETE', type: 'object', object: 'user' },
]

const REGISTRANT_FILTER_FIELDS = [
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

// actionType FILTER ANDs every entry in `search` together (see the backend's
// DynamicWhereClause) - each filled-in box just joins the athlete-only filter
// as another AND condition, rather than needing its own OR-grouped query.
// Text boxes are LIKE %value% matches; user fields go through a join on `user`.
function buildRegistrantSearch(filters) {
  const search = [...ATHLETE_ONLY_FILTER]
  const userLike = (field, value) => ({
    field,
    value,
    type: 'object',
    object: 'user',
  })
  const name = filters.name.trim()
  const phone = filters.phone.trim()
  const email = filters.email.trim()
  if (name) search.push(userLike('fullName', name))
  if (phone) search.push(userLike('mobileNumber', phone))
  if (email) search.push(userLike('email', email))
  if (filters.paymentStatus) {
    search.push({
      field: 'paymentStatus',
      value: filters.paymentStatus,
      type: 'exact',
    })
  }
  if (filters.registeredOn) {
    search.push({
      field: 'createdDate',
      value: toBackendDate(filters.registeredOn),
      type: 'date',
    })
  }
  return search
}

export default function EventRegistrantsPage() {
  const { id } = useParams()
  const location = useLocation()
  const { user, loading: userLoading } = useCurrentUser()
  const [event, setEvent] = useState(null)
  const [registrants, setRegistrants] = useState([])
  const [athleteById, setAthleteById] = useState(new Map())
  const [stats, setStats] = useState({
    paid: 0,
    pending: 0,
    failed: 0,
    cancelled: 0,
  })
  const [filters, setFilters] = useState(() =>
    emptyFilterValues(REGISTRANT_FILTER_FIELDS)
  )
  // Debounced so typing in a box doesn't fire a request per keystroke.
  const debouncedFilters = useDebouncedValue(filters)
  const filtering = hasActiveFilters(debouncedFilters)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editingRegistrant, setEditingRegistrant] = useState(null)
  const [statusForm, setStatusForm] = useState({
    paymentStatus: '',
    remarks: '',
  })
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState(null)
  // The BIB card in the details modal saves on its own, separately from the
  // payment status form, so it keeps its own saving/error state.
  const [bibEditing, setBibEditing] = useState(false)
  const [bibInput, setBibInput] = useState('')
  const [bibSaving, setBibSaving] = useState(false)
  const [bibError, setBibError] = useState(null)

  const allowed = canManageEvents(user)

  // One count-only query per status (noOfRecords: 1, read totalElements) so
  // the summary panel never has to pull the whole roster.
  const fetchStats = useCallback(() => {
    const countStatus = (status) =>
      postJson(`/v1/event/${id}/registrations`, {
        pageNumber: 1,
        noOfRecords: 1,
        actionType: 'FILTER',
        search: [
          ...ATHLETE_ONLY_FILTER,
          { field: 'paymentStatus', value: status, type: 'exact' },
        ],
      }).then((page) => page?.totalElements ?? 0)
    return Promise.all(
      ['PAID', 'PENDING', 'FAILED', 'CANCELLED'].map(countStatus)
    ).then(([paid, pending, failed, cancelled]) => {
      setStats({ paid, pending, failed, cancelled })
    })
  }, [id])

  function openStatusModal(registrant) {
    setStatusError(null)
    setStatusForm({ paymentStatus: '', remarks: '' })
    setBibEditing(false)
    setBibError(null)
    setEditingRegistrant(registrant)
  }

  function closeStatusModal() {
    if (statusSaving || bibSaving) return
    setEditingRegistrant(null)
  }

  function startBibEdit() {
    setBibError(null)
    setBibInput(bibNumberOf(editingRegistrant))
    setBibEditing(true)
  }

  function cancelBibEdit() {
    setBibError(null)
    setBibEditing(false)
  }

  // Both the number override and the collected toggle go through
  // update-performance; the backend ignores whichever field is left out.
  async function saveBib(changes, errorMessage) {
    setBibError(null)
    setBibSaving(true)
    try {
      const updated = await postJson(
        '/v1/event/registration/update-performance',
        { registrationId: editingRegistrant.registrationId, ...changes }
      )
      const merged = { ...editingRegistrant, ...updated }
      setRegistrants((prev) =>
        prev.map((r) =>
          r.registrationId === merged.registrationId ? merged : r
        )
      )
      // Stay open so the BIB card confirms the change.
      setEditingRegistrant(merged)
      setBibEditing(false)
    } catch (err) {
      setBibError(err instanceof ApiError ? err.message : errorMessage)
    } finally {
      setBibSaving(false)
    }
  }

  async function handleBibSubmit() {
    const bibNumber = bibInput.trim()
    if (!bibNumber) {
      setBibError('Enter a BIB number.')
      return
    }
    await saveBib(
      { bibNumber },
      'Could not save the BIB number. Please try again.'
    )
  }

  async function toggleBibCollected() {
    await saveBib(
      { bibCollected: !isBibCollected(editingRegistrant) },
      'Could not update BIB collection. Please try again.'
    )
  }

  async function handleModalSubmit(e) {
    e.preventDefault()
    if (!editingRegistrant) return
    if (!statusForm.paymentStatus) {
      setStatusError('Please select a status.')
      return
    }
    if (!statusForm.remarks.trim()) {
      setStatusError('Remarks are required before updating the status.')
      return
    }
    setStatusError(null)
    setStatusSaving(true)
    try {
      const updated = await postJson(
        '/v1/event/registration/update-payment-status',
        {
          registrationId: editingRegistrant.registrationId,
          paymentStatus: statusForm.paymentStatus,
          remarks: statusForm.remarks.trim(),
        }
      )
      setRegistrants((prev) =>
        prev.map((r) =>
          r.registrationId === editingRegistrant.registrationId
            ? { ...r, ...updated }
            : r
        )
      )
      setEditingRegistrant(null)
      fetchStats().catch(() => {})
    } catch (err) {
      setStatusError(
        err instanceof ApiError
          ? err.message
          : 'Could not update payment status. Please try again.'
      )
    } finally {
      setStatusSaving(false)
    }
  }

  const report = useMemo(() => {
    const entryFee = Number(event?.entryFee) || 0
    const failedOrCancelled = stats.failed + stats.cancelled
    return {
      // Same definition as the detailed report: every registration row,
      // whatever its payment status.
      total: stats.paid + stats.pending + failedOrCancelled,
      paid: stats.paid,
      pending: stats.pending,
      failedOrCancelled,
      revenue: stats.paid * entryFee,
    }
  }, [stats, event])

  // A new event id invalidates whatever page we were on for the old one.
  useEffect(() => {
    setPage(1)
  }, [id])

  // A new set of filters invalidates whatever page we were on.
  useEffect(() => {
    setPage(1)
  }, [debouncedFilters])

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
      fetchStats(),
    ])
      .then(([eventData, athletesData]) => {
        setEvent(eventData)
        setAthleteById(
          new Map((athletesData?.content || []).map((a) => [a.userId, a]))
        )
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load registrants. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [id, userLoading, allowed, fetchStats])

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
      search: buildRegistrantSearch(debouncedFilters),
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
  }, [id, page, userLoading, allowed, debouncedFilters])

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

        <SearchFilters
          fields={REGISTRANT_FILTER_FIELDS}
          values={filters}
          onChange={setFilters}
          title="Find an applicant"
          idPrefix="registrant-filter"
          quickField="name"
        />

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="event-registrants-muted">Loading...</p>}
        {!loading &&
          !error &&
          !tableLoading &&
          report.total === 0 &&
          !filtering && (
            <p className="event-registrants-muted">
              No one has registered for this event yet.
            </p>
          )}

        {!loading &&
          !error &&
          (tableLoading || report.total > 0 || filtering) && (
            <div className="event-registrants-body">
              <div className="registrant-table-wrap">
                <table className="registrant-table">
                  <thead>
                    <tr>
                      <th aria-label="Actions"></th>
                      <th>Name</th>
                      <th>Mobile Number</th>
                      <th>Payment Status</th>
                      <th>BIB</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableLoading && registrants.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="event-registrants-muted registrant-table-loading-cell"
                        >
                          Loading...
                        </td>
                      </tr>
                    )}
                    {!tableLoading && registrants.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="event-registrants-muted registrant-table-loading-cell"
                        >
                          {filtering
                            ? 'No applicants match those filters. Try loosening one up.'
                            : 'No one has registered for this event yet.'}
                        </td>
                      </tr>
                    )}
                    {registrants.map((registrant) => (
                      <tr key={registrant.registrationId}>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => openStatusModal(registrant)}
                          >
                            View / Update
                          </button>
                        </td>
                        <td className="registrant-name-cell">
                          <Link
                            to={`/athletes/${registrant.userId}`}
                            // Lets the profile's back link return here
                            // rather than to the athlete search page.
                            state={{
                              backTo: {
                                path: location.pathname + location.search,
                                label: 'Back to applicants',
                              },
                            }}
                            className="registrant-name-link"
                            title="View profile"
                          >
                            {formatName(registrant.fullName)}
                          </Link>
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
                        <td>
                          {registrant.paymentStatus === 'PAID' ||
                          bibNumberOf(registrant) ? (
                            <BibBadge registrant={registrant} />
                          ) : (
                            // Unpaid registrants don't have a BIB yet.
                            '—'
                          )}
                        </td>
                        <td className="registrant-remarks-cell">
                          {registrant.remarks || '—'}
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
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
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

      {editingRegistrant && (
        <div className="status-update-overlay" onClick={closeStatusModal}>
          <form
            className="status-update-modal glass-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleModalSubmit}
          >
            <h2>Registration Details</h2>
            <p className="status-update-subject">
              {formatName(editingRegistrant.fullName)}
            </p>

            <dl className="status-update-summary">
              <div>
                <dt>Phone</dt>
                <dd>
                  {athleteById.get(editingRegistrant.userId)?.mobileNumber ||
                    '—'}
                </dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>{formatDate(editingRegistrant.registeredDate)}</dd>
              </div>
              <div>
                <dt>Current status</dt>
                <dd>
                  <span
                    className={`registrant-status status-${(editingRegistrant.paymentStatus || '').toLowerCase()}`}
                  >
                    {STATUS_LABELS[editingRegistrant.paymentStatus] ||
                      editingRegistrant.paymentStatus}
                  </span>
                </dd>
              </div>
              {editingRegistrant.transactionId && (
                <div>
                  <dt>Transaction ID</dt>
                  <dd className="status-update-mono">
                    {editingRegistrant.transactionId}
                  </dd>
                </div>
              )}
              {editingRegistrant.remarks && (
                <div>
                  <dt>Last remark</dt>
                  <dd>{editingRegistrant.remarks}</dd>
                </div>
              )}
            </dl>

            <section className="bib-card">
              <div className="bib-card-head">
                <span className="bib-card-label">BIB</span>
                {editingRegistrant.paymentStatus === 'PAID' && (
                  <BibBadge registrant={editingRegistrant} showNumber={false} />
                )}
              </div>

              {editingRegistrant.paymentStatus !== 'PAID' ? (
                <p className="bib-card-note">
                  A BIB number is assigned once payment is confirmed.
                </p>
              ) : bibEditing ? (
                <div className="bib-card-edit">
                  <input
                    aria-label="BIB number"
                    type="text"
                    value={bibInput}
                    onChange={(e) => setBibInput(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter would otherwise submit the payment status form.
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleBibSubmit()
                      }
                    }}
                    placeholder="e.g. 1042"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={cancelBibEdit}
                    disabled={bibSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleBibSubmit}
                    disabled={bibSaving}
                  >
                    {bibSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ) : (
                <div className="bib-card-row">
                  <span className="bib-card-number">
                    {bibNumberOf(editingRegistrant)
                      ? `#${bibNumberOf(editingRegistrant)}`
                      : 'No number yet'}
                    <button
                      type="button"
                      className="bib-card-link"
                      onClick={startBibEdit}
                      disabled={bibSaving}
                    >
                      {bibNumberOf(editingRegistrant) ? 'Edit' : 'Assign'}
                    </button>
                  </span>
                  <button
                    type="button"
                    className={`btn btn-sm ${isBibCollected(editingRegistrant) ? 'btn-outline' : 'btn-primary'}`}
                    onClick={toggleBibCollected}
                    disabled={bibSaving}
                  >
                    {bibSaving
                      ? 'Saving...'
                      : isBibCollected(editingRegistrant)
                        ? 'Undo collected'
                        : 'Mark collected'}
                  </button>
                </div>
              )}

              {bibError && <div className="banner error">{bibError}</div>}
            </section>

            <h3 className="status-update-section-title">Update payment</h3>

            {statusError && <div className="banner error">{statusError}</div>}

            <div className="field">
              <label htmlFor="status-update-status">Payment Status</label>
              <select
                id="status-update-status"
                value={statusForm.paymentStatus}
                onChange={(e) =>
                  setStatusForm((f) => ({
                    ...f,
                    paymentStatus: e.target.value,
                  }))
                }
                required
              >
                <option value="">Select status</option>
                {UPDATABLE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="status-update-remarks">
                Remarks <span className="opt">(required)</span>
              </label>
              <textarea
                id="status-update-remarks"
                rows={3}
                value={statusForm.remarks}
                onChange={(e) =>
                  setStatusForm((f) => ({ ...f, remarks: e.target.value }))
                }
                placeholder="Why is this status being changed?"
                required
              />
            </div>

            <div className="status-update-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeStatusModal}
                disabled={statusSaving || bibSaving}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={statusSaving}
              >
                {statusSaving ? 'Saving...' : 'Save Status'}
              </button>
            </div>
          </form>
        </div>
      )}

      <Footer />
    </div>
  )
}
