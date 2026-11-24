/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { histogramLabels } from '../utils/distanceFilter'
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
        {/* Distance-filter calibration: raw path length vs what is credited. */}
        <div>
          <dt>Raw path</dt>
          <dd>
            {info?.distance ? `${Math.round(info.distance.rawMeters)} m` : '--'}
          </dd>
        </div>
        <div>
          <dt>Counted</dt>
          <dd>
            {info?.distance
              ? `${Math.round(info.distance.countedMeters)} m (${info.distance.state})`
              : '--'}
          </dd>
        </div>
        <div>
          <dt>Drift dropped</dt>
          <dd>{info?.distance ? info.distance.driftDrops : '--'}</dd>
        </div>
        <div>
          <dt>Accuracy (m)</dt>
          <dd>
            {info?.distance
              ? histogramLabels()
                  .map((label, i) => `${label}:${info.distance.histogram[i]}`)
                  .join(' ')
              : '--'}
          </dd>
        </div>
      </dl>
    </div>
  )
}
