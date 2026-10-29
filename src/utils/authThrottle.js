// Client-side-only throttle for repeated failed sign-in attempts inside the
// in-game auth screens. The backend has no login rate-limiting today (see
// AuthErrorCode.java/PasswordChangeRequest.java - no such concept exists) -
// this is a cosmetic deterrent against mashing the Sign In button, not a
// real security control. Framework-free (no React) so it's directly
// unit-testable with a fake clock, same philosophy as vehicleDetection.js.
export const MAX_CONSECUTIVE_FAILURES = 5
export const COOLDOWN_MS = 30000

export function createAuthThrottle(now = () => Date.now()) {
  let failures = 0
  let cooldownUntil = 0

  return {
    recordFailure() {
      failures += 1
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        cooldownUntil = now() + COOLDOWN_MS
        failures = 0
      }
    },
    recordSuccess() {
      failures = 0
      cooldownUntil = 0
    },
    cooldownRemainingMs() {
      return Math.max(0, cooldownUntil - now())
    },
  }
}
