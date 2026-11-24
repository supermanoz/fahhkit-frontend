import { useCallback, useEffect, useRef, useState } from 'react'
import { isOnline, subscribeConnectivity } from '../utils/connectivity'
import { onAppActivityChange } from '../utils/appActivity'
import { flushOutbox } from '../utils/runSync'
import { listOutbox, subscribeOutbox } from '../utils/runOutbox'

// Flushes the outbox for `userId` whenever it could succeed: app start / the
// account changing (= right after login), the connection coming back, the app
// returning to the foreground, and when a backoff delay is over. Also exposes
// the account's outbox for the UI (pending-runs list).
export function useRunSync({ userId, send, onSynced }) {
  const sendRef = useRef(send)
  sendRef.current = send
  const syncedRef = useRef(onSynced)
  syncedRef.current = onSynced
  const timerRef = useRef(null)
  const [runs, setRuns] = useState([])

  const refresh = useCallback(async () => {
    setRuns(userId ? await listOutbox(userId) : [])
  }, [userId])

  const flush = useCallback(async () => {
    if (!userId || !isOnline()) return
    const out = await flushOutbox({
      userId,
      send: (payload, id) => sendRef.current(payload, id),
      onSynced: (rec, res) => syncedRef.current?.(rec, res),
    })
    clearTimeout(timerRef.current)
    if (out.nextDueAt) {
      timerRef.current = setTimeout(
        flush,
        Math.max(500, out.nextDueAt - Date.now())
      )
    }
  }, [userId])

  useEffect(() => {
    refresh()
    return subscribeOutbox(refresh)
  }, [refresh])

  useEffect(() => {
    flush()
    const offConn = subscribeConnectivity((s) => s.online && flush())
    const offApp = onAppActivityChange((active) => active && flush())
    return () => {
      offConn()
      offApp()
      clearTimeout(timerRef.current)
    }
  }, [flush])

  return { runs, flush, refresh }
}
