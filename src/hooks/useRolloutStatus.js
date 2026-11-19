import { useEffect, useReducer, useRef, useState } from 'react'
import { haversineDistance } from '../utils/run'
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
  isRolloutBlocked,
  PHASE,
} from '../utils/rolloutStatusState'

const RECHECK_DISTANCE_M = 1000
const RETRY_MS = 20000

// Checks once per mount whether territory capture is available in the
// player's region, and exposes what GamePage needs to show the proactive
// popup (Task 2) or the "already requested" chip. `position` is whatever
// GamePage already has from its existing getCurrentPosition/watchPosition
// effects (liveLocation || center) - this hook never prompts for location
// itself, per the "never ask for location twice in a row" requirement.
//
// Re-checks when the player has moved > RECHECK_DISTANCE_M since the last
// check (so walking into a rolled-out city unlocks the game without a
// restart), and retries every RETRY_MS while the result is unknown.
export function useRolloutStatus(position) {
  const [state, dispatch] = useReducer(
    rolloutStatusReducer,
    initialRolloutState
  )
  // Last position a check was made for - a re-check only fires once the
  // player has moved RECHECK_DISTANCE_M away from it (so a GPS wobble never
  // re-fires it, but travelling into/out of a rolled-out city does).
  const checkedAtRef = useRef(null)
  const inFlightRef = useRef(false)
  // Bumped by the retry timer so a failed/unknown check is re-attempted even
  // if the player is standing still.
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!position || position.lat == null || position.lng == null) return
    const last = checkedAtRef.current
    const moved =
      !last ||
      haversineDistance(last, position) > RECHECK_DISTANCE_M ||
      last.tick !== retryTick
    if (!moved || inFlightRef.current) return
    checkedAtRef.current = {
      lat: position.lat,
      lng: position.lng,
      tick: retryTick,
    }
    inFlightRef.current = true

    dispatch({ type: 'CHECK_START' })
    getRolloutStatus(position.lat, position.lng)
      .then((result) => {
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
        // other error: unknown state - treated as available (never locks).
        // Forget where we checked so the retry timer tries again.
        checkedAtRef.current = null
        dispatch({ type: 'CHECK_FAILED' })
      })
      .finally(() => {
        inFlightRef.current = false
      })
  }, [position, retryTick])

  // Retry while the state is unknown.
  useEffect(() => {
    if (state.phase !== PHASE.FAILED) return
    const id = setTimeout(() => setRetryTick((n) => n + 1), RETRY_MS)
    return () => clearTimeout(id)
  }, [state.phase, retryTick])

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
    blocked: isRolloutBlocked(state),
    request,
    dismiss,
  }
}
