// Keeps the session alive in the background: refreshes the token shortly
// BEFORE it expires and again whenever the app/tab returns to the foreground
// (a phone that slept past the expiry would otherwise find a dead token on the
// next tap). It never signs anyone out itself - if a token can't be refreshed
// the next real request runs the recovery in api/client.js (refresh, then ask
// the server, then sign out), so a timer can't kill a run in progress.
import { App as CapacitorApp } from '@capacitor/app'
import {
  describeTokenExpiry,
  getToken,
  isRefreshSupported,
  refreshSession,
  subscribeAuth,
} from '../api/client'
import { isNative } from './geo'
import { tokenExpiryMs } from './jwtExpiry'

export const REFRESH_AHEAD_MS = 10 * 60 * 1000
const MIN_DELAY_MS = 30 * 1000
const MAX_TIMER_MS = 2 ** 31 - 1

let timer = null
let started = false

// How long until the token should be refreshed: null = nothing to schedule.
export function refreshDelayMs(token, now = Date.now()) {
  const exp = tokenExpiryMs(token)
  if (!token || exp == null) return null
  return Math.min(
    Math.max(exp - REFRESH_AHEAD_MS - now, MIN_DELAY_MS),
    MAX_TIMER_MS
  )
}

async function refreshIfDue(reason) {
  const token = getToken()
  const exp = tokenExpiryMs(token)
  if (!token || exp == null) return
  const left = exp - Date.now()
  if (left > REFRESH_AHEAD_MS) return
  if (!isRefreshSupported()) {
    console.info(
      `[auth] ${reason}: token ${describeTokenExpiry(token)}; no refresh endpoint`
    )
    return
  }
  const result = await refreshSession(token)
  console.info(`[auth] ${reason}: refresh -> ${result}`)
}

function schedule() {
  clearTimeout(timer)
  timer = null
  const token = getToken()
  if (!token) return
  console.info(`[auth] session token ${describeTokenExpiry(token)}`)
  const delay = refreshDelayMs(token)
  if (delay == null || !isRefreshSupported()) return
  timer = setTimeout(async () => {
    await refreshIfDue('before expiry')
    schedule()
  }, delay)
}

export function startSessionKeeper() {
  if (started) return
  started = true
  // A token that expired while the app was closed (still refreshable for 7
  // days) is renewed right away, not after the first request fails.
  refreshIfDue('startup').then(schedule)
  schedule()
  subscribeAuth(schedule)
  const onForeground = async () => {
    await refreshIfDue('foreground')
    schedule()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onForeground()
  })
  if (isNative) {
    CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive) onForeground()
    }).catch(() => {})
  }
}
