import { useEffect, useState } from 'react'
import { subscribeFixes } from '../utils/gpsFeed'
import { startRunView } from '../utils/runView'
import { isMapDebugEnabled } from '../utils/mapDebug'
import { visibleInterval } from '../utils/visibleInterval'

// The shared RUN / IDLE state of the run in progress (see utils/runView.js).
// React only hears about it when the view flips or the "moving at all" flag
// changes - a handful of times per run, never per GPS fix or per frame.
//
//   const { mode, slow } = useRunView(isTracking)
//   mode === 'run'  -> hero runs, map turns with the runner
//   mode === 'idle' -> hero idles, map fixed north-up
//   slow            -> moving at all (the ground direction cone)
const IDLE = { mode: 'idle', slow: false }

export function useRunView(active) {
  const [view, setView] = useState(IDLE)

  useEffect(() => {
    if (!active) {
      startRunView(false).reset()
      setView((v) => (v === IDLE ? v : IDLE))
      return undefined
    }
    const machine = startRunView(isMapDebugEnabled())
    const publish = () => {
      const { mode, slow } = machine.state()
      setView((v) => (v.mode === mode && v.slow === slow ? v : { mode, slow }))
    }
    const off = subscribeFixes((fix) => {
      machine.pushFix({
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        speed: fix.speed,
        t: Number.isFinite(fix.t) ? fix.t : Date.now(),
      })
      publish()
    })
    const stop = visibleInterval(
      () => {
        machine.tick()
        publish()
      },
      500,
      'run-view'
    )
    return () => {
      off()
      stop()
    }
  }, [active])

  return view
}
