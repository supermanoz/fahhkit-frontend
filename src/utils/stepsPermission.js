// When to ask for the step-counter permission: ONLY when a run starts (or the
// player picks Indoor), after a short explanation, and at most once - a "Not
// now" or a system "Don't allow" is remembered and never nags. A denial never
// blocks a run: steps simply come from the fallback (or are left out).

import { PEDOMETER_PERMISSION } from './stepsSource'

const ASKED_KEY = 'fahhkit_steps_prompt_v1'

export function hasAskedForSteps() {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return true // storage unavailable: never nag
  }
}

export function markAskedForSteps() {
  try {
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    // no-op
  }
}

// Show our own explanation first? Only when the OS would still ask
// ('prompt') and we have not shown it before.
export function shouldShowStepsPrePrompt(status, { force = false } = {}) {
  if (!status?.available) return false
  if (status.permission !== PEDOMETER_PERMISSION.PROMPT) return false
  return force || !hasAskedForSteps()
}

// Denied / restricted: offer the Settings link (indoor screen, pre-run hint).
export function stepsNeedSettings(status) {
  return (
    Boolean(status?.available) &&
    (status.permission === PEDOMETER_PERMISSION.DENIED ||
      status.permission === PEDOMETER_PERMISSION.RESTRICTED)
  )
}
