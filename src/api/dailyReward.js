import { getJson, postJson } from './client'
import { mockClaim, mockGetStatus } from './dailyRewardMock'

// 7-day login streak (see docs/daily-reward-backend.md). The server is the
// only authority: these just fetch/POST, the client never decides who may
// claim or what they get. VITE_DAILY_REWARD_MOCK=true swaps in a local
// simulator of the same contract for development.
const USE_MOCK = import.meta.env?.VITE_DAILY_REWARD_MOCK === 'true'

export function getDailyRewardStatus() {
  return USE_MOCK ? mockGetStatus() : getJson('/v1/daily-login/status')
}

// The contract (docs/daily-reward-backend.md) calls the granted reward
// `granted`; the first backend build named it `reward`. Accept both so the
// popup always has the reward and the server's balance to show.
export function normalizeClaimResult(r) {
  if (!r || typeof r !== 'object') return r
  return { ...r, granted: r.granted ?? r.reward ?? null }
}

export function claimDailyReward() {
  return (USE_MOCK ? mockClaim() : postJson('/v1/daily-login/claim', {})).then(
    normalizeClaimResult
  )
}
