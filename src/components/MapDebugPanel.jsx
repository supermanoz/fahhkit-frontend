/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { gpsFeedStats } from '../utils/gpsFeed'

// Hidden diagnostics for the heading-up map (see utils/mapDebug.js for how it
// is switched on). Reads a snapshot twice a second; nothing runs when off.
const n = (v, d = 0, unit = '') =>
  v == null || Number.isNaN(v) ? '-' : `${Number(v).toFixed(d)}${unit}`

export default function MapDebugPanel({ debugRef }) {
  const [snap, setSnap] = useState(null)
  useEffect(() => {
    const read = () => {
      const d = debugRef.current?.() || null
      setSnap(d ? { ...d, feed: gpsFeedStats() } : null)
    }
    read()
    const id = setInterval(read, 500)
    return () => clearInterval(id)
  }, [debugRef])

  const feed = snap?.feed
  const rv = snap?.runView
  const rows = snap
    ? [
        [
          'view',
          rv
            ? `${rv.mode === 'run' ? 'RUN' : 'IDLE'} (${(rv.inStateMs / 1000).toFixed(1)} s)`
            : '-',
        ],
        ['last switch', rv?.reason || '-'],
        ['raw course', n(feed?.last?.heading, 0, '°'), 'plugin heading'],
        ['raw speed', n(feed?.last?.speed, 2, ' m/s')],
        ['accuracy', n(feed?.last?.accuracy, 0, ' m')],
        [
          'fixes',
          `${feed?.total ?? 0} (speed ${feed?.withSpeed ?? 0}, course ${feed?.withCourse ?? 0})`,
        ],
        ['plugin gave heading', feed?.withCourse > 0 ? 'yes' : 'NO'],
        ['travel bearing', n(snap.travel, 0, '°')],
        ['used', snap.candidateFrom || '-'],
        ['compass', n(snap.compass, 0, '°')],
        ['filtered', n(snap.smoothed, 0, '°')],
        ['target', n(snap.target, 0, '°')],
        ['map bearing', n(snap.mapBearing, 0, '°')],
        [
          'speed used',
          `${n(snap.speed, 2, ' m/s')} (${snap.speedSource || '-'})`,
        ],
        ['moving', snap.moving ? 'yes' : 'no'],
      ]
    : []
  return (
    <div
      className="territory-map-debug"
      data-testid="map-debug"
      aria-hidden="true"
    >
      <b>
        TEST MODE (walking = running) · rotation: {snap?.rotation || '-'}
        {snap?.native ? ' (native)' : ' (web)'}
      </b>
      <div className="territory-map-debug-why">{snap?.why || ''}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="territory-map-debug-row">
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  )
}
