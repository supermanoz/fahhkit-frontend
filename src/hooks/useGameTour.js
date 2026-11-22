import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  markTourSeen,
  nextVisibleIndex,
  shouldAutoStartTour,
  tourMustAbort,
  tourStepsFor,
  tourWaitReason,
} from '../utils/tour'

// How long the screen must stay clear before the tour appears on its own.
// Native permission dialogs (location, notifications) are OS-level and can't
// be observed, so this gap lets them come and go first.
export const TOUR_SETTLE_MS = 2500
// A replay from Settings only waits for the menu to close.
const REPLAY_SETTLE_MS = 250

// The tour's state machine (see utils/tour.js for the rules).
//   ctx: { userId, user, profile, parcelCount, locked, wait (reason|null),
//          running, storage?, settleMs? }
// Marks "seen" ONLY on finish / skip - an app kill mid-tour restarts it.
export function useGameTour(ctx) {
  const { userId, user, profile, parcelCount, locked, wait, running } = ctx
  const settleMs = ctx.settleMs ?? TOUR_SETTLE_MS
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [replayWanted, setReplayWanted] = useState(false)
  // Never auto-start twice in one session, even if the player skipped.
  const autoTriedRef = useRef(null)

  const steps = useMemo(() => tourStepsFor({ locked }), [locked])
  const step = active ? (steps[index] ?? null) : null

  const stop = useCallback(() => {
    setActive(false)
    setIndex(0)
  }, [])

  // Logout / a run starting ends it without marking it seen.
  const abort = tourMustAbort({ userId, running })
  useEffect(() => {
    if (abort) {
      setActive(false)
      setIndex(0)
      setReplayWanted(false)
    }
  }, [abort])

  // Switching account mid-session: forget the previous account's attempt.
  useEffect(() => {
    autoTriedRef.current = null
  }, [userId])

  // Start (auto or replay) once the screen has been clear for a moment.
  const autoOk =
    !active &&
    !abort &&
    autoTriedRef.current !== userId &&
    shouldAutoStartTour({
      userId,
      user,
      profile,
      parcelCount,
      storage: ctx.storage,
    })
  useEffect(() => {
    if (wait || abort) return undefined
    if (!replayWanted && !autoOk) return undefined
    const timer = setTimeout(
      () => {
        if (!replayWanted) autoTriedRef.current = userId
        setReplayWanted(false)
        setIndex(0)
        setActive(true)
      },
      replayWanted ? REPLAY_SETTLE_MS : settleMs
    )
    return () => clearTimeout(timer)
  }, [wait, abort, replayWanted, autoOk, userId, settleMs])

  const finish = useCallback(() => {
    markTourSeen(userId, ctx.storage)
    stop()
  }, [userId, ctx.storage, stop])

  const next = useCallback(() => {
    const n = nextVisibleIndex(steps, index, 1)
    if (n < 0) finish()
    else setIndex(n)
  }, [steps, index, finish])

  const back = useCallback(() => {
    const p = nextVisibleIndex(steps, index, -1)
    if (p >= 0) setIndex(p)
  }, [steps, index])

  // A target that isn't on screen: step over it in the direction of travel.
  const skipMissing = useCallback(
    (dir) => {
      const n = nextVisibleIndex(steps, index, dir)
      if (n >= 0) setIndex(n)
      else if (dir > 0) finish()
    },
    [steps, index, finish]
  )

  const replay = useCallback(() => setReplayWanted(true), [])

  return {
    active,
    paused: active && Boolean(wait),
    steps,
    index,
    step,
    next,
    back,
    skip: finish,
    finish,
    skipMissing,
    replay,
    // Waiting to start (auto or replay) - other nudges hold off meanwhile.
    pending: autoOk || replayWanted,
  }
}

export { tourWaitReason }
