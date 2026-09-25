import { useCallback, useState } from 'react'
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

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [mailPage, broadcastPage] = await Promise.all([
        findMyMail(1, 30),
        findBroadcastMail(1, 20),
      ])
      setMail(mailPage?.content || [])
      setBroadcasts(broadcastPage?.content || [])
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load your mail.'
      )
    } finally {
      setLoaded(true)
    }
  }, [])

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
  }
}
