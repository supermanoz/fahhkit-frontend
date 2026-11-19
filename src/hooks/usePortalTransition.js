import { useCallback, useEffect, useRef, useState } from 'react'

// Drives the cloud "portal" between the map and the PvP arena (see
// components/PortalClouds.jsx). Phases:
//   idle -> pre (clouds off screen) -> in (sliding to the middle) -> hold
//        -> out (parting + fading) -> idle
// `onCovered` runs exactly once while the screen is fully covered, so the
// page behind can change without anyone seeing it happen.
//
// Entering takes ~1.3s (600 in, 100 hold, 600 out). Leaving is shorter, ~0.8s.
// Reduced motion is a <=200ms crossfade instead.
//
// Safety: input is locked by the overlay while it is up; start() ignores
// taps while one is already running; cancel() (hardware Back) aborts an
// unfinished entry cleanly or finishes one that has already swapped; going to
// the background or unmounting always finishes it, so clouds can't stick.
const TIMINGS = {
  enter: { inMs: 600, holdMs: 100, outMs: 600 },
  exit: { inMs: 350, holdMs: 0, outMs: 450 },
  reduced: { inMs: 90, holdMs: 0, outMs: 110 },
  abort: { inMs: 0, holdMs: 0, outMs: 220 },
}

export function prefersReducedMotion() {
  return Boolean(
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function usePortalTransition() {
  const [state, setState] = useState({
    phase: 'idle',
    kind: 'enter',
    timing: TIMINGS.enter,
  })
  const runRef = useRef(null) // the run in flight
  const busyRef = useRef(false)

  const clearTimers = (run) => {
    run?.timers.forEach(clearTimeout)
    if (run) run.timers = []
    if (run?.raf) cancelAnimationFrame(run.raf)
  }

  const finish = useCallback(() => {
    const run = runRef.current
    if (!run) return
    clearTimers(run)
    runRef.current = null
    busyRef.current = false
    setState((s) => ({ ...s, phase: 'idle' }))
    run.resolve(run.aborted ? 'aborted' : 'done')
  }, [])

  const swap = useCallback((run) => {
    if (run.covered || run.aborted) return
    run.covered = true
    try {
      run.onCovered?.()
    } catch {
      // The swap itself failing must never leave the clouds up.
    }
  }, [])

  const startOut = useCallback(
    (run, timing) => {
      setState({ phase: 'out', kind: run.kind, timing })
      // +40ms of slack lets the CSS fade finish; the reduced-motion crossfade
      // takes none, so it really is <= 200ms end to end.
      const slack = timing === TIMINGS.reduced ? 0 : 40
      run.timers.push(setTimeout(finish, timing.outMs + slack))
    },
    [finish]
  )

  const start = useCallback(
    (kind, onCovered) => {
      if (busyRef.current) return Promise.resolve('ignored')
      busyRef.current = true
      const timing = prefersReducedMotion() ? TIMINGS.reduced : TIMINGS[kind]
      return new Promise((resolve) => {
        const run = {
          kind,
          onCovered,
          timers: [],
          raf: 0,
          covered: false,
          aborted: false,
          resolve,
          timing,
        }
        runRef.current = run
        const slideIn = () => {
          if (runRef.current !== run) return
          setState({ phase: 'in', kind, timing })
          run.timers.push(
            setTimeout(() => {
              if (runRef.current !== run) return
              swap(run)
              setState({ phase: 'hold', kind, timing })
              run.timers.push(
                setTimeout(() => startOut(run, timing), timing.holdMs)
              )
            }, timing.inMs)
          )
        }
        if (timing === TIMINGS.reduced) {
          // A plain crossfade: no off-screen starting frame to wait for.
          slideIn()
          return
        }
        // One frame at the off-screen position, then slide in.
        setState({ phase: 'pre', kind, timing })
        run.raf = requestAnimationFrame(() => {
          run.raf = requestAnimationFrame(slideIn)
        })
      })
    },
    [startOut, swap]
  )

  // Hardware Back mid-transition. Before the swap: abort (the page behind
  // never changes) and fade out fast. After it: just finish at once.
  const cancel = useCallback(() => {
    const run = runRef.current
    if (!run) return false
    clearTimers(run)
    if (!run.covered) {
      run.aborted = true
      startOut(run, TIMINGS.abort)
    } else {
      finish()
    }
    return true
  }, [finish, startOut])

  // Backgrounded mid-transition: apply the pending swap and drop the clouds.
  useEffect(() => {
    const onHide = () => {
      if (!document.hidden) return
      const run = runRef.current
      if (!run) return
      clearTimers(run)
      swap(run)
      finish()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [finish, swap])

  // Unmount: never leave timers (or a pending promise) behind.
  useEffect(
    () => () => {
      const run = runRef.current
      if (!run) return
      clearTimers(run)
      runRef.current = null
      busyRef.current = false
      run.resolve('aborted')
    },
    []
  )

  return { state, start, cancel, active: state.phase !== 'idle' }
}
