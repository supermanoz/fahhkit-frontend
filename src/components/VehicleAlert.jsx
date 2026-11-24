/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { visibleInterval } from '../utils/visibleInterval'
import { useEffect, useState } from 'react'
import { VehicleState } from '../utils/vehicleDetection'
import './VehicleAlert.css'

export const VEHICLE_WARNING_COPY =
  'You seem to be in a vehicle. Slow down or this run will be discarded.'
export const VEHICLE_DISCARDED_TITLE = 'Run discarded: vehicle detected'
export const VEHICLE_DISCARDED_COPY =
  "Looks like you were riding, not running, so that run didn't count - no XP, no territory. Lace up and go again."

function useSecondsLeft(deadline) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline == null) return undefined
    return visibleInterval(() => setNow(Date.now()), 500, 'vehicle-alert')
  }, [deadline])
  if (deadline == null) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

// The vehicle warning banner (with a live countdown) while a run is being
// tracked, plus the "Run discarded" card once the warning ran out. Used by
// the game's run view and the standalone track-run panel.
export default function VehicleAlert({
  vehicleState,
  warningDeadline,
  discarded,
  onDismissDiscard,
}) {
  const secondsLeft = useSecondsLeft(warningDeadline)
  return (
    <>
      {vehicleState === VehicleState.VEHICLE && (
        <div
          className="vehicle-alert-banner"
          role="alert"
          aria-live="assertive"
          data-testid="vehicle-warning"
        >
          <span className="vehicle-alert-icon" aria-hidden="true">
            !
          </span>
          <div className="vehicle-alert-text">
            <strong>Vehicle detected</strong>
            <span>{VEHICLE_WARNING_COPY}</span>
            {secondsLeft != null && (
              <span className="vehicle-alert-countdown">
                Discarding in {secondsLeft}s
              </span>
            )}
          </div>
        </div>
      )}
      {discarded && (
        <div className="vehicle-alert-backdrop">
          <div
            className="vehicle-alert-card"
            role="alertdialog"
            aria-live="assertive"
            aria-labelledby="vehicle-discarded-title"
            data-testid="vehicle-discarded"
          >
            <span className="vehicle-alert-icon" aria-hidden="true">
              ✕
            </span>
            <h3 id="vehicle-discarded-title">{VEHICLE_DISCARDED_TITLE}</h3>
            <p>{VEHICLE_DISCARDED_COPY}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onDismissDiscard}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
