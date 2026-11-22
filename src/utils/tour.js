// First-time walkthrough: WHO sees it and WHEN - pure functions, no React, so
// the gating is unit-tested (utils/tour.test.js). The UI is components/
// GameTour.jsx, the state machine hooks/useGameTour.js, the words
// constants/tourCopy.js.

// Bump to show a NEWER tour to everyone later (the key changes with it).
export const TOUR_VERSION = 1

// A player counts as "new" only while their account is this young...
export const NEW_PLAYER_DAYS = 7
// ...AND they have no real progress yet.
const DAY_MS = 86_400_000

// Order = the order players see them. `target` is a CSS selector (a data-tour
// attribute set in GamePage/TerritoryMap); `radial` is what the Play menu
// must be doing for the target to exist; `gameplay` steps are skipped while
// the game is halted outside a rollout area (their buttons are disabled).
export const TOUR_STEPS = Object.freeze([
  { id: 'welcome', target: null, radial: 'closed' },
  { id: 'hero', target: '[data-tour="recenter"]', radial: 'closed' },
  {
    id: 'play',
    target: '[data-tour="radial-play"]',
    radial: 'main',
    gameplay: true,
  },
  { id: 'mail', target: '[data-tour="radial-mail"]', radial: 'main' },
  { id: 'shop', target: '[data-tour="radial-shop"]', radial: 'main' },
  { id: 'me', target: '[data-tour="radial-me"]', radial: 'main' },
  { id: 'done', target: null, radial: 'closed', cta: true },
])

export function tourStepsFor({ locked = false } = {}) {
  return TOUR_STEPS.filter((s) => !(locked && s.gameplay))
}

// "tour_v1_<userId>" - per account, per device.
export const tourKey = (userId, version = TOUR_VERSION) =>
  `tour_v${version}_${userId}`

function store(storage) {
  if (storage) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

// Storage that throws/is missing counts as "seen": better never to show it
// than to show it on every launch with no way to remember.
export function hasSeenTour(userId, storage) {
  if (!userId) return true
  const s = store(storage)
  if (!s) return true
  try {
    return s.getItem(tourKey(userId)) != null
  } catch {
    return true
  }
}

export function markTourSeen(userId, storage) {
  if (!userId) return
  const s = store(storage)
  if (!s) return
  try {
    s.setItem(tourKey(userId), String(Date.now()))
  } catch {
    // Nothing to do - it will simply not be remembered.
  }
}

// user: { joinedDate } (backend UserResponse). profile: { level, xp,
// parcelCount } (/v1/territory/profile). Both come from data the game
// already loads. Unknown joinedDate does not block (older accounts may lack
// it) - level and territory carry the decision then.
export function looksLikeNewPlayer({
  user,
  profile,
  parcelCount = 0,
  now = Date.now(),
}) {
  if (!user || !profile) return false
  if ((profile.level ?? 1) > 1) return false
  if ((profile.parcelCount ?? 0) > 0 || parcelCount > 0) return false
  if (user.joinedDate) {
    const joined = new Date(user.joinedDate).getTime()
    if (!Number.isNaN(joined) && now - joined > NEW_PLAYER_DAYS * DAY_MS) {
      return false
    }
  }
  return true
}

// Auto-start: never seen it AND looks new. (Replay skips both checks.)
export function shouldAutoStartTour({
  userId,
  user,
  profile,
  parcelCount,
  now,
  storage,
}) {
  if (!userId) return false
  if (hasSeenTour(userId, storage)) return false
  return looksLikeNewPlayer({ user, profile, parcelCount, now })
}

// Reasons the tour must wait (queued behind them, never stacked on top).
// ctx values are plain booleans from GamePage. Returns the first reason or
// null when the screen is clear.
export function tourWaitReason(ctx) {
  const order = [
    ['loading', !ctx.gameReady],
    ['intro', ctx.introPlaying],
    ['run', ctx.running],
    ['rollout-popup', ctx.rolloutPopup],
    ['broadcast', ctx.broadcast],
    ['challenge', ctx.challenge],
    ['nudge', ctx.nudge],
    ['modal', ctx.modalOpen],
    ['menu', ctx.menuOpen],
  ]
  const hit = order.find(([, on]) => on)
  return hit ? hit[0] : null
}

// A run starting / the account going away ends the tour for good (it is NOT
// marked seen, so it restarts next time); popups only pause it.
export function tourMustAbort(ctx) {
  return !ctx.userId || Boolean(ctx.running)
}

export function nextVisibleIndex(steps, from, dir) {
  const i = from + dir
  return i >= 0 && i < steps.length ? i : -1
}
