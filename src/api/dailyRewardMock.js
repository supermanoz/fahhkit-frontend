// In-browser simulator of the daily-reward contract (docs/daily-reward-backend.md),
// used only when VITE_DAILY_REWARD_MOCK=true. Mirrors the server rules (24h
// window, 48h streak, 7-day cycle) so the UI can be built before the backend
// ships. State lives in localStorage; never used in production builds unless
// the flag is set.
const KEY = 'fahhkit_daily_reward_mock'
const H = 3600 * 1000

export const MOCK_REWARDS = [
  { day: 1, coins: 5, xp: 0, item: null },
  { day: 2, coins: 10, xp: 0, item: null },
  { day: 3, coins: 15, xp: 50, item: null },
  { day: 4, coins: 20, xp: 0, item: null },
  { day: 5, coins: 25, xp: 100, item: null },
  { day: 6, coins: 30, xp: 0, item: null },
  { day: 7, coins: 100, xp: 250, item: { id: 41, name: 'Golden Trail' } },
]

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { balance: 0 }
  } catch {
    return { balance: 0 }
  }
}
function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

function view(s, now) {
  const last = s.lastClaimAt ?? null
  const claimable = last == null || now >= last + 24 * H
  const broken = last != null && now >= last + 48 * H
  const streak = broken || last == null ? 0 : s.streak
  const cycleDay = (n) => ((n - 1) % 7) + 1
  return {
    claimable,
    nextClaimAt: claimable ? null : new Date(last + 24 * H).toISOString(),
    streak,
    todayIndex: claimable ? cycleDay(streak + 1) : cycleDay(s.streak),
    rewards: MOCK_REWARDS,
    serverTime: new Date(now).toISOString(),
  }
}

export async function mockGetStatus() {
  return view(load(), Date.now())
}

export async function mockClaim() {
  const s = load()
  const now = Date.now()
  const v = view(s, now)
  if (!v.claimable) {
    const err = new Error('You have already claimed your daily reward.')
    err.status = 409
    throw err
  }
  const streak = v.streak + 1
  const granted = MOCK_REWARDS[v.todayIndex - 1]
  const next = {
    lastClaimAt: now,
    streak,
    balance: (s.balance || 0) + granted.coins,
  }
  save(next)
  return {
    granted,
    streak,
    todayIndex: v.todayIndex,
    balance: next.balance,
    nextClaimAt: new Date(now + 24 * H).toISOString(),
    serverTime: new Date(now).toISOString(),
  }
}
