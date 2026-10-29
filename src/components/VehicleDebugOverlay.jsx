/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import './VehicleDebugOverlay.css'

const POLL_MS = 500

// Live speed/cadence/state readout for the vehicle-detection state machine -
// hidden behind the `?debug=anticheat` flag (see utils/antiCheatSettings.js),
// so it can be checked on a real phone during a walk/run/bike/drive test
// without needing a laptop dev server. `getDebugInfo` is
// useRunTracker().getDebugInfo, polled rather than passed as live state so
// this doesn't force a re-render of the whole panel on every GPS fix.
export default function VehicleDebugOverlay({ getDebugInfo, vehicleState }) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setInfo(getDebugInfo()), POLL_MS)
    return () => clearInterval(id)
  }, [getDebugInfo])

  return (
    <div className={`vehicle-debug-overlay vehicle-debug-${vehicleState}`}>
      <p className="vehicle-debug-state">{vehicleState.toUpperCase()}</p>
      <dl>
        <div>
          <dt>Speed</dt>
          <dd>
            {info?.speedMps != null ? `${info.speedMps.toFixed(1)} m/s` : '--'}
          </dd>
        </div>
        <div>
          <dt>Avg (12s)</dt>
          <dd>
            {info?.avgSpeedMps != null
              ? `${info.avgSpeedMps.toFixed(1)} m/s`
              : '--'}
          </dd>
        </div>
        <div>
          <dt>Cadence</dt>
          <dd>
            {info?.cadenceHz != null ? `${info.cadenceHz.toFixed(1)} Hz` : '--'}
          </dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{info?.reason || '--'}</dd>
        </div>
      </dl>
    </div>
  )
}
