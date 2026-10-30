// Pure state machine for the "important notice" popup (see
// useAnnouncementNotices.js) - zero React/DOM imports, directly
// unit-testable, same philosophy as rolloutStatusState.js/vehicleDetection.js.
//
// Unlike rolloutStatusState's `dismissed` (deliberately session-only),
// dismissing a notice here is permanent - backed by the server
// (POST /v1/mail/broadcast/{id}/notice-shown, per-user, survives reload/
// logout/login/another device). This reducer only tracks what to show
// right now; the hook is what actually persists a dismissal.
export const PHASE = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed',
})

export const initialAnnouncementState = {
  phase: PHASE.IDLE,
  queue: [],
}

export function announcementNoticesReducer(state, action) {
  switch (action.type) {
    case 'CHECK_START':
      return { ...state, phase: PHASE.LOADING }

    case 'CHECK_SUCCESS':
      return { ...state, phase: PHASE.READY, queue: action.notices || [] }

    // Fails closed (shows nothing) rather than open - a notice is
    // important enough to be worth publishing, but not important enough
    // to risk showing stale/wrong content over a broken check. The next
    // game open (fresh mount) just tries again.
    case 'CHECK_FAILED':
      return { ...state, phase: PHASE.FAILED, queue: [] }

    // A live socket push for a NEW IMPORTANT_NOTICE broadcast published
    // while the game is already open - queues immediately instead of
    // waiting for the next full game open, same as the old broadcastQueue
    // behaviour. No-ops if this id is already queued or we haven't
    // finished the initial check yet (that check will include it anyway).
    case 'RECEIVE':
      if (state.phase !== PHASE.READY) return state
      if (state.queue.some((n) => n.id === action.notice.id)) return state
      return { ...state, queue: [...state.queue, action.notice] }

    case 'DISMISS_CURRENT':
      if (state.queue.length === 0) return state
      return { ...state, queue: state.queue.slice(1) }

    default:
      return state
  }
}

// Derived helper - the notice to show right now, or null.
export function currentNotice(state) {
  return state.phase === PHASE.READY && state.queue.length > 0
    ? state.queue[0]
    : null
}

// Derived helper - whether there's another one queued after this one
// (drives the "Next" vs "Got it" button label).
export function hasMoreNotices(state) {
  return state.phase === PHASE.READY && state.queue.length > 1
}
