import { useEffect, useRef, useState } from 'react'

// Animates a displayed integer toward `value` whenever it changes (coins,
// score, trophies, km^2) - transform/opacity-free (it's just text), driven
// by requestAnimationFrame so it stays 60fps-cheap. Skips the animation
// entirely under prefers-reduced-motion, and on first mount (no pop-in from
// zero on initial load).
export function useNumberRollup(value, { duration = 500 } = {}) {
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)
  const frameRef = useRef(null)
  const mountedOnce = useRef(false)

  useEffect(() => {
    const from = prevValue.current
    const to = value
    prevValue.current = value

    if (!mountedOnce.current) {
      mountedOnce.current = true
      setDisplay(to)
      return
    }
    if (from === to) return

    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
    if (reduceMotion) {
      setDisplay(to)
      return
    }

    const start = performance.now()
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) * (1 - progress)
      setDisplay(Math.round(from + (to - from) * eased))
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, duration])

  return display
}
