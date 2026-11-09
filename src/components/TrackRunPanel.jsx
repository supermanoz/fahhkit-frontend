/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { FaExclamation, FaTimes } from 'react-icons/fa'
import { ApiError } from '../api/client'
import { createRun } from '../api/runs'
import { useRunTracker } from '../hooks/useRunTracker'
import { VehicleState } from '../utils/vehicleDetection'
import {
  isAccessibilityModeEnabled,
  isAntiCheatDebugEnabled,
  setAccessibilityModeEnabled,
} from '../utils/antiCheatSettings'
import VehicleDebugOverlay from './VehicleDebugOverlay'
import {
  MIN_DISTANCE_FOR_PACE_METERS,
  MIN_VALID_RUN_DISTANCE_METERS,
  MIN_VALID_RUN_DURATION_SECONDS,
  calculatePaceMinPerKm,
  formatDistance,
  formatDuration,
  formatPace,
  toLocalDateTimeString,
} from '../utils/run'
import './TrackRunPanel.css'

// The live-tracking widget itself (stats + start/stop), reused by both the
// dedicated /runs/track page and the full-screen live-event prompt. eventId
// is required by the backend to link the run to a paid endurance
// registration (see RunCreateRequest) - the caller is responsible for
// resolving it (the live prompt already knows it; the standalone page has
// the athlete pick from their paid endurance registrations).
export default function TrackRunPanel({ eventId, onSaved }) {
  const {
    status,
    elapsedSeconds,
    distance,
    start,
    stop,
    backgroundGapSeconds,
    dismissBackgroundGap,
    pendingRun,
    clearPendingRun,
    vehicleState,
    vehicleReason,
    suspectDismissed,
    dismissSuspect,
    disputeVehicle,
    getDebugInfo,
  } = useRunTracker()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [confirmingStop, setConfirmingStop] = useState(false)
  const [accessibilityMode, setAccessibilityMode] = useState(
    isAccessibilityModeEnabled
  )
  const [debugEnabled] = useState(isAntiCheatDebugEnabled)

  const pace = calculatePaceMinPerKm(distance, elapsedSeconds)
  const tracking = status === 'tracking'

  // Pace over just a few seconds/meters of GPS noise is meaningless, so it
  // holds at "--" until both a minimum time AND a minimum distance have
  // passed, then only re-snapshots every 30s after that instead of jittering
  // on every GPS fix.
  const [displayPace, setDisplayPace] = useState(null)
  useEffect(() => {
    if (!tracking) {
      setDisplayPace(pace)
      return
    }
    if (elapsedSeconds < 30 || distance < MIN_DISTANCE_FOR_PACE_METERS) {
      setDisplayPace(null)
      return
    }
    if (elapsedSeconds % 30 === 0) {
      setDisplayPace(pace)
    }
    // pace is read for its current-render value at each elapsedSeconds tick;
    // it isn't a dependency on purpose, so a GPS fix alone can't retrigger this
    // beyond the distance check above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, elapsedSeconds, distance])

  async function attemptSave(run, { force = false } = {}) {
    // Both minimums are enforced independently - a run has to clear each on
    // its own, not just one or the other.
    if (run.distance < MIN_VALID_RUN_DISTANCE_METERS) {
      setSaveError({
        title: "That's a warm-up, not a run 😅",
        message: `Only ${formatDistance(run.distance)} covered — runs need at least ${MIN_VALID_RUN_DISTANCE_METERS}m to count. Shake it off and go again.`,
      })
      return
    }
    if (run.duration < MIN_VALID_RUN_DURATION_SECONDS) {
      setSaveError({
        title: "That's a warm-up, not a run 😅",
        message: `Only ${formatDuration(run.duration)} on the clock — runs need at least ${MIN_VALID_RUN_DURATION_SECONDS}s to count. Shake it off and go again.`,
      })
      return
    }
    // More than 30% of this run looked vehicle-assisted - block the normal
    // auto-save and let the athlete either discard or explicitly insist (the
    // backend re-validates the raw points independently either way, so a
    // false positive here doesn't guarantee credit, it just doesn't get
    // silently thrown away).
    if (run.isVehicleInvalid && !force) {
      setSaveError({
        title: 'Mostly vehicle, not legs 🚗',
        message: `About ${Math.round((run.vehicleSuspiciousRatio || 0) * 100)}% of this run looked vehicle-assisted, so it won't score as-is. Discard it, or save anyway if this was a false alarm (it'll still be reviewed).`,
        offerForceSave: true,
      })
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await createRun({
        eventId: run.eventId,
        points: run.points,
        distance: run.distance,
        duration: run.duration,
        startedAt: toLocalDateTimeString(run.startedAt),
        endedAt: toLocalDateTimeString(run.endedAt),
        segmentFlags: run.segments,
        maxSpeedMps: run.maxSpeedMps,
        avgSpeedMps: run.avgSpeedMps,
        stepCount: run.stepCount,
        vehicleSuspiciousRatio: run.vehicleSuspiciousRatio,
        clientFlaggedInvalid: run.isVehicleInvalid,
        vehicleDisputeCount: run.disputes?.length || 0,
      })
      clearPendingRun()
      onSaved(saved)
    } catch (err) {
      // Deliberately not clearing the pending run here — it stays in localStorage
      // (see useRunTracker) so "Retry Save" works even after closing the app,
      // e.g. if this failed because there was no connection at the time.
      setSaveError({
        title: "Couldn't save that",
        message:
          err instanceof ApiError
            ? err.message
            : 'Could not save this run. Please try again.',
      })
      setSaving(false)
    }
  }

  async function handleConfirmStop() {
    setConfirmingStop(false)
    const result = stop()
    if (result.points.length === 0) {
      if (result.fixCount === 0) {
        setSaveError({
          title: 'Nice try 👀',
          message:
            'We never actually found you out there. Did the run happen, or nah? Check your location is turned on and give it another go.',
        })
      } else {
        const accuracyText =
          result.lastAccuracy != null
            ? ` Signal was ~${Math.round(result.lastAccuracy)}m off — nowhere close.`
            : ''
        setSaveError({
          title: "That's sus 😏",
          message: `${accuracyText} Feels like laptop cardio, not the real thing. Grab your phone, get outside, and try again — GPS needs sky, not WiFi.`,
        })
      }
      return
    }
    await attemptSave(result)
  }

  function handleDiscardPending() {
    clearPendingRun()
    setSaveError(null)
  }

  return (
    <div className="track-run-panel">
      {status === 'permission-denied' && (
        <div className="banner error">
          Location access was denied. Enable location permissions for this site
          in your browser settings and try again.
        </div>
      )}
      {status === 'unsupported' && (
        <div className="banner error">
          Your browser doesn&apos;t support GPS tracking.
        </div>
      )}
      {status === 'error' && (
        <div className="banner error">
          Could not get your location. Please try again.
        </div>
      )}
      {saveError && (
        <div className="track-run-error">
          <span className="track-run-error-badge">
            <FaExclamation />
          </span>
          <div>
            <p className="track-run-error-title">{saveError.title}</p>
            <p className="track-run-error-message">{saveError.message}</p>
            {saveError.offerForceSave && pendingRun && (
              <div className="track-run-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleDiscardPending}
                  disabled={saving}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => attemptSave(pendingRun, { force: true })}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Anyway'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tracking &&
        vehicleState === VehicleState.SUSPECT &&
        !suspectDismissed && (
          <div className="banner error track-run-gap-banner">
            <span>
              Moving fast — are you in a vehicle?{' '}
              {vehicleReason === 'no-gait'
                ? "You're covering ground fast with no running stride detected."
                : vehicleReason === 'pattern'
                  ? 'That pace has been suspiciously steady for a human stride.'
                  : "That's a faster sustained pace than running allows."}
            </span>
            <button type="button" onClick={dismissSuspect} aria-label="Dismiss">
              <FaTimes />
            </button>
          </div>
        )}

      {tracking && vehicleState === VehicleState.VEHICLE && (
        <div className="track-run-error">
          <span className="track-run-error-badge">
            <FaExclamation />
          </span>
          <div>
            <p className="track-run-error-title">Vehicle detected 🛵</p>
            <p className="track-run-error-message">
              Distance paused — it won&apos;t count until you slow down to a
              run. Not in a vehicle?
            </p>
            <button
              type="button"
              className="btn btn-outline"
              onClick={disputeVehicle}
            >
              I&apos;m not in a vehicle
            </button>
          </div>
        </div>
      )}

      {backgroundGapSeconds != null && (
        <div className="banner error track-run-gap-banner">
          <span>
            Your screen was off for about {formatDuration(backgroundGapSeconds)}{' '}
            — GPS tracking may have paused, so the route or distance could be
            missing that section.
          </span>
          <button
            type="button"
            onClick={dismissBackgroundGap}
            aria-label="Dismiss"
          >
            <FaTimes />
          </button>
        </div>
      )}

      {pendingRun ? (
        <p className="track-run-hint">
          This run finished but hasn&apos;t been saved yet — it&apos;s kept on
          this device until it is.
        </p>
      ) : (
        <p className="track-run-hint">
          Keep your screen on during the run — locking it may pause GPS
          tracking.
        </p>
      )}

      <dl className="track-run-stats glass-card">
        <div>
          <dt>Time</dt>
          <dd>{formatDuration(elapsedSeconds)}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{formatDistance(distance)}</dd>
        </div>
        <div>
          <dt>Pace</dt>
          <dd>{formatPace(displayPace)}</dd>
        </div>
      </dl>

      <div className="track-run-actions">
        {tracking ? (
          confirmingStop ? (
            <>
              <p className="track-run-confirm-text">
                Stop this run? Your time and route will be saved.
              </p>
              <div className="track-run-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setConfirmingStop(false)}
                  disabled={saving}
                >
                  Keep Running
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmStop}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Yes, Stop'}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setConfirmingStop(true)}
            >
              Stop Run
            </button>
          )
        ) : pendingRun ? (
          <>
            <p className="track-run-confirm-text">
              Your last run couldn&apos;t be saved. Retry now, or discard it?
            </p>
            <div className="track-run-confirm-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleDiscardPending}
                disabled={saving}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => attemptSave(pendingRun)}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Retry Save'}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="track-run-accessibility-toggle">
              <input
                type="checkbox"
                checked={accessibilityMode}
                onChange={(e) => {
                  setAccessibilityModeEnabled(e.target.checked)
                  setAccessibilityMode(e.target.checked)
                }}
              />
              I use a wheelchair or hand-cycle (raises speed limits, skips
              stride detection)
            </label>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => start(eventId)}
              disabled={saving || !eventId}
            >
              Start Run
            </button>
          </>
        )}
      </div>

      {debugEnabled && tracking && (
        <VehicleDebugOverlay
          getDebugInfo={getDebugInfo}
          vehicleState={vehicleState}
        />
      )}
    </div>
  )
}
