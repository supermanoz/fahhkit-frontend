import { useEffect, useMemo, useRef, useState } from 'react'
import { getRunScore } from '../api/runs'
import { getChallenge } from '../api/pvp'
import {
  DELAYED_AFTER_MS,
  buildPvpView,
  isResolved,
  nextBackoff,
  POLL_START_MS,
} from '../utils/pvpResult'

// Follows ONE finished PvP run to its result.
//   1. my own result  - GET /v1/run/{id}/score-breakdown (final for my side as
//      soon as it is READY); retried quickly with a short backoff
//   2. the rival      - the socket push (`pushed`, from usePvp) is the fast
//      path; getChallenge is polled with backoff (3s -> 15s) as the fallback
//   3. on resolution  - re-read my result (rival's time) and the wallet
//      (refreshProfile -> the server's balance), once
// Duplicate pushes/polls are harmless: everything is state, and the popup
// animates on a phase CHANGE only.
// `delayed`: my own result still isn't there after DELAYED_AFTER_MS.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function usePvpPostRun({
  session, // { challengeId, runId, opponentName } | null
  userId,
  pushed, // latest challenge object the socket delivered, or null
  refreshProfile, // () => Promise<profile>
}) {
  const runId = session?.runId || null
  const challengeId = session?.challengeId || null
  const [own, setOwn] = useState(null)
  const [challenge, setChallenge] = useState(null)
  const [delayed, setDelayed] = useState(false)
  const [balanceAfter, setBalanceAfter] = useState(null)
  const [settled, setSettled] = useState(false)
  const refreshRef = useRef(refreshProfile)
  refreshRef.current = refreshProfile

  // New session -> clean slate.
  useEffect(() => {
    setOwn(null)
    setChallenge(null)
    setDelayed(false)
    setBalanceAfter(null)
    setSettled(false)
  }, [runId, challengeId])

  // The socket's version of the race, when it is for this race.
  useEffect(() => {
    if (pushed && pushed.id === challengeId) setChallenge(pushed)
  }, [pushed, challengeId])

  // 1. my own result
  useEffect(() => {
    if (!runId) return undefined
    let stop = false
    const startedAt = Date.now()
    const t = setTimeout(() => !stop && setDelayed(true), DELAYED_AFTER_MS)
    ;(async () => {
      let wait = 700
      while (!stop) {
        try {
          const r = await getRunScore(runId)
          if (r?.status === 'READY' && r.pvpResult) {
            if (!stop) {
              setOwn(r.pvpResult)
              setDelayed(false)
            }
            return
          }
        } catch {
          // transient: retry
        }
        await sleep(wait)
        wait = Math.min(Math.round(wait * 1.6), 5000)
        // Long after: keep trying quietly, slower.
        if (Date.now() - startedAt > 120_000) wait = 15_000
      }
    })()
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [runId])

  const resolved = isResolved(challenge, own)

  // 2. poll the rival while unresolved (fallback to the socket).
  useEffect(() => {
    if (!challengeId || !own || resolved) return undefined
    let stop = false
    ;(async () => {
      let wait = POLL_START_MS
      while (!stop) {
        await sleep(wait)
        if (stop) return
        try {
          const c = await getChallenge(challengeId)
          if (!stop && c) setChallenge(c)
        } catch {
          // keep the last known state; try again
        }
        wait = nextBackoff(wait)
      }
    })()
    return () => {
      stop = true
    }
  }, [challengeId, own, resolved])

  // 3. resolved: rival's time + the wallet, once.
  const settledForRef = useRef(null)
  useEffect(() => {
    if (!resolved || !runId || settledForRef.current === runId) return
    settledForRef.current = runId
    let stop = false
    ;(async () => {
      try {
        const r = await getRunScore(runId)
        if (!stop && r?.pvpResult) setOwn(r.pvpResult)
      } catch {
        // the rival's time just stays blank
      }
      try {
        const profile = await refreshRef.current?.()
        if (!stop && profile) setBalanceAfter(profile.fahhcoinBalance ?? null)
      } catch {
        // wallet row falls back to "updated in your wallet"
      }
      if (!stop) setSettled(true)
    })()
    return () => {
      stop = true
      // A re-run of this effect must be allowed to finish the job.
      if (settledForRef.current === runId) settledForRef.current = null
    }
  }, [resolved, runId])

  const view = useMemo(
    () =>
      buildPvpView({
        own,
        challenge,
        userId,
        opponentName: session?.opponentName || 'Your rival',
      }),
    [own, challenge, userId, session?.opponentName]
  )

  return { view, delayed, balanceAfter, settled }
}
