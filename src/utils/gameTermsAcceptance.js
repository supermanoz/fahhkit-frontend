import { GAME_TERMS_VERSION } from '../constants/gameLegal'

// Which version of the Run Conquest terms/privacy the player accepted at
// sign-up. Stored locally only: the backend has no endpoint for this (checked
// ~/Documents/FahhKit - nothing accepts a terms version), so it is NOT sent.
// When one exists, send recordGameTermsAcceptance()'s value alongside signup.
const KEY = 'fahhkit.gameTermsAccepted'

export function recordGameTermsAcceptance(email) {
  const record = {
    version: GAME_TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    email: email || null,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* storage unavailable (private mode) - acceptance simply isn't kept */
  }
  return record
}

export function getGameTermsAcceptance() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}
