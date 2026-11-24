import { visibleInterval } from '../utils/visibleInterval'
import { useEffect, useState } from 'react'

// Milliseconds until `target` (epoch ms, or null), corrected by the server's
// clock skew, ticking once a second while `active`. Display only - the server
// decides when a reward is actually claimable.
export function useCountdown(target, skew = 0, active = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || !target) return undefined
    setNow(Date.now())
    return visibleInterval(() => setNow(Date.now()), 1000, 'countdown')
  }, [active, target])
  return target ? target - (now + skew) : 0
}
