import { useCallback, useEffect, useRef, useReducer } from 'react'
import { getPendingNotices, markNoticeShown } from '../api/mail'
import {
  announcementNoticesReducer,
  initialAnnouncementState,
  currentNotice,
  hasMoreNotices,
} from '../utils/announcementNoticesState'

// Local, per-(user, announcement) cache of "already shown" ids - NOT
// cleared on logout (clearToken/clearUser in api/client.js only remove
// their own keys, never touch this one), purely to avoid a flash if the
// dismiss ack is still in flight when something remounts this hook. The
// backend (BroadcastMailReadState.noticeShownAt, via GET .../notices/
// pending and POST .../notice-shown) is the real source of truth - this
// cache is defense-in-depth, not what makes cross-device/cross-login
// dismissal actually work.
const CACHE_KEY = 'fahhkit_announcement_notices_seen'

function readSeenCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function addToSeenCache(entry) {
  try {
    const seen = readSeenCache()
    seen.add(entry)
    localStorage.setItem(CACHE_KEY, JSON.stringify([...seen]))
  } catch {
    // Best-effort only - the backend ack is what actually matters.
  }
}

// IMPORTANT_NOTICE broadcasts the current user hasn't been shown yet,
// front-and-center on game open. Call once per authenticated session (pass
// null/undefined userId until auth has resolved - see the "wait until the
// user and their acknowledgements are loaded" requirement this was built
// for) so there's no window where this decides to show nothing just
// because the user isn't known yet.
export function useAnnouncementNotices(userId) {
  const [state, dispatch] = useReducer(
    announcementNoticesReducer,
    initialAnnouncementState
  )
  const checkedForRef = useRef(null)

  useEffect(() => {
    if (!userId || checkedForRef.current === userId) return
    checkedForRef.current = userId
    dispatch({ type: 'CHECK_START' })
    let cancelled = false
    getPendingNotices()
      .then((notices) => {
        if (cancelled) return
        const seen = readSeenCache()
        const filtered = (notices || []).filter(
          (n) => !seen.has(`${userId}:${n.id}`)
        )
        dispatch({ type: 'CHECK_SUCCESS', notices: filtered })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'CHECK_FAILED' })
      })
    return () => {
      cancelled = true
      // Without this, React StrictMode's mount -> cleanup -> mount (dev
      // server, e2e) cancelled the first request and then skipped the
      // second one via the guard above, leaving the hook stuck in LOADING
      // forever - and RECEIVE no-ops until READY, so live notices never
      // showed in dev either.
      checkedForRef.current = null
    }
  }, [userId])

  const dismiss = useCallback(() => {
    const current = currentNotice(state)
    if (!current) return
    addToSeenCache(`${userId}:${current.id}`)
    dispatch({ type: 'DISMISS_CURRENT' })
    markNoticeShown(current.id).catch(() => {
      // Optimistic - if this fails, the next game open's GET still
      // returns it (fails closed from the player's point of view: worst
      // case it shows once more, never stuck forever).
    })
  }, [state, userId])

  // For a live socket push of a freshly-published IMPORTANT_NOTICE -
  // queues it immediately instead of waiting for the next game open.
  const receive = useCallback(
    (broadcast) => {
      if (!userId || broadcast?.type !== 'IMPORTANT_NOTICE') return
      if (readSeenCache().has(`${userId}:${broadcast.id}`)) return
      dispatch({ type: 'RECEIVE', notice: broadcast })
    },
    [userId]
  )

  // Re-asks the server for anything published while the game was in the
  // background. A phone suspends the STOMP socket soon after the screen
  // locks and the broker never replays what it missed, so without this a
  // notice published mid-background would only show on the next full game
  // open. Uses the reducer's RECEIVE (dedupes by id, no-ops until the first
  // check finished) rather than CHECK_SUCCESS, so it can't wipe a notice
  // the player is currently reading.
  const recheck = useCallback(() => {
    if (!userId) return
    getPendingNotices()
      .then((notices) => {
        const seen = readSeenCache()
        ;(notices || [])
          .filter((n) => !seen.has(`${userId}:${n.id}`))
          .forEach((notice) => dispatch({ type: 'RECEIVE', notice }))
      })
      .catch(() => {
        // Best-effort - the next foreground tries again.
      })
  }, [userId])

  return {
    current: currentNotice(state),
    hasMore: hasMoreNotices(state),
    dismiss,
    receive,
    recheck,
  }
}
