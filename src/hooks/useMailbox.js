import { useCallback, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  claimMail,
  declineMail,
  deleteMail,
  findBroadcastMail,
  findMyMail,
  readBroadcastMail,
  readMail,
} from '../api/mail'

// Inbox: page-NUMBERED now (see MailPanel's .game-route-pager, the same
// control the Me tab's My Territories/My Routes lists use - reused rather
// than rebuilt), not infinite scroll - 15 per page, replacing the list on
// each page change rather than accumulating it. Backend already supports
// real paged requests (findMyMail's pageNumber/noOfRecords), so this just
// asks for the page it needs instead of paginating a big in-memory list.
const MAIL_PAGE_SIZE = 15
// Broadcasts (News tab) keep their original infinite-scroll behavior -
// only the personal inbox was asked to paginate.
const BROADCAST_PAGE_SIZE = 20

// Inbox state lives here (not inside MailPanel) so the game's menu tab can
// show an unread badge before the panel is ever opened, and so socket pushes
// (useGameSocket's onMail/onBroadcastMail) can drop new mail straight in.
export function useMailbox() {
  const [mail, setMail] = useState([])
  const [broadcasts, setBroadcasts] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  // Mail's unread badge (see GamePage.jsx's mailbox.unreadCount) is derived
  // from whatever's currently in `mail` - with real paging that's only ever
  // ONE page's worth (15) rather than everything scrolled past so far, so a
  // player with more than 15 unread messages will see an undercount until
  // they actually visit the later pages. Same trade-off a numbered-page
  // inbox makes everywhere; flagged here since the old infinite-scroll
  // version happened to self-correct as you scrolled, which this no longer
  // does.
  const [mailPage, setMailPage] = useState(1)
  const [mailTotalPages, setMailTotalPages] = useState(1)
  const [loadingMail, setLoadingMail] = useState(false)
  const broadcastPageRef = useRef(1)
  const [broadcastHasMore, setBroadcastHasMore] = useState(false)
  const [loadingMoreBroadcasts, setLoadingMoreBroadcasts] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [mailPage1, broadcastPage] = await Promise.all([
        findMyMail(1, MAIL_PAGE_SIZE),
        findBroadcastMail(1, BROADCAST_PAGE_SIZE),
      ])
      setMail(mailPage1?.content || [])
      setBroadcasts(broadcastPage?.content || [])
      setMailPage(1)
      setMailTotalPages(mailPage1?.totalPages || 1)
      broadcastPageRef.current = 1
      setBroadcastHasMore(1 < (broadcastPage?.totalPages || 1))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load your mail.'
      )
    } finally {
      setLoaded(true)
    }
  }, [])

  // Fetches and SWAPS IN a specific inbox page (not append) - the pager
  // control calls this directly with the page number it wants.
  const goToMailPage = useCallback(async (page) => {
    setLoadingMail(true)
    setError(null)
    try {
      const result = await findMyMail(page, MAIL_PAGE_SIZE)
      setMail(result?.content || [])
      setMailPage(page)
      setMailTotalPages(result?.totalPages || 1)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load that page.'
      )
    } finally {
      setLoadingMail(false)
    }
  }, [])

  const loadMoreBroadcasts = useCallback(async () => {
    if (loadingMoreBroadcasts || !broadcastHasMore) return
    setLoadingMoreBroadcasts(true)
    try {
      const nextPage = broadcastPageRef.current + 1
      const page = await findBroadcastMail(nextPage, BROADCAST_PAGE_SIZE)
      const incoming = page?.content || []
      if (incoming.length > 0) {
        broadcastPageRef.current = nextPage
        setBroadcasts((prev) => {
          const seen = new Set(prev.map((b) => b.id))
          return [...prev, ...incoming.filter((b) => !seen.has(b.id))]
        })
      }
      setBroadcastHasMore(nextPage < (page?.totalPages || nextPage))
    } catch {
      // Same as loadMoreMail - silently retryable by scrolling again.
    } finally {
      setLoadingMoreBroadcasts(false)
    }
  }, [loadingMoreBroadcasts, broadcastHasMore])

  const replace = (updated) =>
    setMail((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))

  // Only splices a live-pushed item into the list while page 1 is showing -
  // on any other page, the current slice doesn't actually include "the
  // newest N" any more, so prepending here would misplace it among items
  // that don't belong next to it. It'll show correctly once the player
  // pages back to 1 (unreadCount undercounts it until then - see the note
  // above mailPage).
  const receiveMail = useCallback(
    (incoming) => {
      if (mailPage !== 1) return
      setMail((prev) => [incoming, ...prev.filter((m) => m.id !== incoming.id)])
    },
    [mailPage]
  )

  const receiveBroadcast = useCallback((incoming) => {
    setBroadcasts((prev) => [
      incoming,
      ...prev.filter((b) => b.id !== incoming.id),
    ])
  }, [])

  async function run(id, action, fallbackMessage) {
    setBusyId(id)
    setActionError(null)
    try {
      return await action()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallbackMessage)
      return null
    } finally {
      setBusyId(null)
    }
  }

  async function open(item) {
    if (item.status !== 'UNREAD') return
    const updated = await run(
      item.id,
      () => readMail(item.id),
      'Could not open that mail.'
    )
    if (updated) replace(updated)
  }

  async function claim(item) {
    const updated = await run(
      item.id,
      () => claimMail(item.id),
      'Could not claim that.'
    )
    if (updated) replace(updated)
    return updated
  }

  async function decline(item) {
    const updated = await run(
      item.id,
      () => declineMail(item.id),
      'Could not decline that invite.'
    )
    if (updated) replace(updated)
  }

  async function remove(item) {
    const ok = await run(
      item.id,
      async () => {
        await deleteMail(item.id)
        return true
      },
      'Could not delete that mail.'
    )
    if (ok) setMail((prev) => prev.filter((m) => m.id !== item.id))
  }

  async function openBroadcast(item) {
    if (item.readAt) return
    // Optimistic - a failed read-mark just means it shows unread again next
    // refresh, not worth an error banner.
    setBroadcasts((prev) =>
      prev.map((b) =>
        b.id === item.id ? { ...b, readAt: new Date().toISOString() } : b
      )
    )
    readBroadcastMail(item.id).catch(() => {})
  }

  const unreadCount =
    mail.filter((m) => m.status === 'UNREAD').length +
    broadcasts.filter((b) => !b.readAt).length

  return {
    mail,
    broadcasts,
    loaded,
    error,
    busyId,
    actionError,
    unreadCount,
    refresh,
    receiveMail,
    receiveBroadcast,
    open,
    claim,
    decline,
    remove,
    openBroadcast,
    mailPage,
    mailTotalPages,
    loadingMail,
    goToMailPage,
    broadcastHasMore,
    loadingMoreBroadcasts,
    loadMoreBroadcasts,
  }
}
