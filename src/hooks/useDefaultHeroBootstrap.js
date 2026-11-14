import { useEffect, useRef } from 'react'
import { claimFreeItem, equipStoreItem } from '../api/store'
import { findDefaultHeroToBootstrap } from '../utils/defaultHero'

const RETRY_MS = 30_000
const MAX_ATTEMPTS = 3

// Silently records the default hero (Comet) as owned + equipped on the
// backend for clean accounts. The UI already shows Comet as equipped, so
// nothing flashes; failures are ignored and retried later. Guarded against
// double calls (StrictMode double effects, rapid re-renders) with refs.
// Claiming Comet makes the backend grant its free bundle (Classic emote).
export default function useDefaultHeroBootstrap({
  enabled,
  heroes,
  ownedItems,
  onDone,
}) {
  const inFlight = useRef(false)
  const attempts = useRef(0)
  const timer = useRef(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!enabled || inFlight.current || attempts.current >= MAX_ATTEMPTS) return
    const item = findDefaultHeroToBootstrap(heroes, ownedItems)
    if (!item) return
    function run() {
      if (inFlight.current) return
      inFlight.current = true
      attempts.current += 1
      ;(async () => {
        try {
          await claimFreeItem(item.id)
          await equipStoreItem(item.id)
          onDoneRef.current?.()
        } catch {
          // Quiet by design; try again later (bounded).
          if (attempts.current < MAX_ATTEMPTS) {
            timer.current = setTimeout(() => {
              inFlight.current = false
              onDoneRef.current?.()
            }, RETRY_MS)
            return
          }
        }
        inFlight.current = false
      })()
    }
    run()
  }, [enabled, heroes, ownedItems])

  useEffect(() => () => clearTimeout(timer.current), [])
}
