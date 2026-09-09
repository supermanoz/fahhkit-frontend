/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { FaCrosshairs } from 'react-icons/fa'
import {
  VIEW_RADIUS_METERS,
  boundsForRadius,
  formatArea,
} from '../utils/territoryGame'
import playerAvatarImage from '../assets/images/player-avatar.svg'
import 'leaflet/dist/leaflet.css'
import './TerritoryMap.css'

// A pulsing GPS "radar" dot instead of a plain pin — the single most
// recognizable piece of Pokémon GO's map, and the thing that sells "you are
// standing in this game world" better than any tile styling can. Always
// visible (not just mid-run), since the game should show where you are the
// instant it opens. The avatar art here is a placeholder for testing;
// production art would replace this one image.
const playerMarkerIcon = L.divIcon({
  className: 'territory-map-player-icon',
  html:
    '<span class="territory-map-player-pulse"></span>' +
    '<span class="territory-map-player-pulse territory-map-player-pulse-b"></span>' +
    `<img class="territory-map-player-avatar" src="${playerAvatarImage}" alt="" />`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

// Territories read as Pokémon GO gyms: just a colored, ink-outlined badge
// planted at the centroid — no name floating on the map. Tapping it still
// reveals who holds it via a popup, so the information isn't lost, just not
// cluttering the default view.
function territoryBadgeIcon(t) {
  const isPlayer = t.ownerId === 'player'
  const emoji = isPlayer ? '👑' : '🚩'
  return L.divIcon({
    className: 'territory-badge-icon',
    html: `<div class="territory-badge" style="background:${t.color}">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function polygonCentroid(points) {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length
  return [lat, lng]
}

function toLatLngs(points) {
  return points.map((p) => [p.lat, p.lng])
}

// The map mounts inside a flex/grid layout that's still settling (fonts,
// the HUD card, the controls panel below it), so Leaflet can measure its
// container before that layout finishes and lock in the wrong size —
// leaving tiles rendered into only part of the visible box until the
// window is manually resized. Re-measuring once after mount fixes it.
function InvalidateSizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(t)
  }, [map])
  return null
}

function ClickCapture({ enabled, onMapClick }) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// The map stays flat/top-down by default — it only tilts back briefly
// while a zoom is actually in progress (pinch, scroll-wheel, +/- buttons,
// or double-click), settling back flat the instant it ends. Kept as a
// transient effect rather than a permanent tilt: a permanent 3D tilt needs
// its own perspective-correcting click math to keep tap-to-draw accurate,
// which isn't worth the complexity for something that's only ever on
// screen for the ~300ms of a zoom animation.
function ZoomTiltEffect({ tiltRef }) {
  useMapEvents({
    zoomstart() {
      tiltRef.current?.classList.add('is-zooming')
    },
    zoomend() {
      tiltRef.current?.classList.remove('is-zooming')
    },
  })
  return null
}

// Fences the view to a patch of world around the player instead of the
// whole map — hard-stops panning at the edge of the radius and refuses to
// zoom out past it, the way Pokémon GO keeps you tethered to where you
// actually are rather than free-roaming the map from your couch.
function ViewRadiusLimiter({ center }) {
  const map = useMap()
  useEffect(() => {
    const bounds = boundsForRadius(center, VIEW_RADIUS_METERS)
    map.setMaxBounds(bounds)
    map.setMinZoom(16)
    map.setMaxZoom(19)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center.lat, center.lng])
  return null
}

// Floating "locate me" FAB, styled after Pokémon GO's compass button —
// stopping propagation keeps a click from also registering as a
// tap-to-draw point on the map underneath it.
function LocateButton() {
  const map = useMap()

  function handleClick(e) {
    e.stopPropagation()
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition((position) => {
      map.flyTo(
        [position.coords.latitude, position.coords.longitude],
        Math.max(map.getZoom(), 17)
      )
    })
  }

  return (
    <button
      type="button"
      className="territory-map-locate"
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label="Recenter on my location"
    >
      <FaCrosshairs />
    </button>
  )
}

// Pokémon GO has no visible zoom buttons at all (pinch/scroll only) — but a
// mouse-and-trackpad desktop audience benefits from an explicit control, so
// this keeps one, just restyled as a chunky ink-outlined game piece instead
// of Leaflet's flat default.
function ZoomControls() {
  const map = useMap()
  return (
    <div className="territory-map-zoom">
      <button
        type="button"
        aria-label="Zoom in"
        onClick={(e) => {
          e.stopPropagation()
          map.zoomIn()
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        onClick={(e) => {
          e.stopPropagation()
          map.zoomOut()
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        −
      </button>
    </div>
  )
}

export default function TerritoryMap({
  center,
  playerLocation,
  territories,
  livePath,
  manualMode,
  onMapClick,
}) {
  const showPreview = livePath.length >= 3
  const tiltRef = useRef(null)

  return (
    <div className="territory-map">
      <div className="territory-map-tilt" ref={tiltRef}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={17}
          scrollWheelZoom
          zoomControl={false}
          maxBoundsViscosity={1}
        >
          <TileLayer
            className="territory-map-tiles"
            attribution="Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin, USGS, NGA, EPA, NRCan"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          />

          {territories.map((t) => {
            const isPlayer = t.ownerId === 'player'
            return (
              <Polygon
                key={t.id}
                positions={toLatLngs(t.points)}
                pathOptions={{
                  color: '#2B2140',
                  weight: 3,
                  fillColor: t.color,
                  fillOpacity: isPlayer ? 0.5 : 0.35,
                  className: isPlayer ? 'territory-poly-player' : undefined,
                }}
              />
            )
          })}

          {territories.map((t) => (
            <Marker
              key={`${t.id}-badge`}
              position={polygonCentroid(t.points)}
              icon={territoryBadgeIcon(t)}
            >
              <Popup>
                <strong>
                  {t.ownerId === 'player' ? t.ownerName || 'You' : t.ownerName}
                </strong>
                <br />
                {formatArea(t.area)}
              </Popup>
            </Marker>
          ))}

          {livePath.length > 0 && (
            <Polyline
              positions={toLatLngs(livePath)}
              pathOptions={{ color: '#E63946', weight: 4 }}
            />
          )}

          {showPreview && (
            <Polygon
              positions={toLatLngs(livePath)}
              pathOptions={{
                color: '#FFC94D',
                weight: 2,
                dashArray: '6 8',
                fillColor: '#FFC94D',
                fillOpacity: 0.15,
              }}
            />
          )}

          {playerLocation && (
            <Marker
              position={[playerLocation.lat, playerLocation.lng]}
              icon={playerMarkerIcon}
              zIndexOffset={1000}
            />
          )}

          <ClickCapture enabled={manualMode} onMapClick={onMapClick} />
          <InvalidateSizeOnMount />
          <ViewRadiusLimiter center={center} />
          <ZoomTiltEffect tiltRef={tiltRef} />
          <LocateButton />
          <ZoomControls />
        </MapContainer>
      </div>
      <div className="territory-map-vignette" aria-hidden="true" />
    </div>
  )
}
