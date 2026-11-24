import { Capacitor } from '@capacitor/core'
import { toLocalDateTimeString } from './run'
import { clientRunIdOf } from './clientRunId'
import { postRunModeOf } from './postRun'

// The exact POST /v1/run body for a finished run (shared by the normal submit
// and the offline outbox, so both send the same thing). `clientRunId` is the
// idempotency key (created at run start; legacy runs derive one from startedAt).
export function buildRunPayload(run) {
  return {
    eventId: null,
    points: run.points,
    distance: run.distance,
    duration: run.duration,
    startedAt: toLocalDateTimeString(run.startedAt),
    endedAt: toLocalDateTimeString(run.endedAt),
    challengeId: run.challengeId || undefined,
    clubWarId: run.clubWarId || undefined,
    clientRunId: clientRunIdOf(run),
  }
}

// What the UI needs to list a queued run without opening its (large) payload.
export function buildRunSummary(run) {
  return {
    mode: postRunModeOf(run),
    isTraining: Boolean(run.isTraining),
    distance: run.distance,
    duration: run.duration,
    startedAt: new Date(run.startedAt).toISOString(),
    endedAt: new Date(run.endedAt).toISOString(),
    pointCount: run.points?.length ?? 0,
    challengeId: run.challengeId || null,
    clubWarId: run.clubWarId || null,
  }
}

// Context recorded for audit/anti-cheat review. The server never trusts any of
// it for rewards; `queuedAtClientMs` lets it notice a device clock that was
// changed while offline (compare with its own receive time).
export function buildRunMeta({ heroId = null } = {}) {
  let platform = 'web'
  try {
    platform = Capacitor.getPlatform()
  } catch {
    // not available - stay 'web'
  }
  return {
    heroId,
    platform,
    userAgent: (typeof navigator !== 'undefined'
      ? navigator.userAgent
      : ''
    ).slice(0, 200),
    appVersion: import.meta.env.VITE_APP_VERSION || null,
    tzOffsetMinutes: new Date().getTimezoneOffset(),
    queuedAtClientMs: Date.now(),
  }
}
