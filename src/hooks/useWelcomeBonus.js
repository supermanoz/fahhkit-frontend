import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  getWelcomeBonusStatus,
  acknowledgeWelcomeBonus,
} from '../api/welcomeBonus'
import {
  welcomeReducer,
  initialWelcomeState,
  readAckCache,
  writeAckCache,
  shouldAutoOpen,
  holdsQueue,
} from '../utils/welcomeBonusState'
import { isAppActive, onAppActivityChange } from '../utils/appActivity'

// First-login welcome bonus. The server already granted the coins (at
// registration); this only announces them, once per ACCOUNT, using the server's
// "acknowledged" flag (localStorage is just a fast cache). `userId` null =>
// logged out => nothing. `blocked` => something that must not be interrupted
// (run, post-run screens, rollout popup, intro...); the popup waits in the queue.
export function useWelcomeBonus({ userId, blocked }) {
  const [state, dispatch] = useReducer(welcomeReducer, initialWelcomeState)
  const userRef = useRef(userId)
  userRef.current = userId
  const sendingRef = useRef(false)

  const check = useCallback(async () => {
    const uid = userRef.current
    if (!uid) return
    // Fast path: this device already knows the account acknowledged it.
    if (readAckCache(uid)) {
      dispatch({ type: 'CHECK_OK', status: { acknowledged: true } })
      return
    }
    dispatch({ type: 'CHECK_START' })
    try {
      const status = await getWelcomeBonusStatus()
      if (userRef.current !== uid) return
      if (status?.acknowledged) writeAckCache(uid)
      dispatch({ type: 'CHECK_OK', status })
    } catch (e) {
      if (userRef.current !== uid) return
      dispatch({ type: 'CHECK_FAIL', http: (e?.status ?? 0) > 0 })
    }
  }, [])

  useEffect(() => {
    dispatch({ type: 'RESET' })
    if (userId) check()
  }, [userId, check])

  // Offline at login: look again when the app comes back to the foreground.
  useEffect(() => {
    if (!userId || state.phase !== 'error') return undefined
    let last = isAppActive()
    return onAppActivityChange(() => {
      const now = isAppActive()
      if (now && !last) check()
      last = now
    })
  }, [userId, state.phase, check])

  useEffect(() => {
    if (userId && shouldAutoOpen(state, { blocked })) dispatch({ type: 'OPEN' })
  }, [userId, blocked, state])

  // Tell the server the player has seen it (idempotent there). Success is the
  // only thing that writes the cache and finishes the popup; a failure keeps it
  // open with a retry. Nothing is ever granted here.
  const acknowledge = useCallback(async () => {
    const uid = userRef.current
    if (!uid || sendingRef.current) return false
    sendingRef.current = true
    dispatch({ type: 'ACK_START' })
    try {
      await acknowledgeWelcomeBonus()
      writeAckCache(uid)
      dispatch({ type: 'ACKED' })
      return true
    } catch (e) {
      dispatch({
        type: 'ACK_FAIL',
        message:
          (e?.status ?? 0) === 0
            ? "Couldn't save - check your connection and try again."
            : e?.message || "Couldn't save. Please try again.",
      })
      return false
    } finally {
      sendingRef.current = false
    }
  }, [])

  // X / backdrop / Esc: close at once, best-effort acknowledge in the
  // background (if that fails the popup simply returns next session).
  const dismiss = useCallback(() => {
    const uid = userRef.current
    dispatch({ type: 'CLOSE_LOCAL' })
    acknowledgeWelcomeBonus()
      .then(() => writeAckCache(uid))
      .catch(() => {})
  }, [])

  return {
    state,
    // Visible only while nothing else must be on screen; if a blocker appears
    // while it is up it hides and returns when the queue is clear again.
    visible: state.open && !blocked,
    amount: state.status?.amount ?? 0,
    holdsQueue: Boolean(userId) && holdsQueue(state),
    acknowledge,
    dismiss,
    retryCheck: check,
  }
}
