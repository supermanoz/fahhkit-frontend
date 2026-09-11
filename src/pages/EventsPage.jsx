import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ApiError,
  canManageEvents,
  postJson,
  resolveFileUrl,
} from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useEventRegistrationStatuses } from '../hooks/useRegisteredEvents'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import {
  EVENT_TYPE_LABELS,
  formatDate,
  isRegistrationClosed,
} from '../utils/events'
import './EventsPage.css'

const EVENT_STATUS_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

export default function EventsPage() {
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const registrationStatuses = useEventRegistrationStatuses()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [registeringId, setRegisteringId] = useState(null)
  const [registerError, setRegisterError] = useState(null)
  const [confirmingCancelId, setConfirmingCancelId] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [cancelError, setCancelError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const navigate = useNavigate()

  const showAllEvents = canManageEvents(user)
  const visibleEvents =
    statusFilter === 'ALL'
      ? events
      : events.filter((event) => event.status === statusFilter)

  useEffect(() => {
    if (userLoading) return
    postJson(showAllEvents ? '/v1/event/moderator/all' : '/v1/event/upcoming', {
      pageNumber: 1,
      noOfRecords: 500,
    })
      .then((data) => setEvents(data?.content || []))
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load events. Please try again.'
        )
      })
      .finally(() => setLoading(false))
  }, [userLoading, showAllEvents])

  // Registers straight from the card — for a paid event this must hand off to
  // Khalti immediately, not just land the user on the detail page (that used
  // to be a plain <Link to detail>, which looked like nothing happened).
  async function handleRegister(event) {
    setRegisterError(null)
    setRegisteringId(event.id)
    try {
      const data = await postJson(`/v1/event/${event.id}/register`)
      if (Number(event.entryFee) > 0) {
        const payment = await postJson(
          `/v1/event/registration/${data.registrationId}/initiate-payment`
        )
        window.location.href = payment.paymentUrl
        return
      }
      navigate(`/events/${event.id}`)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not complete registration. Please try again.'
      setRegisterError({ eventId: event.id, message })
      setRegisteringId(null)
    }
  }

  // A draft is unpublished, so "cancelling" it here is really the delete
  // flow (POST /v1/event/delete) — the backend just soft-deletes by flipping
  // status to CANCELLED rather than removing the row.
  async function handleCancelEvent(event) {
    setCancelError(null)
    setCancellingId(event.id)
    try {
      await postJson('/v1/event/delete', { eventId: event.id })
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, status: 'CANCELLED' } : e))
      )
      setConfirmingCancelId(null)
    } catch (err) {
      setCancelError({
        eventId: event.id,
        message:
          err instanceof ApiError
            ? err.message
            : 'Could not cancel the event. Please try again.',
      })
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="events-page">
      <Navbar />
      <div className="events-wrap">
        <header className="events-header" data-aos="fade-down">
          <div>
            <h1>{showAllEvents ? 'All Events' : 'Upcoming Events'}</h1>
            <p>Club races and community events on the calendar.</p>
          </div>
          <div className="events-header-actions">
            {showAllEvents && (
              <select
                className="events-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="ALL">All Statuses</option>
                {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {showAllEvents && (
              <Link to="/events/create" className="btn btn-primary">
                Create Event
              </Link>
            )}
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}

        {loading && <p className="events-muted">Loading events...</p>}

        {!loading && !error && events.length === 0 && (
          <p className="events-muted">
            {showAllEvents
              ? 'No events yet — create one to get started.'
              : 'No upcoming events yet — check back soon.'}
          </p>
        )}

        {!loading &&
          !error &&
          events.length > 0 &&
          visibleEvents.length === 0 && (
            <p className="events-muted">No events match this filter.</p>
          )}

        <div className="events-grid">
          {visibleEvents.map((event, i) => (
            <div
              className="event-card"
              key={event.id}
              data-aos="fade-up"
              data-aos-delay={(i % 3) * 100}
            >
              {event.eventImageUrl1 && (
                <div className="event-card-image-wrap">
                  <img
                    src={resolveFileUrl(event.eventImageUrl1)}
                    alt={event.name}
                    className="event-card-image"
                  />
                </div>
              )}
              <div className="event-card-body">
                <span className="event-card-type">
                  {EVENT_TYPE_LABELS[event.type] || event.type}
                </span>
                {showAllEvents && (
                  <span
                    className={`event-card-status status-${(event.status || '').toLowerCase()}`}
                  >
                    {EVENT_STATUS_LABELS[event.status] || event.status}
                  </span>
                )}
                <h3>{event.name}</h3>
                <dl className="event-card-meta">
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
                    <dd>
                      {Number(event.entryFee) > 0 ? event.entryFee : 'Free'}
                    </dd>
                  </div>
                  {event.capacity != null && (
                    <div>
                      <dt>Capacity</dt>
                      <dd>{event.capacity}</dd>
                    </div>
                  )}
                </dl>
                {canManageEvents(user) && event.status === 'DRAFT' ? (
                  confirmingCancelId === event.id ? (
                    <>
                      <p className="event-card-confirm-text">
                        Cancel this event? This can&apos;t be undone.
                      </p>
                      <div className="event-card-actions">
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setConfirmingCancelId(null)}
                          disabled={cancellingId === event.id}
                        >
                          Keep Event
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => handleCancelEvent(event)}
                          disabled={cancellingId === event.id}
                        >
                          {cancellingId === event.id
                            ? 'Cancelling...'
                            : 'Confirm Cancel'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="event-card-actions">
                      <Link
                        to={`/events/${event.id}/edit`}
                        className="btn btn-primary"
                      >
                        Edit Event
                      </Link>
                      <button
                        type="button"
                        className="btn btn-outline btn-danger-outline"
                        onClick={() => setConfirmingCancelId(event.id)}
                      >
                        Cancel Event
                      </button>
                    </div>
                  )
                ) : (
                  <div className="event-card-actions">
                    {canManageEvents(user) ? (
                      <Link
                        to={`/events/${event.id}/registrations`}
                        className="btn btn-primary"
                      >
                        View Applicants
                      </Link>
                    ) : registrationStatuses.get(event.id)?.paymentStatus ===
                      'PAID' ? (
                      <span className="event-card-registered">
                        &#10003; Registered
                      </span>
                    ) : registrationStatuses.get(event.id)?.paymentStatus ===
                      'PENDING' ? (
                      <Link
                        to={`/events/${event.id}`}
                        className="btn btn-outline"
                      >
                        Payment Pending
                      </Link>
                    ) : isRegistrationClosed(event) ? (
                      <span className="event-card-closed">
                        Registration Closed
                      </span>
                    ) : isAuthed ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleRegister(event)}
                        disabled={registeringId === event.id}
                      >
                        {registeringId === event.id
                          ? 'Redirecting...'
                          : 'Register'}
                      </button>
                    ) : (
                      <Link to="/register" className="btn btn-primary">
                        Register
                      </Link>
                    )}
                    <Link
                      to={`/events/${event.id}`}
                      className="btn btn-outline"
                    >
                      View More
                    </Link>
                  </div>
                )}
                {registerError?.eventId === event.id && (
                  <div className="banner error event-card-register-error">
                    {registerError.message}
                  </div>
                )}
                {cancelError?.eventId === event.id && (
                  <div className="banner error event-card-register-error">
                    {cancelError.message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  )
}
