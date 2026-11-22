import { isAppActive, onAppActivityChange } from './appActivity'
import { perf } from '../dev/perfLog'

// setInterval that does NOTHING while the app is hidden/backgrounded, and
// runs once straight away when it comes back if a tick was missed (so polled
// data is fresh on return). Returns a stop function (not an id).
//
//   const stop = visibleInterval(refresh, 30000, 'clubwar-poll')
//   return stop
export function visibleInterval(fn, ms, name = 'interval') {
  let missed = false
  const untrack = perf.trackInterval(name, ms)
  const id = setInterval(() => {
    if (!isAppActive()) {
      missed = true
      return
    }
    fn()
  }, ms)
  const off = onAppActivityChange((active) => {
    if (active && missed) {
      missed = false
      fn()
    }
  })
  return () => {
    clearInterval(id)
    off()
    untrack()
  }
}
