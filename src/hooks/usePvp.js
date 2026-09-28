import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  getPvpMode,
  cancelChallenge,
  forfeitChallenge,
  findMyChallenges,
  findNearbyPlayers,
  getPvpQueueStatus,
  joinPvpQueue,
  leavePvpQueue,
  pingPvpLocation,
  reviewChallenge,
  sendDirectChallenge,
  setPvpDiscoverable,
} from '../api/pvp'
import { playerName } from '../utils/playerName'

const DISCOVERABLE_KEY = 'fahhkit_pvp_discoverable'
// Backend treats a location older than 15 min as stale (pvp.discovery.
// freshness-seconds=900) - pinging well inside that keeps us listed.
const LOCATION_PING_MS = 2 * 60 * 1000
// Queue matching sweeps every 5s server-side; the socket normally tells us
// first, this is the fallback if it's not connected.
const CHALLENGE_POLL_MS = 20000
const CHALLENGE_FAST_POLL_MS = 5000
const CHALLENGE_OPEN_POLL_MS = 8000
const QUEUE_POLL_MS = 5000

function loadDiscoverable() {
  try {
    return localStorage.getItem(DISCOVERABLE_KEY) === 'true'
  } catch {
    return false
  }
}

function errorMessage(err, fallback) {
  return err instanceof ApiError ? err.message : fallback
}

// My side of a challenge, whichever seat I'm in.
export function mySide(challenge, userId) {
  const isChallenger = challenge.challengerId === userId
  return {
    isChallenger,
    // First name only - PvP responses carry full names, no nicknames.
    opponentName: playerName(
      null,
      isChallenger ? challenge.opponentName : challenge.challengerName
    ),
    confirmed: isChallenger
      ? challenge.challengerConfirmed
      : challenge.opponentConfirmed,
    theirConfirmed: isChallenger
      ? challenge.opponentConfirmed
      : challenge.challengerConfirmed,
    myRunId: isChallenger ? challenge.challengerRunId : challenge.opponentRunId,
    theirRunId: isChallenger
      ? challenge.opponentRunId
      : challenge.challengerRunId,
  }
}

