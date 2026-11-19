// The ONE way into the PvP arena. Every entry point (Play menu, section
// pickers, challenge alerts, accepted challenges, the idle nudge, push taps)
// calls enterPvp(source) - see GamePage.jsx - and this module decides what
// happens, in a fixed order:
//
//   1. rollout lock                 -> blocked (the game is halted here)
//   2. a run in progress            -> blocked (only the alert pill may enter)
//   3. a live race / search already -> enter (never lock anyone out of a live
//                                      race); only STARTING a new match is gated
//   4. location off / denied        -> "Location is off" popup
//   5. Visibility off               -> "Turn on Visibility" popup
//   6. otherwise                    -> cloud transition, then the PvP hub
//
// Pure functions + a small controller, no React, so the routing is unit-tested.

export const PVP_SOURCES = Object.freeze({
  PLAY_MENU: 'play-menu', // radial menu -> Play -> PvP
  SECTION_MENU: 'section-menu', // the menu's tab row / section picker
  ALERT_PILL: 'alert-pill', // tap on the on-map challenge / race pill
  ALERT_AUTO: 'alert-auto', // a race went live / queue match: show it
  CHALLENGE_ACCEPTED: 'challenge-accepted', // accepted from the pop-up
  IDLE_NUDGE: 'idle-nudge', // "Battle" on the come-back nudge
  PUSH_TAP: 'push-tap', // notification tap routed to PvP
})

// While a run is being tracked only the alert pill may open PvP (it always
// could; the FAB is hidden and the auto-open effect skips a running player).
const ALLOWED_WHILE_RUNNING = new Set([PVP_SOURCES.ALERT_PILL])

// What the player must have in place to START a new match (Quick Match /
// Challenge Nearby). Returns the popup to show, or null when they're set.
export function resolveMatchStart({ locationState, discoverable }) {
  if (locationState === 'denied') return { variant: 'location' }
  if (!discoverable) return { variant: 'visibility' }
  return null
}

// ctx: { locked, running, locationState, discoverable, hasLiveRace }
//   locationState: 'granted' | 'denied' | 'unknown' (unknown = ask later)
export function resolvePvpEntry({ source, ...ctx }) {
  if (ctx.locked) return { action: 'blocked', reason: 'locked' }
  if (ctx.running && !ALLOWED_WHILE_RUNNING.has(source))
    return { action: 'blocked', reason: 'running' }
  // Exception: never lock someone out of a live race or an open search. They
  // may enter to see it; the hub gates only the "start a new match" step.
  if (ctx.hasLiveRace)
    return {
      action: 'enter',
      gatedStarts: resolveMatchStart(ctx) !== null,
    }
  const gate = resolveMatchStart(ctx)
  if (gate) return { action: 'prompt', variant: gate.variant }
  return { action: 'enter', gatedStarts: false }
}

// Controller: createPvpEntry(deps).enterPvp(source) is the single entry
// function. All side effects are injected, so tests drive it with mocks.
//
//   deps.getContext()          -> ctx for resolvePvpEntry (read fresh each time;
//                                  may be async - the location permission check)
//   deps.showGate(variant, src)  open the Visibility / Location popup
//   deps.hideGate()              close it
//   deps.turnOnVisibility()   -> Promise<boolean>  (same call as the Settings toggle)
//   deps.runPortal(kind, onCovered) -> Promise     cloud transition; onCovered
//                                                  runs when the screen is covered
//   deps.openPvp(source)         actually show the PvP hub
export function createPvpEntry(deps) {
  let busy = false

  // Busy is held from the very first tap (the location check is async), so
  // rapid taps can never start two entries.
  async function enterPvp(source) {
    if (busy) return { status: 'ignored' }
    busy = true
    try {
      const decision = resolvePvpEntry({ source, ...(await deps.getContext()) })
      if (decision.action === 'blocked')
        return { status: 'blocked', reason: decision.reason }
      if (decision.action === 'prompt') {
        deps.showGate(decision.variant, source)
        return { status: 'prompt', variant: decision.variant }
      }
      await deps.runPortal('enter', () => deps.openPvp(source))
      return { status: 'entered', gatedStarts: decision.gatedStarts }
    } finally {
      busy = false
    }
  }

  // "Turn On" in the popup: the same call the Settings toggle makes. On
  // success continue into the portal; on failure stay put (the caller shows a
  // friendly retry message). Never enables anything by itself.
  async function confirmVisibility(source) {
    if (busy) return { status: 'ignored' }
    busy = true
    try {
      let ok = false
      try {
        ok = Boolean(await deps.turnOnVisibility())
      } catch {
        ok = false
      }
      if (!ok) return { status: 'failed' }
      deps.hideGate()
      await deps.runPortal('enter', () => deps.openPvp(source))
      return { status: 'entered' }
    } finally {
      busy = false
    }
  }

  return { enterPvp, confirmVisibility }
}
