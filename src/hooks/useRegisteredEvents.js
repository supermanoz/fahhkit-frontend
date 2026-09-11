import { useEffect, useState } from 'react'
import { postJson } from '../api/client'
import { useCurrentUser } from './useCurrentUser'

// Map of eventId -> { paymentStatus, registrationId } for the current user's own
// registrations, derived from their athlete history (there's no dedicated "check status"
// endpoint). Only a PAID entry means they're actually registered - PENDING/FAILED/CANCELLED
// rows exist but shouldn't be treated as a completed registration. registrationId is carried
// along so a PENDING registration can be cancelled without a second lookup.
export function useEventRegistrationStatuses() {
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const [statuses, setStatuses] = useState(new Map())

  useEffect(() => {
    if (userLoading || !isAuthed || !user?.id) {
      setStatuses(new Map())
      return
    }
    postJson(`/v1/athlete/${user.id}/history`, {
      pageNumber: 1,
      noOfRecords: 500,
    })
      .then((data) =>
        setStatuses(
          new Map(
            (data?.content || []).map((h) => [
              h.eventId,
              {
                paymentStatus: h.paymentStatus,
                registrationId: h.registrationId,
              },
            ])
          )
        )
      )
      .catch(() => {})
  }, [userLoading, isAuthed, user?.id])

  return statuses
}
