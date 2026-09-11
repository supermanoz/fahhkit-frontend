import { useEffect, useState } from 'react'
import { postJson } from '../api/client'
import { useCurrentUser } from './useCurrentUser'

const EVENT_WINDOW_MS = 60 * 60 * 1000 // an event is "live" for 1 hour after its start time
const REFETCH_INTERVAL_MS = 5 * 60 * 1000 // pick up newly-registered events without a reload
const CHECK_INTERVAL_MS = 30 * 1000 // re-evaluate the window so it activates without navigation

// Finds the current user's PAID registration whose event started within the
// last hour, if any — the trigger for the full-screen "Track a Run" prompt.
export function useLiveRegisteredEvent() {
  const { user, isAuthed } = useCurrentUser()
  const isAthlete = user?.userType === 'ATHLETE'
  const [history, setHistory] = useState([])
  const [liveEvent, setLiveEvent] = useState(null)

  useEffect(() => {
    if (!isAuthed || !isAthlete || !user?.id) {
      setHistory([])
      return
    }
    let cancelled = false
    function load() {
      postJson(`/v1/athlete/${user.id}/history`, {
        pageNumber: 1,
        noOfRecords: 500,
      })
        .then((data) => {
          if (!cancelled) setHistory(data?.content || [])
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, REFETCH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [isAuthed, isAthlete, user?.id])

  useEffect(() => {
    function check() {
      const now = Date.now()
      const match = history.find((entry) => {
        if (entry.paymentStatus !== 'PAID' || entry.eventStatus === 'CANCELLED')
          return false
        const start = new Date(entry.eventDate).getTime()
        return now >= start && now < start + EVENT_WINDOW_MS
      })
      setLiveEvent(match || null)
    }
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [history])

  return liveEvent
}