// All PvP race state for the game page - owned here rather than inside the
// Race panel so the menu badge and socket pushes work while it's closed.
export function usePvp({ userId, playerLocation }) {
  const [challenges, setChallenges] = useState([])
  const [challengesLoaded, setChallengesLoaded] = useState(false)
  const [queueEntry, setQueueEntry] = useState(null)
  const [discoverable, setDiscoverableState] = useState(loadDiscoverable)
  const [nearby, setNearby] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  // Short-lived "you got matched / challenged" callout for the map.
  const [alert, setAlert] = useState(null)

  const locationRef = useRef(playerLocation)
  locationRef.current = playerLocation

  // Last list seen, to spot status changes a poll picks up (the socket push
  // that would normally announce them may never arrive - see below).
  const challengesRef = useRef([])
  challengesRef.current = challenges

  const refreshChallenges = useCallback(async () => {
    try {
      const page = await findMyChallenges(1, 20)
      const next = page?.content || []
      // A poll that finds a race newly started / finished gets the same
      // callout the push would have given.
      const prevById = new Map(challengesRef.current.map((c) => [c.id, c]))
      for (const c of next) {
        const prev = prevById.get(c.id)
        if (!prev || prev.status === c.status) continue
        if (c.status === 'IN_PROGRESS')
          setAlert({ kind: 'started', challenge: c })
        else if (c.status === 'COMPLETED')
          setAlert({ kind: 'resolved', challenge: c })
      }
      setChallenges(next)
    } catch {
      // Keep whatever's loaded - a background refresh isn't worth an error.
    } finally {
      setChallengesLoaded(true)
    }
  }, [])

  const refreshQueue = useCallback(async () => {
    try {
      setQueueEntry((await getPvpQueueStatus()) || null)
    } catch {
      // Same as above.
    }
  }, [])

  const ping = useCallback(async () => {
    const loc = locationRef.current
    if (!loc) return
    try {
      await pingPvpLocation(loc.lat, loc.lng)
    } catch {
      // Next ping will try again.
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    refreshChallenges()
    refreshQueue()
  }, [userId, refreshChallenges, refreshQueue])

  // Backstop for the socket push: re-check challenges every so often (and
  // when the tab comes back) so updates still land if the live connection
  // is down. NOTE: the backend's WebSocket endpoint only accepts origins in
  // fks.allowed.origins (default http://localhost:8000) - the dev app's
  // origins get a 403 handshake, so in dev this polling is the ONLY way
  // PvP updates arrive.
  // Waiting on the rival (they still have to confirm, or to run): poll
  // fast so their move shows up within seconds even without the socket.
  const waitingOnThem = challenges.some((c) => {
    const side = mySide(c, userId)
    return (
      (c.status === 'PENDING' && side.confirmed) ||
      (c.status === 'IN_PROGRESS' && Boolean(side.myRunId))
    )
  })
  useEffect(() => {
    if (!userId) return
    // Visible to nearby runners = someone can challenge us any moment, so
    // check often enough that the challenge pop-up shows within seconds
    // (the "challenge received" push doesn't reach the dev app).
    const interval = setInterval(
      refreshChallenges,
      waitingOnThem
        ? CHALLENGE_FAST_POLL_MS
        : discoverable
          ? CHALLENGE_OPEN_POLL_MS
          : CHALLENGE_POLL_MS
    )
    const onVisible = () => {
      if (!document.hidden) refreshChallenges()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, refreshChallenges, waitingOnThem, discoverable])

  // While discoverable, keep our last-known location fresh so we show up in
  // other players' nearby lists.
  useEffect(() => {
    if (!userId || !discoverable) return
    ping()
    const interval = setInterval(ping, LOCATION_PING_MS)
    return () => clearInterval(interval)
  }, [userId, discoverable, ping])

  const waiting = queueEntry?.status === 'WAITING'
  const queueEntryRef = useRef(queueEntry)
  queueEntryRef.current = queueEntry
  useEffect(() => {
    if (!waiting) return
    const interval = setInterval(async () => {
      try {
        const entry = await getPvpQueueStatus()
        if (entry?.status === 'WAITING') {
          setQueueEntry(entry)
          return
        }
        if (entry?.status === 'MATCHED' && entry.matchedChallengeId) {
          markMatched(entry, entry.matchedChallengeId)
          return
        }
        // The server's /status only returns WAITING entries - once we're
        // matched (or the search expired) it answers null. Work out which
        // from our races: a fresh, unanswered quick-match race at this
        // distance means we got paired.
        const prev = queueEntryRef.current
        if (!prev || prev.status !== 'WAITING') return
        const page = await findMyChallenges(1, 20)
        const list = page?.content || []
        setChallenges(list)
        const meters = getPvpMode(prev.mode)?.meters
        const match = list.find(
          (c) =>
            c.source === 'QUEUE' &&
            c.status === 'PENDING' &&
            (meters == null || c.distanceMeters === meters) &&
            !mySide(c, userId).confirmed
        )
        if (match) {
          markMatched(prev, match.id)
        } else {
          setQueueEntry({ ...prev, status: 'EXPIRED' })
          setAlert({ kind: 'expired' })
        }
      } catch {
        // Try again next tick.
      }
    }, QUEUE_POLL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, refreshChallenges])

  // Queue → matched: record the race id (PvpPanel jumps to it) and give the
  // same callout + redirect the match-found push would.
  function markMatched(base, challengeId) {
    setQueueEntry({
      ...base,
      status: 'MATCHED',
      matchedChallengeId: challengeId,
    })
    refreshChallenges()
    setAlert({ kind: 'matched', challenge: { id: challengeId } })
  }

  async function act(key, fn, fallback) {
    setBusy(key)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      setError(errorMessage(err, fallback))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function toggleDiscoverable(next) {
    const ok = await act(
      'discoverable',
      async () => {
        await setPvpDiscoverable(next)
        return true
      },
      'Could not update that setting.'
    )
    if (!ok) return
    setDiscoverableState(next)
    try {
      localStorage.setItem(DISCOVERABLE_KEY, String(next))
    } catch {
      // Just won't be remembered next visit.
    }
  }

  async function scanNearby() {
    const players = await act(
      'nearby',
      async () => {
        // Nearby search is centred on OUR last pinged location, so ping
        // first or the server either rejects it or uses a stale spot.
        const loc = locationRef.current
        if (loc) await pingPvpLocation(loc.lat, loc.lng)
        return findNearbyPlayers()
      },
      'Could not look for nearby runners.'
    )
    if (players) setNearby(players)
  }

  async function challengePlayer(opponentUserId, mode, stake) {
    const created = await act(
      `challenge-${opponentUserId}`,
      () => sendDirectChallenge(opponentUserId, mode, stake),
      'Could not send that challenge.'
    )
    if (created) {
      setChallenges((prev) => [created, ...prev])
    }
    return created
  }

  async function joinQueue(mode) {
    const entry = await act(
      'queue',
      () => joinPvpQueue(mode),
      'Could not join the queue.'
    )
    if (entry) {
      setQueueEntry(entry)
      if (entry.status === 'MATCHED') refreshChallenges()
    }
    return entry
  }

  async function leaveQueue() {
    const ok = await act(
      'queue',
      async () => {
        await leavePvpQueue()
        return true
      },
      'Could not leave the queue.'
    )
    if (ok) setQueueEntry((prev) => prev && { ...prev, status: 'CANCELLED' })
  }

  function upsertChallenge(updated) {
    setChallenges((prev) =>
      prev.some((c) => c.id === updated.id)
        ? prev.map((c) => (c.id === updated.id ? updated : c))
        : [updated, ...prev]
    )
  }

  async function review(challenge, accept) {
    const updated = await act(
      `review-${challenge.id}`,
      () => reviewChallenge(challenge.id, accept),
      accept ? 'Could not accept that race.' : 'Could not decline that race.'
    )
    if (updated) upsertChallenge(updated)
    return updated
  }

  async function cancel(challenge) {
    const updated = await act(
      `cancel-${challenge.id}`,
      () => cancelChallenge(challenge.id),
      'Could not cancel that race.'
    )
    if (updated) upsertChallenge(updated)
  }

  async function forfeit(challenge) {
    const updated = await act(
      `forfeit-${challenge.id}`,
      () => forfeitChallenge(challenge.id),
      'Could not forfeit that race.'
    )
    if (updated) upsertChallenge(updated)
    return updated
  }

  // Socket pushes from useGameSocket's onPvp.
  const handlePush = useCallback((eventName, payload) => {
    if (eventName === 'pvp-queue-expired') {
      setQueueEntry((prev) => prev && { ...prev, status: 'EXPIRED' })
      setAlert({ kind: 'expired' })
      return
    }
    if (payload?.id) {
      setChallenges((prev) =>
        prev.some((c) => c.id === payload.id)
          ? prev.map((c) => (c.id === payload.id ? payload : c))
          : [payload, ...prev]
      )
    }
    if (eventName === 'pvp-match-found') {
      // Carry the race id too, so the PvP panel's searching screen jumps
      // straight to it (it keys off queueEntry.matchedChallengeId).
      setQueueEntry(
        (prev) =>
          prev && {
            ...prev,
            status: 'MATCHED',
            matchedChallengeId: payload?.id ?? prev.matchedChallengeId,
          }
      )
      setAlert({ kind: 'matched', challenge: payload })
    } else if (eventName === 'pvp-challenge-received') {
      setAlert({ kind: 'received', challenge: payload })
    } else if (eventName === 'pvp-challenge-resolved') {
      setAlert({ kind: 'resolved', challenge: payload })
    } else if (
      eventName === 'pvp-challenge-reviewed' &&
      payload?.status === 'IN_PROGRESS'
    ) {
      setAlert({ kind: 'started', challenge: payload })
    }
  }, [])

  // Needs me: a pending race I haven't confirmed, or a live race I haven't
  // run yet.
  const actionCount = challenges.filter((c) => {
    const side = mySide(c, userId)
    if (c.status === 'PENDING') return !side.confirmed
    if (c.status === 'IN_PROGRESS') return !side.myRunId
    return false
  }).length

  return {
    challenges,
    challengesLoaded,
    queueEntry,
    discoverable,
    nearby,
    busy,
    error,
    alert,
    actionCount,
    clearAlert: () => setAlert(null),
    refreshChallenges,
    toggleDiscoverable,
    scanNearby,
    challengePlayer,
    joinQueue,
    leaveQueue,
    review,
    cancel,
    forfeit,
    handlePush,
  }
}
