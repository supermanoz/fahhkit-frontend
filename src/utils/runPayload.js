import { Capacitor } from '@capacitor/core'
import { toLocalDateTimeString } from './run'
import { clientRunIdOf } from './clientRunId'
import { POST_RUN_MODE, postRunModeOf } from './postRun'

// The backend's explicit run mode (RunCreateRequest.mode). Only Training asks
// for one: it makes the server skip territory processing entirely. Every
// other run omits it, so Conquer / PvP / Club War are byte-for-byte what they
// always were (the server derives their mode from challengeId / clubWarId).
export const BACKEND_RUN_MODE_TRAINING = 'TRAINING'
export function backendRunModeOf(run) {
  return postRunModeOf(run) === POST_RUN_MODE.TRAINING
    ? BACKEND_RUN_MODE_TRAINING
    : undefined
}

// Steps for the request: only a real count from the phone's motion sensor.
// Absent (never 0, never a guess) when the sensor was unavailable or counted
// nothing - the server then stores null and the UI hides the row.
export function stepsForPayload(run) {
  const n = Number(run?.stepCount ?? run?.steps)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

// Where the steps / distance came from ('pedometer' | 'accelerometer';
// indoor distance: 'pedometer' | 'steps' | 'manual'). Audit context only - the
// server has no field for `stepsSource` / `indoor` / `distanceSource` yet and ignores them (docs/indoor-training-backend-ask.md).
// Sent only when there are steps, never for a guess.
export function stepsSourceForPayload(run) {
  return stepsForPayload(run) != null && run?.stepsSource
    ? String(run.stepsSource)
    : undefined
}

const epochMs = (v) => {
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : undefined
}

function clientPlatform() {
  try {
    const p = Capacitor.getPlatform()
    return p === 'ios' || p === 'android' ? p : 'web'
  } catch {
    return 'web'
  }
}

// The exact POST /v1/run body for a finished run (shared by the normal submit
// and the offline outbox, so both send the same thing). `clientRunId` is the
// idempotency key (created at run start; legacy runs derive one from startedAt).
// Every point carries `elevation` (GPS altitude, null when the phone has none).
// `offline: true` marks a run that was queued because the phone had no
// connection (the server stores it and applies its late-run rules);
// `clientSentAtEpochMs` is added at send time (api/runs.js createRun).
export function buildRunPayload(run, { offline = false } = {}) {
  const version = import.meta.env.VITE_APP_VERSION
  return {
    eventId: null,
    points: run.points ?? [],
    distance: run.distance,
    duration: run.duration,
    startedAt: toLocalDateTimeString(new Date(run.startedAt)),
    endedAt: toLocalDateTimeString(new Date(run.endedAt)),
    // Time-zone-safe times: the strings above carry no offset, the server
    // prefers these when present.
    startedAtEpochMs: epochMs(run.startedAt),
    endedAtEpochMs: epochMs(run.endedAt),
    challengeId: run.challengeId || undefined,
    clubWarId: run.clubWarId || undefined,
    clientRunId: clientRunIdOf(run),
    mode: backendRunModeOf(run),
    steps: stepsForPayload(run),
    stepsSource: stepsSourceForPayload(run),
    // Indoor (treadmill) Training: a TRAINING run with no points, whose
    // distance the player confirmed from the treadmill display. The server has
    // no field for this yet - it is sent so it can be stored/capped (see
    // docs/indoor-training-backend-ask.md); today it is ignored.
    indoor: run.isIndoor ? true : undefined,
    distanceSource: run.isIndoor ? run.distanceSource || 'manual' : undefined,
    offline: offline ? true : undefined,
    appVersion: version ? String(version).slice(0, 32) : undefined,
    platform: clientPlatform(),
  }
}

// What the UI needs to list a queued run without opening its (large) payload.
export function buildRunSummary(run) {
  return {
    mode: postRunModeOf(run),
    isTraining: Boolean(run.isTraining),
    isIndoor: Boolean(run.isIndoor),
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
