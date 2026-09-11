import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, canManageEvents, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import TrackRunPanel from '../components/TrackRunPanel'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './TrackRunPage.css'

export default function TrackRunPage() {
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const navigate = useNavigate()

  // TEMP — staging restriction: run tracking limited to admin/moderator for now,
  // revert to `user?.userType === "ATHLETE"` when ready to launch to athletes
  const allowed = canManageEvents(user)

  // A run must be linked to a paid endurance registration (see the backend's
  // RunCreateRequest) - the athlete picks which one this run is for before
  // starting, rather than the tracker guessing.
  const [eligibleEvents, setEligibleEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState('')

  useEffect(() => {
    if (userLoading || !allowed || !user?.id) return
    postJson(`/v1/athlete/${user.id}/history`, {
      pageNumber: 1,
      noOfRecords: 500,
    })
      .then((data) => {
        const eligible = (data?.content || []).filter(
          (entry) =>
            entry.eventType === 'ENDURANCE' && entry.paymentStatus === 'PAID'
        )
        setEligibleEvents(eligible)
        if (eligible.length === 1) setSelectedEventId(eligible[0].eventId)
      })
      .catch((err) => {
        setEventsError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your registered events. Please try again.'
        )
      })
      .finally(() => setEventsLoading(false))
  }, [userLoading, allowed, user?.id])

  if (!userLoading && !isAuthed) {
    return (
      <div className="track-run-page">
        <Navbar />
        <div className="track-run-wrap">
          <div className="banner error">
            <Link to="/login">Sign in</Link> to track a run.
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!userLoading && !allowed) {
    return (
      <div className="track-run-page">
        <Navbar />
        <div className="track-run-wrap">
          <div className="banner error">
            Run tracking is only available for admin/moderator accounts right
            now.
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="track-run-page">
      <Navbar />
      <div className="track-run-wrap">
        <h1>Track a Run</h1>

        {eventsError && <div className="banner error">{eventsError}</div>}

        {!eventsLoading && !eventsError && eligibleEvents.length === 0 && (
          <p className="track-run-hint">
            You need a paid registration for an endurance event before you can
            track a run.
          </p>
        )}

        {!eventsLoading && eligibleEvents.length > 0 && (
          <div className="track-run-event-picker">
            <label htmlFor="track-run-event">Which event is this for?</label>
            <select
              id="track-run-event"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              <option value="" disabled>
                Select an event
              </option>
              {eligibleEvents.map((event) => (
                <option key={event.eventId} value={event.eventId}>
                  {event.eventName}
                </option>
              ))}
            </select>
          </div>
        )}

        <TrackRunPanel
          eventId={selectedEventId || null}
          onSaved={(run) => navigate(`/runs/${run.id}`)}
        />
      </div>
      <Footer />
    </div>
  )
}
