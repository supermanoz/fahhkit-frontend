/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useMemo } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MapAttribution from './MapAttribution'
import './RunMap.css'

// Plain CSS dots instead of leaflet's default marker images, which 404 under
// Vite unless the icon URLs are manually reconfigured.
const startIcon = L.divIcon({
  className: 'run-map-marker run-map-marker-start',
  iconSize: [16, 16],
})
const endIcon = L.divIcon({
  className: 'run-map-marker run-map-marker-end',
  iconSize: [16, 16],
})

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [32, 32] })
    } else if (positions.length === 1) {
      map.setView(positions[0], 16)
    }
  }, [map, positions])
  return null
}

export default function RunMap({ points }) {
  const positions = useMemo(
    () => (points || []).map((p) => [p.lat, p.lng]),
    [points]
  )

  if (positions.length === 0) {
    return (
      <div className="run-map run-map-empty">No route data for this run.</div>
    )
  }

  return (
    <div className="run-map">
      <MapContainer
        center={positions[0]}
        zoom={15}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={positions}
          pathOptions={{ color: '#e8590c', weight: 4 }}
        />
        <Marker position={positions[0]} icon={startIcon} />
        <Marker position={positions[positions.length - 1]} icon={endIcon} />
        <FitBounds positions={positions} />
      </MapContainer>
      {/* Leaflet's own attribution control is disabled above (its "Leaflet"
          prefix is this library's own credit, not a tile-provider
          requirement - dropped the same way L.control.attribution({
          prefix: false }) would) - this renders the TileLayer's actual
          required credit instead, collapsed behind a small "i" rather
          than a permanent text strip. */}
      <MapAttribution className="run-map-attribution-anchor">
        &copy;{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{' '}
        contributors
      </MapAttribution>
    </div>
  )
}
