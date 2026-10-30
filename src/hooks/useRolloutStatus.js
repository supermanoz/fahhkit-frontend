import { useEffect, useReducer, useRef } from 'react'
import { ApiError } from '../api/client'
import {
  getRolloutStatus,
  requestRollout as requestRolloutApi,
  ALREADY_ROLLED_OUT_MESSAGE,
} from '../api/territoryRollout'
import {
  initialRolloutState,
  rolloutStatusReducer,
  shouldShowRolloutModal,
  shouldShowRolloutChip,
} from '../utils/rolloutStatusState'

// Checks once per mount whether territory capture is available in the
// player's region, and exposes what GamePage needs to show the proactive
// popup (Task 2) or the "already requested" chip. `position` is whatever
// GamePage already has from its existing getCurrentPosition/watchPosition
// effects (liveLocation || center) - this hook never prompts for location
// itself, per the "never ask for location twice in a row" requirement.
//
// Deliberately does NOT re-check every time `position` changes (the player
// moving slightly shouldn't re-fire this) - only once, as soon as a
// position is first available after mount. A player who travels to a
// genuinely different city mid-session will see it reflected on their next
// game open (fresh mount), same as the dismissal behaviour.
export function useRolloutStatus(position) {
  const [state, dispatch] = useReducer(
    rolloutStatusReducer,
    initialRolloutState
  )
  const checkedRef = useRef(false)

  useEffect(() => {
    if (checkedRef.current) return
    if (!position || position.lat == null || position.lng == null) return
    checkedRef.current = true

    let cancelled = false
    dispatch({ type: 'CHECK_START' })
    getRolloutStatus(position.lat, position.lng)
      .then((result) => {
        if (cancelled) return
        dispatch({
          type: 'CHECK_SUCCESS',
          rolledOut: Boolean(result.rolledOut),
          alreadyRequested: Boolean(result.alreadyRequested),
          cityName: result.cityName,
          countryName: result.countryName,
          requestCount: result.requestCount,
        })
      })
      .catch(() => {
        // Offline, 404 (backend hasn't shipped the endpoint yet), or any
        // other error - fails open per spec: no popup, quietly retried on
        // the next game open (fresh mount resets checkedRef).
        if (!cancelled) dispatch({ type: 'CHECK_FAILED' })
      })

    return () => {
      cancelled = true
    }
  }, [position])

  async function request() {
    if (!position) return
    dispatch({ type: 'REQUEST_START' })
    try {
      const result = await requestRolloutApi(position.lat, position.lng)
      dispatch({ type: 'REQUEST_SUCCESS', requestCount: result.requestCount })
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.message === ALREADY_ROLLED_OUT_MESSAGE
      ) {
        dispatch({ type: 'REQUEST_ALREADY_ROLLED_OUT' })
      } else {
        dispatch({
          type: 'REQUEST_FAILED',
          message:
            err instanceof ApiError
              ? err.message
              : 'Could not send that request - try again in a bit.',
        })
      }
    }
  }

  function dismiss() {
    dispatch({ type: 'DISMISS' })
  }

  return {
    state,
    showModal: shouldShowRolloutModal(state),
    showChip: shouldShowRolloutChip(state),
    request,
    dismiss,
  }
}
