// PvP post-run result model - pure, unit-tested (pvpResult.test.js).
//
// PvP is a RACE, not a score: both runners cover the same distance and the
// faster race time wins the pot (stake x 2). What the server tells us:
//   * my run's result  GET /v1/run/{id}/score-breakdown -> pvpResult
//       { runValid, invalidReason, raceTimeSeconds, heroBonus,
//         opponentSubmitted, opponentRaceTimeSeconds, resolutionType, won }
//   * points (optional, only when the server sends them): see pointsOf
//   * the challenge    GET /v1/run-challenge/{id} and the socket push
//       /specific/{me}/pvp-challenge-resolved -> { status, winnerId,
//         resolutionType, stakeAmount, ... }
// Coins are never computed here: the payout shows as the difference between
// the wallet balances the SERVER reported before and after the race resolved.

export const POLL_START_MS = 3000
export const POLL_MAX_MS = 15000
export const DELAYED_AFTER_MS = 15000

// Exponential backoff for the polling fallback: 3s, 4.5s, 6.75s ... 15s.
export function nextBackoff(ms) {
  return Math.min(Math.round(ms * 1.5), POLL_MAX_MS)
}

export function formatRaceTime(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '--:--'
  const s = Math.max(0, Math.round(Number(seconds)))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function isResolved(challenge, own) {
  if (own?.resolutionType || (own && own.won != null)) return true
  return (
    challenge?.status === 'COMPLETED' ||
    challenge?.status === 'EXPIRED' ||
    Boolean(challenge?.resolutionType)
  )
}

// 'pending' | 'win' | 'lose' | 'draw' | 'refund'
export function outcomeOf({ challenge, own, userId }) {
  if (!isResolved(challenge, own)) return 'pending'
  const type = challenge?.resolutionType || own?.resolutionType
  if (type === 'TIE_REFUND') return 'draw'
  if (type === 'MUTUAL_FORFEIT_REFUND') return 'refund'
  if (challenge?.winnerId) return challenge.winnerId === userId ? 'win' : 'lose'
  if (own?.won === true) return 'win'
  if (own?.won === false) return 'lose'
  return 'refund'
}

// Everything the popup needs, from the raw server answers.
export function buildPvpView({
  own,
  challenge,
  userId,
  opponentName = 'Your rival',
}) {
  const outcome = outcomeOf({ challenge, own, userId })
  const resolved = outcome !== 'pending'
  const opponentSubmitted =
    Boolean(own?.opponentSubmitted) ||
    Boolean(
      challenge &&
      (challenge.challengerId === userId
        ? challenge.opponentRunId
        : challenge.challengerRunId)
    )
  return {
    hasOwn: Boolean(own),
    resolved,
    outcome,
    valid: own ? own.runValid !== false : true,
    invalidReason: own?.invalidReason || null,
    raceTimeSeconds: own?.raceTimeSeconds ?? null,
    heroBonus: own?.heroBonus || null,
    opponentName,
    opponentSubmitted,
    opponentRaceTimeSeconds: own?.opponentRaceTimeSeconds ?? null,
    points: resolved ? pointsOf({ own, challenge, userId }) : null,
    stake: challenge?.stakeAmount ?? null,
    forfeit:
      (challenge?.resolutionType || own?.resolutionType) === 'WIN_BY_FORFEIT',
  }
}

// Points for this race, ONLY as reported by the server (never computed here).
// Looked for on my pvpResult (`pointsEarned`, signed integer) and, because my
// own result is fetched before the rival finishes, also on the challenge once
// it resolves (`challengerPointsEarned` / `opponentPointsEarned`). Optional
// breakdown for the subtext: `pointsWin`, `pointsRace` (same places).
// Returns { total, win, race } or null when the server sent nothing.
const asInt = (v) =>
  v != null && v !== '' && Number.isFinite(Number(v))
    ? Math.trunc(Number(v))
    : null

export function pointsOf({ own, challenge, userId }) {
  const role =
    challenge && userId
      ? challenge.challengerId === userId
        ? 'challenger'
        : challenge.opponentId === userId
          ? 'opponent'
          : null
      : null
  const pick = (ownKey, chKey) =>
    asInt(own?.[ownKey]) ?? (role ? asInt(challenge?.[role + chKey]) : null)
  const total = pick('pointsEarned', 'PointsEarned')
  if (total == null) return null
  return {
    total,
    win: pick('pointsWin', 'PointsWin'),
    race: pick('pointsRace', 'PointsRace'),
  }
}

// Wallet change reported by the server across the race (null until both
// balances are known).
export function coinChange(balanceBefore, balanceAfter) {
  if (!Number.isFinite(balanceBefore) || !Number.isFinite(balanceAfter))
    return null
  return balanceAfter - balanceBefore
}

// --- "show it once" bookkeeping ------------------------------------------
// The session (which run to follow) survives an app kill; "seen" makes the
// final result animate and pay out visually exactly once per race.
const SESSION_KEY = 'fahhkit_pvp_postrun'
const SEEN_PREFIX = 'fahhkit_pvp_seen_'

function lsGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v)
  } catch {
    // storage unavailable: worst case the result animates again
  }
}

export function saveSession(session) {
  lsSet(SESSION_KEY, JSON.stringify(session))
}
export function loadSession(userId) {
  try {
    const s = JSON.parse(lsGet(SESSION_KEY) || 'null')
    if (!s || s.userId !== userId || !s.challengeId || !s.runId) return null
    if (hasSeen(s.challengeId)) return null
    return s
  } catch {
    return null
  }
}
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
export function hasSeen(challengeId) {
  return lsGet(SEEN_PREFIX + challengeId) === '1'
}
export function markSeen(challengeId) {
  lsSet(SEEN_PREFIX + challengeId, '1')
}
