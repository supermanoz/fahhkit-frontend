// Pure state handling for the daily reward (no React, unit-tested). The
// server's answers are stored as-is; the only things derived here are display
// helpers (tile states, countdown text) - never eligibility.

export const initialDailyRewardState = {
  phase: 'idle', // idle | loading | ready | claiming | claimed | error | unavailable
  status: null,
  result: null,
  error: null,
  claimError: false, // error came from a failed claim (kept across the re-sync)
  anim: 'none', // none | playing | done - the claim celebration
  mismatch: false, // server granted something other than its own status listed
  skew: 0, // serverTime - Date.now(), display-only countdown correction
  open: false,
  dismissed: false, // popup was shown & closed this claimable window
}

function skewOf(serverTime, now) {
  const t = Date.parse(serverTime)
  return Number.isFinite(t) ? t - now : 0
}

export function dailyRewardReducer(state, action) {
  switch (action.type) {
    case 'CHECK_START':
      // Keep an already-known status visible while re-checking.
      return { ...state, phase: state.status ? state.phase : 'loading' }
    case 'CHECK_OK': {
      const status = action.status
      const skew = skewOf(status.serverTime, action.now)
      if (state.phase === 'claiming') return state
      if (status.claimable) {
        // A fresh claimable window re-arms the popup (unless it is already up).
        const wasClaimed = state.phase === 'claimed' || !state.status?.claimable
        return {
          ...state,
          status,
          skew,
          error: state.claimError ? state.error : null,
          result: null,
          phase: 'ready',
          dismissed: wasClaimed ? false : state.dismissed,
        }
      }
      return {
        ...state,
        status,
        skew,
        error: state.claimError ? state.error : null,
        phase: state.phase === 'claimed' ? 'claimed' : 'waiting',
      }
    }
    case 'CHECK_FAIL':
      // The server answered with an HTTP error before we ever had a status:
      // the endpoint isn't there yet (or isn't usable) - stay hidden instead
      // of showing a permanent error. A genuine network failure (no HTTP
      // answer) still shows the retry state; later re-checks recover either.
      if (action.http && !state.status) {
        return { ...initialDailyRewardState, phase: 'unavailable' }
      }
      return {
        ...state,
        phase: state.status ? state.phase : 'error',
        error: state.open ? action.message : state.error,
      }
    case 'UNAVAILABLE':
      return { ...initialDailyRewardState, phase: 'unavailable' }
    case 'OPEN':
      return { ...state, open: true }
    case 'CLOSE':
      return { ...state, open: false, dismissed: true }
    case 'CLAIM_START':
      return {
        ...state,
        phase: 'claiming',
        error: null,
        claimError: false,
        anim: 'none',
        mismatch: false,
      }
    case 'CLAIM_OK': {
      const r = action.result
      return {
        ...state,
        phase: 'claimed',
        result: r,
        skew: skewOf(r.serverTime, action.now),
        // Reduced motion: no celebration to wait for.
        anim: action.reduced ? 'done' : 'playing',
        mismatch: grantMismatch(state.status, r.granted),
        status: {
          ...(state.status || {}),
          claimable: false,
          nextClaimAt: r.nextClaimAt,
          streak: r.streak,
          todayIndex: r.todayIndex,
          serverTime: r.serverTime,
        },
        error: null,
      }
    }
    case 'CLAIM_FAIL':
      // Nothing was granted: no result, no animation.
      return {
        ...state,
        phase: 'ready',
        result: null,
        anim: 'none',
        claimError: true,
        error:
          action.message || 'Could not claim your reward. Please try again.',
      }
    case 'ANIM_SKIP':
    case 'ANIM_DONE':
      return state.anim === 'playing' ? { ...state, anim: 'done' } : state
    case 'RESET':
      return initialDailyRewardState
    default:
      return state
  }
}

// Tile state for day `day` (1..7) given the server status.
// claimed | today | locked
export function tileState(status, day, claimedNow = false) {
  if (!status) return 'locked'
  const idx = status.todayIndex
  if (status.claimable) {
    if (day < idx) return 'claimed'
    return day === idx ? 'today' : 'locked'
  }
  return day <= idx || claimedNow
    ? day <= idx
      ? 'claimed'
      : 'locked'
    : 'locked'
}

// Whether the popup should auto-open right now. `blocked` = anything that must
// not be interrupted (active run, post-run screens, rollout popup, logged out).
export function shouldAutoOpen(state, { blocked, shownThisSession }) {
  return (
    !blocked &&
    !shownThisSession &&
    state.phase === 'ready' &&
    Boolean(state.status?.claimable) &&
    !state.open &&
    !state.dismissed
  )
}

// Dot on the menu button: claimable but the popup is not showing.
export function hasClaimableDot(state) {
  return (
    Boolean(state.status?.claimable) && state.phase !== 'claimed' && !state.open
  )
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}`
}

// The reward the server listed for today (status.rewards[todayIndex]) vs what
// the claim response says it granted. A difference means the backend grants
// something other than its own config says; the UI always shows what was
// granted, this just flags it.
export function grantMismatch(status, granted) {
  if (!status || !granted) return false
  const listed = (status.rewards || []).find((r) => r.day === status.todayIndex)
  if (!listed) return false
  return (
    (listed.coins || 0) !== (granted.coins || 0) ||
    (listed.xp || 0) !== (granted.xp || 0) ||
    (listed.item?.id ?? null) !== (granted.item?.id ?? null)
  )
}

// Split `total` coins over `n` flying coins so the parts always sum exactly.
export function splitCoins(total, n) {
  const count = Math.max(1, Math.min(n, total || 1))
  const base = Math.floor((total || 0) / count)
  const out = Array(count).fill(base)
  out[count - 1] += (total || 0) - base * count
  return out
}

// "12h 30m" / "45m 10s" / "9s" - the chest card's "Next in ..." text.
export function formatNext(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

// Which chest to draw: claimable (open, glowing) | claimed (closed, dimmed,
// countdown) | neutral (loading / error / nothing known yet).
export function chestState(state) {
  if (!state?.status) return 'neutral'
  return state.status.claimable && state.phase !== 'claimed'
    ? 'claimable'
    : 'claimed'
}

// Tiny badge under the HUD chest: "12h" / "45m" / "30s".
export function formatBadge(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  if (h > 0) return `${h}h`
  const m = Math.floor(total / 60)
  return m > 0 ? `${m}m` : `${total}s`
}
