import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { getDailyRewardStatus, claimDailyReward } from '../api/dailyReward'
import {
  dailyRewardReducer,
  initialDailyRewardState,
  shouldAutoOpen,
  hasClaimableDot,
} from '../utils/dailyRewardState'
import { isAppActive, onAppActivityChange } from '../utils/appActivity'

// Owns the daily-reward flow: status check once after login / app open and on
// every return to the foreground, popup gating, claim, and the post-claim
// callback (balance/profile refresh). The server decides everything; this only
// relays. `userId` null => logged out => nothing runs. `blocked` => something
// must not be interrupted (active run, post-run screens, rollout popup...).
export function useDailyReward({ userId, blocked, onClaimed }) {
  const [state, dispatch] = useReducer(
    dailyRewardReducer,
    initialDailyRewardState
  )
  const [shownThisSession, setShownThisSession] = useState(false)
  const claimingRef = useRef(false)
  const onClaimedRef = useRef(onClaimed)
  onClaimedRef.current = onClaimed
  const userRef = useRef(userId)
  userRef.current = userId
  const blockedRef = useRef(blocked)
  blockedRef.current = blocked

  const check = useCallback(async () => {
    const uid = userRef.current
    if (!uid || claimingRef.current) return
    dispatch({ type: 'CHECK_START' })
    try {
      const status = await getDailyRewardStatus()
      if (userRef.current !== uid) return
      if (!status || !Array.isArray(status.rewards)) {
        dispatch({ type: 'UNAVAILABLE' })
        return
      }
      dispatch({ type: 'CHECK_OK', status, now: Date.now() })
    } catch (e) {
      if (userRef.current !== uid) return
      // Backend without the endpoint yet answers with some HTTP error (404,
      // 405, 500...): the reducer hides the feature then. status 0 = offline.
      dispatch({
        type: 'CHECK_FAIL',
        http: (e?.status ?? 0) > 0,
        message:
          e?.message ||
          'Could not load your daily reward. Check your connection.',
      })
    }
  }, [])

  // After login / app open (and again if the user changes).
  useEffect(() => {
    dispatch({ type: 'RESET' })
    setShownThisSession(false)
    if (userId) check()
  }, [userId, check])

  // Foreground return.
  useEffect(() => {
    if (!userId) return undefined
    let last = isAppActive()
    return onAppActivityChange(() => {
      const now = isAppActive()
      if (now && !last) check()
      last = now
    })
  }, [userId, check])

  // Auto-open: once per session, never while blocked.
  useEffect(() => {
    if (!userId) return
    if (shouldAutoOpen(state, { blocked, shownThisSession })) {
      setShownThisSession(true)
      dispatch({ type: 'OPEN' })
    }
  }, [userId, blocked, state, shownThisSession])

  // Blocking things (a run starting) close a popup that is up.
  useEffect(() => {
    if (blocked && state.open) dispatch({ type: 'CLOSE' })
  }, [blocked, state.open])

  const claim = useCallback(async () => {
    if (claimingRef.current) return // double-tap guard (server also idempotent)
    claimingRef.current = true
    dispatch({ type: 'CLAIM_START' })
    let failed = null
    try {
      const result = await claimDailyReward()
      const reduced = Boolean(
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      )
      dispatch({ type: 'CLAIM_OK', result, now: Date.now(), reduced })
      // Only the server's answer ever reaches the balance.
      onClaimedRef.current?.(result)
    } catch (e) {
      failed =
        e?.status === 409 || /already/i.test(e?.message || '')
          ? 'You already claimed today. Showing your latest reward status.'
          : e?.message || 'Could not claim your reward. Check your connection.'
    } finally {
      claimingRef.current = false
    }
    if (failed) {
      // Network error, already claimed, any 4xx: nothing is shown as granted,
      // and the server's own status is re-read so the UI shows the truth.
      dispatch({ type: 'CLAIM_FAIL', message: failed })
      await check()
    }
  }, [check])

  // Backend granted something other than its own status listed: flag it.
  useEffect(() => {
    if (state.mismatch) {
      console.warn(
        '[daily-reward] claim granted a different reward than /status listed',
        state.result?.granted
      )
    }
  }, [state.mismatch, state.result])

  const skipAnim = useCallback(() => dispatch({ type: 'ANIM_SKIP' }), [])
  const animDone = useCallback(() => dispatch({ type: 'ANIM_DONE' }), [])

  // Chest ran out: ask the server again; it flips the chest to claimable
  // itself. Re-armed on every status refresh. (Foreground return re-checks
  // too, covering timers a sleeping phone never fired.)
  const waitUntil =
    state.status && !state.status.claimable && state.status.nextClaimAt
      ? Date.parse(state.status.nextClaimAt)
      : null
  const skew = state.skew
  const statusObj = state.status
  useEffect(() => {
    if (!userId || !waitUntil || Number.isNaN(waitUntil)) return undefined
    const ms = waitUntil - (Date.now() + skew)
    // setTimeout fires at once above 2^31-1 ms, so clamp the delay.
    const id = setTimeout(
      check,
      Math.min(ms > 0 ? ms + 400 : 5000, 2 ** 31 - 1)
    )
    return () => clearTimeout(id)
  }, [userId, waitUntil, skew, statusObj, check])

  // Manual open (chest / Me card). Counts as this session's showing so the
  // auto-popup never repeats it, and is ignored while a run / the post-run
  // screens / another popup own the screen - those keep their queue.
  const open = useCallback(() => {
    if (blockedRef.current) return
    setShownThisSession(true)
    dispatch({ type: 'OPEN' })
    check()
  }, [check])
  const close = useCallback(() => dispatch({ type: 'CLOSE' }), [])

  return {
    state,
    open,
    close,
    claim,
    skipAnim,
    animDone,
    retry: check,
    // Reopen affordance: visible only if the feature exists for this user.
    available: state.phase !== 'unavailable' && Boolean(userId),
    blocked: Boolean(blocked),
    dot: Boolean(userId) && hasClaimableDot(state),
  }
}
