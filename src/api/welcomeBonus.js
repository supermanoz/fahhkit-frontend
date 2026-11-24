import { getJson, postJson } from './client'

// One-time "Welcome, Runner!" popup (docs/welcome-bonus-backend.md). The server
// grants the signup coins at registration and owns the "acknowledged" flag;
// these only read it / set it. The client never credits anything.
// VITE_WELCOME_BONUS_MOCK=true swaps in a local simulator of the same contract.
const USE_MOCK = import.meta.env?.VITE_WELCOME_BONUS_MOCK === 'true'
const MOCK_KEY = 'fahhkit_welcome_bonus_mock'

function mockState() {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY)) || { acknowledged: false }
  } catch {
    return { acknowledged: false }
  }
}

export async function getWelcomeBonusStatus() {
  if (!USE_MOCK) return getJson('/v1/welcome-bonus/status')
  return { amount: 50, granted: true, acknowledged: mockState().acknowledged }
}

// Idempotent on the server: repeating it is safe.
export async function acknowledgeWelcomeBonus() {
  if (!USE_MOCK) return postJson('/v1/welcome-bonus/acknowledge', {})
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify({ acknowledged: true }))
  } catch {
    /* ignore */
  }
  return { amount: 50, granted: true, acknowledged: true }
}
