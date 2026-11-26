/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { Modal } from '../game/ui/Panel'
import GameButton from './ui/GameButton'
import { calculatePaceMinPerKm, formatDuration, formatPace } from '../utils/run'
import {
  formatKmInput,
  parseKmInput,
  validateIndoorRun,
} from '../utils/indoorRun'
import { stepsNeedSettings } from '../utils/stepsPermission'
import './IndoorRunScreen.css'

// Indoor (treadmill) Training, full screen: no map, no GPS. While running -
// the big timer, steps, estimated distance and pace. After End - the confirm
// screen, where the distance is edited to match the treadmill display.
export default function IndoorRunScreen({
  run, // the useIndoorRun() object
  onSubmit, // (finishResult) => void - receives { ok, run } to hand to the submit flow
  onOpenSettings,
  busy = false,
  serverError = null,
}) {
  const confirming = run.status === 'confirm'
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [errors, setErrors] = useState([])

  // Prefill once when the confirm screen opens (pedometer distance, or steps
  // x stride); the player overwrites it.
  const prefill = run.estimate ? formatKmInput(run.estimate.meters) : ''
  useEffect(() => {
    if (confirming) {
      setText(prefill)
      setTouched(false)
      setErrors([])
    }
  }, [confirming]) // eslint-disable-line react-hooks/exhaustive-deps

  const meters = confirming
    ? parseKmInput(text)
    : (run.estimate?.meters ?? null)
  const pace =
    meters && run.durationSeconds >= 30
      ? calculatePaceMinPerKm(meters, run.durationSeconds)
      : null
  const needsSettings = stepsNeedSettings(run.pedometerStatus)

  function submit() {
    setTouched(true)
    const result = run.finish(meters)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    onSubmit(result)
  }

  // Live feedback once the player has edited / tried to save.
  const liveErrors = touched
    ? validateIndoorRun({
        distanceMeters: meters,
        durationSeconds: run.durationSeconds,
        steps: run.steps,
      }).errors
    : []
  const shownErrors = errors.length
    ? liveErrors.length
      ? liveErrors
      : errors
    : liveErrors

  return (
    <div
      className="indoor-screen"
      role="dialog"
      aria-modal="true"
      aria-label={confirming ? 'Confirm your run' : 'Indoor run'}
    >
      <div className="indoor-card">
        <div className="indoor-head">
          <span className="indoor-badge">Indoor · Training</span>
          {run.paused && <span className="indoor-paused">Paused</span>}
        </div>

        <div className="indoor-timer" aria-live="off">
          {formatDuration(run.durationSeconds)}
        </div>
        <div className="indoor-timer-label">
          {confirming ? 'Total time' : 'Time'}
        </div>

        <div className="indoor-stats">
          <div className="indoor-stat">
            <span className="indoor-stat-value" data-testid="indoor-steps">
              {run.steps != null ? run.steps.toLocaleString('en-US') : '-'}
            </span>
            <span className="indoor-stat-label">Steps</span>
          </div>
          <div className="indoor-stat">
            <span className="indoor-stat-value" data-testid="indoor-distance">
              {meters ? (meters / 1000).toFixed(2) : '-'}
            </span>
            <span className="indoor-stat-label">
              {confirming ? 'km' : 'km (est.)'}
            </span>
          </div>
          <div className="indoor-stat">
            <span className="indoor-stat-value">
              {formatPace(pace).replace(' /km', '')}
            </span>
            <span className="indoor-stat-label">min/km</span>
          </div>
        </div>

        {needsSettings && (
          <div className="indoor-note" role="status">
            Step counting is off, so distance can&rsquo;t be estimated.
            <button
              type="button"
              className="indoor-link"
              onClick={onOpenSettings}
            >
              Open Settings
            </button>
          </div>
        )}
        {!confirming && !run.estimate && !needsSettings && (
          <div className="indoor-note" role="status">
            No step data - you&rsquo;ll enter the treadmill distance when you
            finish.
          </div>
        )}

        {confirming ? (
          <div className="indoor-confirm">
            <label className="indoor-field" htmlFor="indoor-distance-input">
              Distance on the treadmill (km)
            </label>
            <input
              id="indoor-distance-input"
              className="indoor-input"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              placeholder="e.g. 5.00"
              onChange={(e) => {
                setText(e.target.value)
                setTouched(true)
              }}
              aria-invalid={shownErrors.length > 0}
            />
            <p className="indoor-hint">
              {run.estimate
                ? `Estimated from your ${
                    run.estimate.source === 'pedometer' ? 'pedometer' : 'steps'
                  } - change it to match the treadmill display.`
                : 'Copy the distance from the treadmill display.'}
            </p>
            {shownErrors.map((e) => (
              <p key={e.code} className="indoor-error" role="alert">
                {e.message}
              </p>
            ))}
            {serverError && (
              <p className="indoor-error" role="alert">
                {serverError}
              </p>
            )}
          </div>
        ) : null}

        <div className="indoor-actions">
          {confirming ? (
            <>
              <GameButton
                variant="primary"
                size="compact"
                className="indoor-btn"
                loading={busy}
                onClick={submit}
              >
                Save run
              </GameButton>
              <GameButton
                variant="accent"
                size="compact"
                className="indoor-btn"
                disabled={busy}
                onClick={run.resumeFromConfirm}
              >
                Keep running
              </GameButton>
            </>
          ) : (
            <>
              {run.paused ? (
                <GameButton
                  variant="accent"
                  size="compact"
                  className="indoor-btn"
                  onClick={run.resume}
                >
                  Resume
                </GameButton>
              ) : (
                <GameButton
                  variant="accent"
                  size="compact"
                  className="indoor-btn"
                  onClick={run.pause}
                >
                  Pause
                </GameButton>
              )}
              <GameButton
                variant="primary"
                size="compact"
                className="indoor-btn"
                onClick={run.end}
              >
                End
              </GameButton>
            </>
          )}
          <GameButton
            variant="danger"
            size="compact"
            className="indoor-btn"
            disabled={busy}
            onClick={() => setConfirmDiscard(true)}
          >
            Discard
          </GameButton>
        </div>
      </div>

      {confirmDiscard && (
        <Modal
          title="Discard this run?"
          onClose={() => setConfirmDiscard(false)}
        >
          <p className="training-start-copy">
            Nothing will be saved - no XP, no history.
          </p>
          <div className="training-start-actions">
            <GameButton
              variant="danger"
              fullWidth
              onClick={() => {
                setConfirmDiscard(false)
                run.discard()
              }}
            >
              Discard run
            </GameButton>
            <GameButton
              variant="neutral"
              fullWidth
              onClick={() => setConfirmDiscard(false)}
            >
              Keep it
            </GameButton>
          </div>
        </Modal>
      )}
    </div>
  )
}
