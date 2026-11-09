// Pure date-math + formatting for the Leaderboard season countdown pill -
// kept free of fetch/timers/React so it's cheap to unit test (see
// seasonCountdown.test.js) and reusable from both the hook and any future
// surface (e.g. the prize modal's own date line).

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// GET /v1/season/current's startDate/endDate are naive LocalDateTime
// strings with no zone - see api/season.js for why this fixed Nepal offset
// (no DST, so a constant works) is the correct read of them today.
const KATHMANDU_OFFSET_MS = (5 * 60 + 45) * MINUTE_MS

const ZONE_SUFFIX_RE = /Z$|[+-]\d{2}:?\d{2}$/
const NAIVE_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/

// Accepts either a proper zoned/UTC ISO string (the shape the backend
// should send - see api/season.js's spec note) or the naive Kathmandu
// string it sends today. Returns a UTC epoch-ms timestamp, or null for
// anything unparsable so callers can treat it as "unknown", never as 0/NaN.
export function parseSeasonDateTime(value) {
  if (!value) return null
  if (ZONE_SUFFIX_RE.test(value)) {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  const match = NAIVE_DATETIME_RE.exec(value)
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0)
  return utcMs - KATHMANDU_OFFSET_MS
}

// How far ahead (+) or behind (-) the server's clock is from this device's,
// so a wrong device clock doesn't skew the countdown. `serverTimeValue` is
// the optional serverTime field the backend should add to SeasonResponse
// (see api/season.js) - until it exists, this is always 0 (no correction),
// which is the documented fallback, not a bug.
export function computeClockOffsetMs(
  serverTimeValue,
  clientNowMs = Date.now()
) {
  const serverMs = parseSeasonDateTime(serverTimeValue)
  if (serverMs == null) return 0
  return serverMs - clientNowMs
}

export const COUNTDOWN_PHASE = {
  UNKNOWN: 'unknown',
  DAYS: 'days',
  LAST_DAY: 'last_day',
  FINAL_HOURS: 'final_hours',
  ENDED: 'ended',
}

// msRemaining is endMs - (now adjusted for clock offset); null/NaN means
// "we don't actually know" (no season loaded yet, or the fetch failed).
export function getCountdownPhase(msRemaining) {
  if (msRemaining == null || Number.isNaN(msRemaining)) {
    return COUNTDOWN_PHASE.UNKNOWN
  }
  if (msRemaining <= 0) return COUNTDOWN_PHASE.ENDED
  if (msRemaining < DAY_MS) return COUNTDOWN_PHASE.FINAL_HOURS
  if (msRemaining < 2 * DAY_MS) return COUNTDOWN_PHASE.LAST_DAY
  return COUNTDOWN_PHASE.DAYS
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// null return means "hide the pill text" (unknown/failed) - never render a
// guessed number per the brief. Every non-ended phase carries the
// "SEASON ENDS:" prefix; ENDED deliberately drops it ("SEASON ENDED" reads
// fine on its own, "SEASON ENDS: SEASON ENDED" wouldn't).
export function formatCountdownText(msRemaining) {
  switch (getCountdownPhase(msRemaining)) {
    case COUNTDOWN_PHASE.UNKNOWN:
      return null
    case COUNTDOWN_PHASE.ENDED:
      return 'SEASON ENDED'
    case COUNTDOWN_PHASE.LAST_DAY:
      return 'SEASON ENDS: LAST DAY'
    case COUNTDOWN_PHASE.FINAL_HOURS: {
      const totalSeconds = Math.floor(msRemaining / 1000)
      const hh = Math.floor(totalSeconds / 3600)
      const mm = Math.floor((totalSeconds % 3600) / 60)
      const ss = totalSeconds % 60
      return `SEASON ENDS: ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
    }
    case COUNTDOWN_PHASE.DAYS:
    default: {
      const days = Math.floor(msRemaining / DAY_MS)
      return `SEASON ENDS: ${days} DAYS LEFT`
    }
  }
}

// Deliberately kept as a natural-language sentence rather than echoing the
// pill's literal "SEASON ENDS: ..." text verbatim - a screen reader says
// this, not displays it, and "Season ends in 5 days" reads better than
// "Season ends: 5 days left" said aloud. FINAL_HOURS mirrors the pill's own
// new precision (exact HH:MM:SS, no vaguer "under a day") now that the pill
// shows the same.
export function formatSeasonAriaLabel(msRemaining) {
  const phase = getCountdownPhase(msRemaining)
  if (phase === COUNTDOWN_PHASE.UNKNOWN) return null
  if (phase === COUNTDOWN_PHASE.ENDED) return 'Season has ended'
  if (phase === COUNTDOWN_PHASE.FINAL_HOURS) {
    const totalSeconds = Math.floor(msRemaining / 1000)
    const hh = Math.floor(totalSeconds / 3600)
    const mm = Math.floor((totalSeconds % 3600) / 60)
    const ss = totalSeconds % 60
    return `Season ends in ${pad2(hh)} hours ${pad2(mm)} minutes ${pad2(ss)} seconds`
  }
  const days = Math.max(1, Math.floor(msRemaining / DAY_MS))
  return `Season ends in ${days} day${days === 1 ? '' : 's'}`
}

// Re-render cadence for the current remaining time - every second once
// inside the final day (so HH:MM:SS visibly ticks), once a minute
// otherwise (a "N DAYS LEFT"/"LAST DAY" label can't change faster than
// that, so there's nothing to gain from ticking more often).
export function tickIntervalMs(msRemaining) {
  return getCountdownPhase(msRemaining) === COUNTDOWN_PHASE.FINAL_HOURS
    ? 1000
    : 60 * 1000
}
