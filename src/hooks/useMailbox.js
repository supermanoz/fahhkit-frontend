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

const MAIL_PAGE_SIZE = 30
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
  // Scroll-triggered pagination for each list (see MailPanel's sentinel
  // elements) - the page counters are refs since only the derived
  // hasMore/loadingMore flags need to drive a render.
  const mailPageRef = useRef(1)
  const broadcastPageRef = useRef(1)
  const [mailHasMore, setMailHasMore] = useState(false)
  const [broadcastHasMore, setBroadcastHasMore] = useState(false)
  const [loadingMoreMail, setLoadingMoreMail] = useState(false)
  const [loadingMoreBroadcasts, setLoadingMoreBroadcasts] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [mailPage, broadcastPage] = await Promise.all([
        findMyMail(1, MAIL_PAGE_SIZE),
        findBroadcastMail(1, BROADCAST_PAGE_SIZE),
      ])
      setMail(mailPage?.content || [])
      setBroadcasts(broadcastPage?.content || [])
      mailPageRef.current = 1
      broadcastPageRef.current = 1
      setMailHasMore(1 < (mailPage?.totalPages || 1))
      setBroadcastHasMore(1 < (broadcastPage?.totalPages || 1))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load your mail.'
      )
    } finally {
      setLoaded(true)
    }
  }, [])

  // Appends the next page instead of replacing the list - a live-pushed item
  // (receiveMail/receiveBroadcast prepend) can land in between, so incoming
  // ids already in the list are dropped rather than duplicated.
  const loadMoreMail = useCallback(async () => {
    if (loadingMoreMail || !mailHasMore) return
    setLoadingMoreMail(true)
    try {
      const nextPage = mailPageRef.current + 1
      const page = await findMyMail(nextPage, MAIL_PAGE_SIZE)
      const incoming = page?.content || []
      if (incoming.length > 0) {
        mailPageRef.current = nextPage
        setMail((prev) => {
          const seen = new Set(prev.map((m) => m.id))
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))]
        })
      }
      setMailHasMore(nextPage < (page?.totalPages || nextPage))
    } catch {
      // Leave the list as-is - the sentinel stays in view, so scrolling
      // (or the next refresh) just tries again.
    } finally {
      setLoadingMoreMail(false)
    }
  }, [loadingMoreMail, mailHasMore])

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

  const receiveMail = useCallback((incoming) => {
    setMail((prev) => [incoming, ...prev.filter((m) => m.id !== incoming.id)])
  }, [])

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
    mailHasMore,
    loadingMoreMail,
    loadMoreMail,
    broadcastHasMore,
    loadingMoreBroadcasts,
    loadMoreBroadcasts,
  }
}
