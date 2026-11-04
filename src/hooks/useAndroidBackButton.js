import { useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { isNative } from '../utils/geo'

// Hardware Back button handling for the native app - a no-op on the website
// (see isNative), where the browser's own Back already does the right
// thing. `layers` is a topmost-first list of {isOpen, close} pairs - isOpen
// is a function, not a plain value, so it can read ref-backed state (e.g.
// GameAuthGate's current screen) that changes without GamePage itself
// re-rendering. The first one reporting open gets closed and the press is
// swallowed, same as a deliberate in-app "back" tap would. With nothing
// open, Back either asks before exiting (idle) or is swallowed entirely
// while `blocked` is true - GamePage passes `tracker.status === 'tracking'`
// so Back can never exit (or navigate anywhere) mid-run.
export function useAndroidBackButton({ layers, blocked }) {
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  // Subscribed once below; a ref keeps the listener reading the latest
  // layers/blocked without re-subscribing to the native event on every
  // render (GamePage re-renders often, e.g. every tick of a live run).
  const stateRef = useRef({ layers, blocked })
  stateRef.current = { layers, blocked }

  useEffect(() => {
    if (!isNative) return
    const handle = CapacitorApp.addListener('backButton', () => {
      const { layers: currentLayers, blocked: currentlyBlocked } =
        stateRef.current
      const topmost = currentLayers.find((layer) => layer.isOpen())
      if (topmost) {
        topmost.close()
        return
      }
      if (currentlyBlocked) return
      setExitConfirmOpen(true)
    })
    return () => {
      handle.then((h) => h.remove())
    }
    // Subscribes once - stateRef.current always has the latest values.
  }, [])

  return {
    exitConfirmOpen,
    cancelExit: () => setExitConfirmOpen(false),
    confirmExit: () => CapacitorApp.exitApp(),
  }
}
