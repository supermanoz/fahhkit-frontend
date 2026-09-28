import { useEffect, useRef, useState } from 'react'
import { getActiveClubWar, getClubWar } from '../api/clubWar'

// Page-level watch on the player's club war, so the phase change (prep →
// battle) and the final result get announced over the map even with the
// menu closed. The backend sends NO socket push for club wars - its phase
// scheduler flips them once a minute (cron "0 * * * * *") - so this polls:
// every minute normally, every 5s from a minute before a deadline until the
// flip lands, and every 2 min when no war is on.
const IDLE_MS = 2 * 60 * 1000
const NORMAL_MS = 60 * 1000
const NEAR_MS = 5 * 1000
const NEAR_WINDOW_MS = 60 * 1000

function deadlineOf(war) {
  if (!war) return null
  const at = war.status === 'PREPARING' ? war.prepEndsAt : war.battleEndsAt
  const t = at ? new Date(at).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

export function useClubWarWatch(enabled) {
  // { kind: 'battle' | 'ended', war }
  const [alert, setAlert] = useState(null)
  const warRef = useRef(null)

  useEffect(() => {
    if (!enabled) {
      warRef.current = null
      return undefined
    }
    let cancelled = false
    let timer = null

    async function check() {
      try {
        const prev = warRef.current
        const active = await getActiveClubWar()
        if (cancelled) return
        if (active) {
          if (
            prev?.id === active.id &&
            prev.status === 'PREPARING' &&
            active.status === 'BATTLE'
          ) {
            setAlert({ kind: 'battle', war: active })
          }
          warRef.current = active
        } else if (prev) {
          // Gone from "active" = it just finished - fetch the result.
          const done = await getClubWar(prev.id)
          if (cancelled) return
          if (done?.status === 'COMPLETED')
            setAlert({ kind: 'ended', war: done })
          warRef.current = null
        }
      } catch {
        // Try again next tick.
      }
      if (cancelled) return
      const w = warRef.current
      const deadline = deadlineOf(w)
      const delay = !w
        ? IDLE_MS
        : deadline && Date.now() > deadline - NEAR_WINDOW_MS
          ? NEAR_MS
          : NORMAL_MS
      timer = setTimeout(check, delay)
    }

    check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled])

  return { warAlert: alert, clearWarAlert: () => setAlert(null) }
}
