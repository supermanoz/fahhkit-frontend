import { useEffect, useReducer, useRef, useState } from 'react'
import { haversineDistance } from '../utils/run'
import { isUsableFix } from '../utils/gpsFix'
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
// Coming back from the background re-checks (the player may have travelled),
// but not more often than this, so quick app switches never spam the API.
const RESUME_MIN_INTERVAL_MS = 30000

// Checks whether territory capture is available in the player's region and
// exposes what GamePage needs to show the proactive popup or the
// "already requested" chip. `position` is whatever GamePage already has from
// its standing GPS watch (liveLocation) - this hook never prompts for
// location itself ("never ask for location twice in a row").
//
// WHEN it checks (once per session, never per GPS tick):
//   - on the first USABLE fix (utils/gpsFix.js: real coordinates, not 0,0,
//     not stale, not hopelessly inaccurate) - which is right after a login /
//     signup / app start with a session, and right after the location
//     permission is granted, because the GPS watch only produces a fix then;
//   - again when the player has moved more than RECHECK_DISTANCE_M since the
//     last check (walking into a rolled-out city unlocks without a restart);
//   - on the first FRESH fix after the app returns from the background
//     (`resumeTick`), at most once per RESUME_MIN_INTERVAL_MS;
//   - every RETRY_MS while the result is unknown (a failed check).
// `userId` resets everything when a different player signs in.
//
// A failed check (offline, 404 because the backend hasn't deployed the
// endpoint, ...) is an unknown state: nothing is shown or locked. In dev a
// console warning says so.
export function useRolloutStatus(
  position,
  { userId = null, resumeTick = 0 } = {}
) {
  const [state, dispatch] = useReducer(
    rolloutStatusReducer,
    initialRolloutState
  )
  // Last position a check was made for - a re-check only fires once the
  // player has moved RECHECK_DISTANCE_M away from it (so a GPS wobble never
  // re-fires it, but travelling into/out of a rolled-out city does).
  const checkedAtRef = useRef(null)
  const inFlightRef = useRef(false)
  const lastCheckAtRef = useRef(0)
  // Set when the app comes back to the foreground: { at, base } - the next
  // fix that is NEWER than `base` (and not older than `at`) triggers a check.
  const resumeRef = useRef(null)
  // Bumped when the player changes so an in-flight answer for the previous
  // player is dropped.
  const generationRef = useRef(0)
  const positionRef = useRef(position)
  positionRef.current = position
  // Bumped by the retry timer so a failed/unknown check is re-attempted even
  // if the player is standing still.
  const [retryTick, setRetryTick] = useState(0)

  // A different player: forget the last one's result and position.
  const userRef = useRef(userId)
  useEffect(() => {
    if (userRef.current === userId) return
    userRef.current = userId
    generationRef.current += 1
    checkedAtRef.current = null
    resumeRef.current = null
    inFlightRef.current = false
    dispatch({ type: 'RESET' })
    setRetryTick((n) => n + 1)
  }, [userId])

  // Back from the background: arm a re-check for the next fresh fix.
  useEffect(() => {
    if (!resumeTick) return
    if (Date.now() - lastCheckAtRef.current < RESUME_MIN_INTERVAL_MS) return
    // Armed, not run: the check effect fires on the next NEW fix (the GPS
    // watch keeps delivering them), never on the possibly-stale current one.
    resumeRef.current = { at: Date.now(), base: positionRef.current }
  }, [resumeTick])

  useEffect(() => {
    // Never on a missing, 0,0, stale or very coarse fix.
    if (!isUsableFix(position)) return
    const last = checkedAtRef.current
    const resume = resumeRef.current
    const freshAfterResume =
      Boolean(resume) &&
      position !== resume.base &&
      (position.timestamp == null || position.timestamp >= resume.at - 1000)
    const moved =
      !last ||
      haversineDistance(last, position) > RECHECK_DISTANCE_M ||
      last.tick !== retryTick ||
      freshAfterResume
    if (!moved || inFlightRef.current) return
    if (freshAfterResume) resumeRef.current = null
    const generation = generationRef.current
    checkedAtRef.current = {
      lat: position.lat,
      lng: position.lng,
      tick: retryTick,
    }
    inFlightRef.current = true
    lastCheckAtRef.current = Date.now()

    dispatch({ type: 'CHECK_START' })
    getRolloutStatus(position.lat, position.lng)
      .then((result) => {
        if (generation !== generationRef.current) return
        dispatch({
          type: 'CHECK_SUCCESS',
          rolledOut: Boolean(result.rolledOut),
          alreadyRequested: Boolean(result.alreadyRequested),
          cityName: result.cityName,
          countryName: result.countryName,
          requestCount: result.requestCount,
        })
      })
      .catch((err) => {
        if (generation !== generationRef.current) return
        // Offline, 404 (backend hasn't shipped the endpoint yet), or any
        // other error: unknown state - treated as available (never locks).
        // Forget where we checked so the retry timer tries again.
        checkedAtRef.current = null
        if (import.meta.env.DEV) {
          console.warn(
            '[rollout] status check failed - not locking the game:',
            err instanceof ApiError ? `HTTP ${err.status} ${err.message}` : err
          )
        }
        dispatch({ type: 'CHECK_FAILED' })
      })
      .finally(() => {
        if (generation === generationRef.current) inFlightRef.current = false
      })
  }, [position, retryTick])

  // Retry while the state is unknown.
  useEffect(() => {
    if (state.phase !== PHASE.FAILED) return
    const id = setTimeout(() => setRetryTick((n) => n + 1), RETRY_MS)
    return () => clearTimeout(id)
  }, [state.phase, retryTick])

  async function request() {
    if (!isUsableFix(position)) return
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
