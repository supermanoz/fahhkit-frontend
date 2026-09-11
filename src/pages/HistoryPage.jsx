import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, canManageEvents, postJson } from '../api/client'
import { getRuns } from '../api/runs'
import { useCurrentUser } from '../hooks/useCurrentUser'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import HistoryList from '../components/HistoryList'
import './HistoryPage.css'

export default function HistoryPage() {
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isAthlete = user?.userType === 'ATHLETE'
  // TEMP — staging restriction: run tracking limited to admin/moderator for now,
  // revert to `isAthlete` when ready to launch to athletes
  const canTrackRuns = canManageEvents(user)

  useEffect(() => {
    if (userLoading || !isAuthed || !user?.id) {
      setLoading(false)
      return
    }
    // A run is only ever logged against an ENDURANCE event the athlete already
    // has a history entry for, so joining the two by eventId here means the
    // history page can show each run right alongside the event it belongs to,
    // instead of a disconnected "My Runs" list.
    Promise.all([
      postJson(`/v1/athlete/${user.id}/history`, {
        pageNumber: 1,
        noOfRecords: 500,
      }),
      getRuns(),
    ])
      .then(([historyData, runsData]) => {
        const runsByEventId = new Map(
          (runsData?.content || []).map((run) => [run.eventId, run])
        )
        setHistory(
          (historyData?.content || []).map((item) => ({
            ...item,
            run: runsByEventId.get(item.eventId) || null,
          }))
        )
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your history. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [userLoading, isAuthed, user?.id])

  return (
    <div className="history-page">
      <Navbar />
      <div className="history-page-wrap">
        <header className="history-page-header">
          <h1>History</h1>
          {canTrackRuns && (
            <Link to="/runs/track" className="btn btn-primary">
              Track a Run
            </Link>
          )}
        </header>

        {!userLoading && !isAuthed && (
          <div className="banner error">
            <Link to="/login">Sign in</Link> to view your run history.
          </div>
        )}

        {!userLoading && isAuthed && !isAthlete && (
          <div className="banner error">
            Run history is only available for athlete accounts.
          </div>
        )}

        {isAuthed && isAthlete && error && (
          <div className="banner error">{error}</div>
        )}
        {isAuthed && isAthlete && loading && (
          <p className="history-page-muted">Loading...</p>
        )}

        {isAuthed && isAthlete && !loading && !error && (
          <HistoryList
            history={history}
            emptyMessage="You haven't registered for any events yet."
          />
        )}
      </div>
      <Footer />
    </div>
  )
}
