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
    case 'CHECK_START':
      return { ...state, phase: PHASE.CHECKING, submitError: null }

    case 'CHECK_SUCCESS':
      if (action.rolledOut) {
        return { ...initialRolloutState, phase: PHASE.ROLLED_OUT }
      }
      return {
        ...initialRolloutState,
        phase: action.alreadyRequested
          ? PHASE.ALREADY_REQUESTED
          : PHASE.NEEDS_REQUEST,
        cityName: action.cityName,
        countryName: action.countryName,
        requestCount: action.requestCount ?? null,
      }

    // Fails open - never shows the popup, never blocks anything else in
    // the game. The next game open (fresh mount) just tries again.
    case 'CHECK_FAILED':
      return { ...initialRolloutState, phase: PHASE.FAILED }

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
