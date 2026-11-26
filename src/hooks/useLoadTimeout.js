import { useEffect, useState } from 'react'

// A skeleton must never sit on screen forever: after this long still loading,
// the screen swaps to its error state (with Retry).
export const SKELETON_TIMEOUT_MS = 15_000

// True once `loading` has stayed true for `ms`. Flips back to false the moment
// loading ends (or restarts, so a Retry gets a fresh full timeout).
export function useLoadTimeout(loading, ms = SKELETON_TIMEOUT_MS) {
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (!loading) {
      setTimedOut(false)
      return undefined
    }
    const id = setTimeout(() => setTimedOut(true), ms)
    return () => clearTimeout(id)
  }, [loading, ms])
  return loading && timedOut
}
