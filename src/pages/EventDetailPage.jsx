import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiError,
  canManageEvents,
  getJson,
  postJson,
  resolveFileUrl,
} from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useEventRegistrationStatuses } from '../hooks/useRegisteredEvents'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import Carousel from '../components/Carousel'
import TermsAgreement from '../components/TermsAgreement'
import {
  EVENT_TYPE_LABELS,
  formatDate,
  isRegistrationClosed,
} from '../utils/events'
import './EventDetailPage.css'

export default function EventDetailPage() {
  const { id } = useParams()
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const registrationStatuses = useEventRegistrationStatuses()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [registration, setRegistration] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  useEffect(() => {
    getJson(`/v1/event/${id}`)
      .then(setEvent)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load this event. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [id])

  async function handleRegister() {
    setRegisterError(null)
    setRegistering(true)
    try {
      const data = await postJson(`/v1/event/${id}/register`)
      if (Number(event.entryFee) > 0) {
        const payment = await postJson(
          `/v1/event/registration/${data.registrationId}/initiate-payment`
        )
        window.location.href = payment.paymentUrl
        return
      }
      setRegistration(data)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not complete registration. Please try again.'
      if (!message.toLowerCase().includes('already registered')) {
        setRegisterError(message)
      }
    } finally {
      setRegistering(false)
    }
  }

  // Only a PENDING registration can be cancelled here (see EventService.cancelRegistration
  // on the backend) - a PAID one is a real registration, not an abandoned payment attempt.
  async function handleCancelRegistration() {
    setCancelError(null)
    setCancelling(true)
    try {
      const data = await postJson(
        `/v1/event/registration/${currentRegistrationId}/cancel`
      )
      setRegistration(data)
      setConfirmingCancel(false)
    } catch (err) {
      setCancelError(
        err instanceof ApiError
          ? err.message
          : 'Could not cancel your registration. Please try again.'
      )
    } finally {
      setCancelling(false)
    }
  }

  const images = event
    ? [event.eventImageUrl1, event.eventImageUrl2, event.eventImageUrl3].filter(
        Boolean
      )
    : []
  const closed = event?.status === 'CANCELLED' || event?.status === 'COMPLETED'
  const deadlinePassed = isRegistrationClosed(event)
  const historyEntry = registrationStatuses.get(id)
  const currentStatus =
    registration?.paymentStatus || historyEntry?.paymentStatus
  const currentRegistrationId =
    registration?.registrationId || historyEntry?.registrationId

  return (
    <div className="event-detail-page">
      <Navbar />
      <div className="event-detail-top">
        <div className="event-detail-back">
          <Link to="/events" className="event-detail-back-link">
            &larr; Back to Events
          </Link>
          {canManageEvents(user) && (
            <div className="event-detail-manage-actions">
              <Link
                to={`/events/${id}/registrations`}
                className="btn btn-outline"
              >
                View Registrants
              </Link>
              <Link to={`/events/${id}/edit`} className="btn btn-outline">
                Edit Event
              </Link>
            </div>
          )}
        </div>

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="event-detail-muted">Loading...</p>}
      </div>

      {!loading && event && (
        <>
          {images.length > 0 ? (
            <div className="event-detail-gallery">
              <Carousel
                slides={images.map((img) => ({
                  image: resolveFileUrl(img),
                  content: <></>,
                }))}
                intervalMs={7000}
              />
            </div>
          ) : (
            <div
              className="event-detail-gallery event-detail-gallery-empty"
              aria-hidden="true"
            />
          )}

          <div className="event-detail-wrap">
            <div className="event-detail-body">
              <div className="event-detail-main glass-card" data-aos="fade-up">
                <span className="event-card-type">
                  {EVENT_TYPE_LABELS[event.type] || event.type}
                </span>
                <h1>{event.name}</h1>
                {event.description && (
                  <p className="event-detail-description">
                    {event.description}
                  </p>
                )}

                <dl className="event-detail-meta">
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
                  {event.registrationDeadline && (
                    <div>
                      <dt>Registration Deadline</dt>
                      <dd>{formatDate(event.registrationDeadline)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <aside
                className="event-detail-register glass-card"
                data-aos="fade-up"
                data-aos-delay="100"
              >
                <h2>Registration</h2>

                {currentStatus === 'PAID' ? (
                  <div className="event-detail-registered">
                    <p className="event-detail-registered-title">
                      You&apos;re registered!
                    </p>
                    {registration?.registrationId && (
                      <dl>
                        <div>
                          <dt>Registration ID</dt>
                          <dd>{registration.registrationId}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                ) : closed ? (
                  <p className="event-detail-muted">
                    {event.status === 'CANCELLED'
                      ? 'This event has been cancelled.'
                      : 'This event has already taken place.'}
                  </p>
                ) : deadlinePassed ? (
                  <p className="event-detail-muted">
                    Registration for this event has closed.
                  </p>
                ) : userLoading ? (
                  <p className="event-detail-muted">Loading...</p>
                ) : canManageEvents(user) ? (
                  <Link
                    to={`/events/${id}/registrations`}
                    className="btn btn-primary btn-block"
                  >
                    View Applicants
                  </Link>
                ) : isAuthed ? (
                  <>
                    {currentStatus === 'PENDING' && (
                      <p className="event-detail-muted">
                        Your last payment attempt didn&apos;t finish — pick up
                        where you left off.
                      </p>
                    )}
                    {(currentStatus === 'FAILED' ||
                      currentStatus === 'CANCELLED') && (
                      <p className="event-detail-muted">
                        Your last payment didn&apos;t go through. You can try
                        again.
                      </p>
                    )}
                    {registerError && (
                      <div className="banner error">{registerError}</div>
                    )}
                    {!currentStatus && (
                      <TermsAgreement
                        id="event-terms-agreement"
                        to="/terms/event-registration"
                        checked={agreedToTerms}
                        onChange={setAgreedToTerms}
                      />
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      onClick={handleRegister}
                      disabled={
                        registering || (!currentStatus && !agreedToTerms)
                      }
                    >
                      {registering
                        ? 'Redirecting...'
                        : currentStatus
                          ? 'Complete Payment'
                          : 'Register for this Event'}
                    </button>
                    {currentStatus === 'PENDING' && currentRegistrationId && (
                      <div className="event-detail-cancel-registration">
                        {cancelError && (
                          <div className="banner error">{cancelError}</div>
                        )}
                        {confirmingCancel ? (
                          <>
                            <p className="event-detail-muted">
                              Cancel this pending registration?
                            </p>
                            <div className="event-detail-cancel-actions">
                              <button
                                type="button"
                                className="btn btn-outline btn-block"
                                onClick={() => setConfirmingCancel(false)}
                                disabled={cancelling}
                              >
                                Keep It
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-block"
                                onClick={handleCancelRegistration}
                                disabled={cancelling}
                              >
                                {cancelling
                                  ? 'Cancelling...'
                                  : 'Confirm Cancel'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline btn-danger-outline btn-block"
                            onClick={() => setConfirmingCancel(true)}
                          >
                            Cancel Registration
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="event-detail-muted">
                      Sign up for a FahhKit account to register for this event.
                    </p>
                    <Link to="/register" className="btn btn-primary btn-block">
                      Sign Up to Register
                    </Link>
                  </>
                )}
              </aside>
            </div>
          </div>
        </>
      )}
      <Footer />
    </div>
  )
}
