import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { getChallenge } from '../api/pvp'

// The challenge behind the PvP "Your race" screen.
//
// Why this exists: the player's challenge LIST (POST /v1/run-challenge/find)
// leaves out DECLINED and CANCELLED challenges, so the moment a challenge is
// declined the next list refresh drops it and a screen that only looked in
// the list sat on "Loading the match..." forever. The same happened when a
// race was opened from Mail / a notification while it was not in the first
// page. This hook always resolves to a real state:
//   - the list / socket copy is used the instant it exists (instant updates),
//   - GET /v1/run-challenge/{id} (any status, participants only) loads it
//     when the list does not have it, and keeps polling with backoff while
//     it is not final, so a missed socket event still arrives,
//   - 'loading' turns into 'error' after `timeoutMs` (Retry re-runs it) and
//     a 404 becomes 'notfound'. Never an endless spinner.

export const FINAL_STATUSES = ['DECLINED', 'CANCELLED', 'EXPIRED', 'COMPLETED']
export const isFinalStatus = (status) => FINAL_STATUSES.includes(status)

export const POLL_DELAYS_MS = [3000, 4000, 6000, 8000, 12000, 15000]
export const LOADING_TIMEOUT_MS = 10000

export function isNotFound(err) {
  return err instanceof ApiError && err.status === 404
}

// phase: 'loading' | 'ready' | 'error' | 'notfound'
export function useRaceDetail(
  raceId,
  listItem,
  {
    fetcher = getChallenge,
    pollDelays = POLL_DELAYS_MS,
    timeoutMs = LOADING_TIMEOUT_MS,
  } = {}
) {
  const [detail, setDetail] = useState(null)
  const [phase, setPhase] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const detailRef = useRef(null)
  detailRef.current = detail

  // A final state is never overwritten by an older non-final copy (a stale
  // list refresh arriving after the decline).
  const apply = useCallback((c) => {
    setDetail((prev) =>
      prev && isFinalStatus(prev.status) && !isFinalStatus(c.status) ? prev : c
    )
    setPhase('ready')
  }, [])

  // New race: start clean.
  useEffect(() => {
    setDetail(null)
    setPhase('loading')
  }, [raceId])

  // The list / socket copy, as soon as there is one.
  useEffect(() => {
    if (raceId && listItem && listItem.id === raceId) apply(listItem)
  }, [raceId, listItem, apply])

  // Server copy: first load + backoff polling until a final state.
  useEffect(() => {
    if (!raceId) return undefined
    let cancelled = false
    let timer = null
    let step = 0
    const giveUp = setTimeout(() => {
      setPhase((p) => (p === 'loading' ? 'error' : p))
    }, timeoutMs)

    async function tick() {
      try {
        const c = await fetcher(raceId)
        if (cancelled) return
        apply(c)
        if (isFinalStatus(c.status)) return
      } catch (err) {
        if (cancelled) return
        if (isNotFound(err) && !detailRef.current) {
          setPhase('notfound')
          return
        }
        // Anything else: keep what we have, try again below.
      }
      if (cancelled || isFinalStatus(detailRef.current?.status)) return
      const delay = pollDelays[Math.min(step, pollDelays.length - 1)]
      step += 1
      timer = setTimeout(tick, delay)
    }
    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(giveUp)
    }
  }, [raceId, attempt, fetcher, apply, pollDelays, timeoutMs])

  const retry = useCallback(() => {
    setPhase('loading')
    setAttempt((n) => n + 1)
  }, [])

  return { race: detail, phase: detail ? 'ready' : phase, retry }
}
