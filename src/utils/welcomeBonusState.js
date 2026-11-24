// State handling for the first-login welcome popup (pure, unit-tested).
// The server decides everything: whether coins were granted, how many, and
// whether this account has already seen the popup. localStorage is only a
// fast cache of "acknowledged" - never the source of truth.

const cacheKey = (userId) => `welcome_bonus_ack_${userId}`

function store(storage) {
  if (storage) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readAckCache(userId, storage) {
  if (!userId) return false
  try {
    return store(storage)?.getItem(cacheKey(userId)) === '1'
  } catch {
    return false
  }
}

export function writeAckCache(userId, storage) {
  if (!userId) return
  try {
    store(storage)?.setItem(cacheKey(userId), '1')
  } catch {
    /* not remembered locally - the server flag still holds */
  }
}

export const initialWelcomeState = {
  // idle | loading | ready | done | error | unavailable
  phase: 'idle',
  status: null,
  open: false,
  ack: 'idle', // idle | sending | failed
  error: null,
}

export function welcomeReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return initialWelcomeState
    case 'CHECK_START':
      return { ...initialWelcomeState, phase: 'loading' }
    case 'CHECK_OK': {
      const s = action.status
      // Not granted / nothing to announce / already seen: nothing to show.
      if (!s || s.acknowledged || !s.granted || !(Number(s.amount) > 0)) {
        return { ...initialWelcomeState, phase: 'done' }
      }
      return { ...initialWelcomeState, phase: 'ready', status: s }
    }
    case 'CHECK_FAIL':
      // HTTP error = the endpoint isn't there (yet): feature off, silently.
      // No answer at all (offline): try again later, show nothing now.
      return {
        ...initialWelcomeState,
        phase: action.http ? 'unavailable' : 'error',
      }
    case 'ACKED':
      return { ...state, phase: 'done', open: false, ack: 'idle', error: null }
    case 'OPEN':
      return state.phase === 'ready' ? { ...state, open: true } : state
    case 'ACK_START':
      return { ...state, ack: 'sending', error: null }
    case 'ACK_FAIL':
      return { ...state, ack: 'failed', error: action.message }
    case 'CLOSE_LOCAL':
      // Closed without waiting for the server: gone for this session only.
      return { ...state, phase: 'done', open: false, ack: 'idle' }
    default:
      return state
  }
}

// Holds the popup queue: still checking, waiting to be shown, or on screen.
// (A failed/unavailable check never holds anything - no deadlock.)
export function holdsQueue(state) {
  return state.phase === 'loading' || state.phase === 'ready' || state.open
}

export function shouldAutoOpen(state, { blocked }) {
  return !blocked && state.phase === 'ready' && !state.open
}
