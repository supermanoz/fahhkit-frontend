import { useEffect, useRef, useState } from 'react'

// True for a moment right after the thing identified by `key` flips from
// locked to unlocked while it is on screen (a hero just bought/unlocked) -
// drives the short reveal animation. Switching to a different key, or
// first showing something already unlocked, never triggers it.
export function useUnlockReveal(key, locked, ms = 900) {
  const prev = useRef({ key, locked })
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    const was = prev.current
    prev.current = { key, locked }
    if (was.key !== key || !was.locked || locked) return undefined
    setRevealing(true)
    const t = setTimeout(() => setRevealing(false), ms)
    return () => clearTimeout(t)
  }, [key, locked, ms])

  // A different hero swaps in: never carry the reveal over.
  return revealing && prev.current.key === key
}
