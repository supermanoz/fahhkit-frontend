// What the app says right after a run is submitted - ONE place, keyed by run
// mode, so a non-territory mode can never show a territory message.
//
//   Training   -> "Run submitted!"       (never checks territory)
//   Conquer    -> "Run submitted!" + "Checking your territory..." while the
//                 server evaluates the loop, then the real result
//   PvP        -> "Run submitted!" + waiting-for-rival / result note
//   Club War   -> "Run submitted!" + war points note
//
// A Training run is sent with mode "TRAINING" (utils/runPayload.js); the
// server scores it on pace + effort only and never attempts territory. The
// app agrees: isTerritoryMode() below is the ONE check every screen uses.

import {
  SERVER_REJECTED_COPY,
  SERVER_REJECTED_TITLE,
} from '../constants/runMessages'

export const POST_RUN_MODE = Object.freeze({
  CONQUER: 'conquer',
  TRAINING: 'training',
  PVP: 'pvp',
  CLUB_WAR: 'club_war',
})

// completedRun / pendingRun -> mode. War wins over race wins over training,
// same order the server uses for its own routing (club war, then challenge).
export function postRunModeOf(run) {
  if (run?.isWar || run?.clubWarId) return POST_RUN_MODE.CLUB_WAR
  if (run?.isRace || run?.challengeId) return POST_RUN_MODE.PVP
  if (run?.isTraining) return POST_RUN_MODE.TRAINING
  return POST_RUN_MODE.CONQUER
}

// THE shared check: does this mode have anything to do with territory (loop
// detection, loop HUD / preview, "Checking your territory...", the territory
// result, territory wording)? Only a plain Conquer run does. Accepts the
// app's mode strings ('conquer' / 'territory') and the server's
// 'TERRITORY_CAPTURE'. Training / PvP / Club War / Boss / unknown -> false.
export function isTerritoryMode(mode) {
  return (
    mode === POST_RUN_MODE.CONQUER ||
    mode === 'territory' ||
    mode === 'TERRITORY_CAPTURE'
  )
}

// Title + note of the single, terminal "submitted" popup for the modes that
// don't wait on a territory result. `warPoints` (number|null) is the score
// the server pushed for a Club War run, once it has arrived.
export function submittedCopy(mode, { warPoints = null } = {}) {
  switch (mode) {
    case POST_RUN_MODE.TRAINING:
      return {
        title: 'Run submitted!',
        note: "Training run logged. Nothing is at stake - it's just practice, and it still earns XP.",
      }
    case POST_RUN_MODE.PVP:
      return {
        title: 'Run submitted!',
        note: '🏁 Race time logged. Waiting for your rival - check the PvP tab for the result.',
      }
    case POST_RUN_MODE.CLUB_WAR:
      return {
        title: 'Run submitted!',
        note:
          warPoints != null
            ? `⚔️ ${new Intl.NumberFormat('en-US').format(Math.round(warPoints))} war points added.`
            : '⚔️ War run logged. Counting your points…',
      }
    default:
      return { title: 'Run submitted!', note: null }
  }
}

// The territory "still checking" line - Conquer only.
export const TERRITORY_CHECKING = 'Checking your territory…'

// Should a server outcome open the rejection popup for this mode? Conquer
// shows every reason. Every other mode hides the territory reasons ("loop not
// closed", "too small", "not live here"...) but still shows a cheat flag,
// which is about the run itself.
export function showsRejection(mode, outcome) {
  if (isTerritoryMode(mode)) return true
  return outcome?.outcome === 'CHEAT_DETECTED'
}

// Cheat copy for modes that have no territory to lose.
export const CHEAT_COPY_NEUTRAL = Object.freeze({
  title: SERVER_REJECTED_TITLE,
  message: SERVER_REJECTED_COPY,
})

// Should the reward sequence (stats -> XP -> score/perk -> run image) be on
// screen now? Only AFTER the result popup is dismissed (never layered on it)
// and only once this run's reward lookup has finished (`settledId`): the XP
// numbers arrive from a profile refresh that can land after the socket's
// score push, and the sequence reads them once when it mounts - opening it
// earlier left a Club War / quick-tap Conquer run showing "+0 XP" and an
// empty bar. A run with no XP and no score still gets the sequence (it opens
// straight on the run image) as long as it has a route to draw.
export function shouldShowRunRewards({
  resultOpen,
  run,
  dismissedId,
  settledId,
  hasXp = false,
  hasScore = false,
}) {
  if (resultOpen || !run || dismissedId === run.id) return false
  if (settledId !== run.id) return false
  return hasXp || hasScore || (run.points?.length || 0) >= 2
}
