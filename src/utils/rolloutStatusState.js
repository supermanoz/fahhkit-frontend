// Pure state machine for the "territory capture available in your region?"
// check (see useRolloutStatus.js) - zero React/DOM imports, directly
// unit-testable, same philosophy as vehicleDetection.js/gameAuthState.js.
//
// `dismissed` is intentionally NOT persisted anywhere (no localStorage/
// sessionStorage) - it lives only in this reducer's in-memory state, which
// resets whenever the hook (and the component holding it) remounts. That's
// exactly "dismissed for this session, shown again on the next game open":
// staying on /game without reloading never remounts it, so the dismissal
// holds; a reload or a fresh mount is a new "game open" and starts clean.
export const PHASE = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  ROLLED_OUT: 'rolledOut',
  NEEDS_REQUEST: 'needsRequest',
  ALREADY_REQUESTED: 'alreadyRequested',
  FAILED: 'failed',
})

export const initialRolloutState = {
  phase: PHASE.IDLE,
  dismissed: false,
  cityName: null,
  countryName: null,
  requestCount: null,
  submitting: false,
  submitError: null,
  justRequested: false,
}

export function rolloutStatusReducer(state, action) {
  switch (action.type) {
    // Only the very first check shows CHECKING - later re-checks (the player
    // moved, or a retry) keep the last known phase so the lock/banner never
    // flickers while a request is in flight.
    case 'CHECK_START':
      if (state.phase !== PHASE.IDLE && state.phase !== PHASE.FAILED) {
        return state
      }
      return { ...state, phase: PHASE.CHECKING, submitError: null }

    case 'CHECK_SUCCESS':
      if (action.rolledOut) {
        return { ...initialRolloutState, phase: PHASE.ROLLED_OUT }
      }
      return {
        ...initialRolloutState,
        // Still outside after a re-check: a popup the player already
        // dismissed stays dismissed.
        dismissed:
          state.phase === PHASE.NEEDS_REQUEST ||
          state.phase === PHASE.ALREADY_REQUESTED
            ? state.dismissed
            : false,
        phase: action.alreadyRequested
          ? PHASE.ALREADY_REQUESTED
          : PHASE.NEEDS_REQUEST,
        cityName: action.cityName,
        countryName: action.countryName,
        requestCount: action.requestCount ?? null,
      }

    // Fails open - an unknown state never shows the popup or locks anything
    // (the hook retries on a timer). A re-check that fails after a known
    // result keeps that result instead of flipping the lock on or off.
    case 'CHECK_FAILED':
      if (
        state.phase === PHASE.ROLLED_OUT ||
        state.phase === PHASE.NEEDS_REQUEST ||
        state.phase === PHASE.ALREADY_REQUESTED
      ) {
        return state
      }
      return { ...initialRolloutState, phase: PHASE.FAILED }

    // A different player signed in (or the session ended): nothing known
    // about the previous player's area/request carries over.
    case 'RESET':
      return initialRolloutState

    case 'DISMISS':
      if (state.phase !== PHASE.NEEDS_REQUEST) return state
      return { ...state, dismissed: true }

    case 'REQUEST_START':
      return { ...state, submitting: true, submitError: null }

    case 'REQUEST_SUCCESS':
      return {
        ...state,
        submitting: false,
        justRequested: true,
        requestCount: action.requestCount ?? state.requestCount,
      }

    // The backend can also tell us on submit that the area already went
    // live between the check and the tap (ALREADY_ROLLED_OUT) - same good-
    // news outcome as a rolled-out check result.
    case 'REQUEST_ALREADY_ROLLED_OUT':
      return { ...initialRolloutState, phase: PHASE.ROLLED_OUT }

    case 'REQUEST_FAILED':
      return { ...state, submitting: false, submitError: action.message }

    default:
      return state
  }
}

// Derived helper - whether the proactive modal should be visible right now.
export function shouldShowRolloutModal(state) {
  return state.phase === PHASE.NEEDS_REQUEST && !state.dismissed
}

// Derived helper - whether the "already requested" chip should show.
export function shouldShowRolloutChip(state) {
  return state.phase === PHASE.ALREADY_REQUESTED
}

// Derived helper - the game is halted (greyed out, controls disabled) while
// the player is positively known to be outside a rolled-out area. Unknown
// (idle/checking/failed) never locks.
export function isRolloutBlocked(state) {
  return (
    state.phase === PHASE.NEEDS_REQUEST ||
    state.phase === PHASE.ALREADY_REQUESTED
  )
}
