/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  Polygon,
  Polyline,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import '@maplibre/maplibre-gl-leaflet'
import { FaCrosshairs } from 'react-icons/fa'
import {
  VIEW_RADIUS_METERS,
  boundsForRadius,
  formatArea,
} from '../utils/territoryGame'
import playerAvatarImage from '../assets/images/player-avatar.svg'
import 'leaflet/dist/leaflet.css'
import './TerritoryMap.css'

// A free, keyless vector basemap (OpenFreeMap) instead of a raster tile
// provider — lets us drop every text/icon label ourselves (see
// hideSymbolLayers below) rather than hoping a provider ships a
// "no labels" raster variant with global coverage. "Liberty" carries real
// road/park/water color (unlike the grayscale-leaning "Positron" style),
// which is what actually reads as Pokémon GO's saturated terrain once the
// filter in TerritoryMap.css punches it up further.
const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// OpenMapTiles-schema styles put every label AND every POI icon on "symbol"
// type layers — hiding just that one layer type strips all text/pins while
// leaving roads, water, parks, and building footprints untouched.
function hideSymbolLayers(glMap) {
  const style = glMap.getStyle()
  if (!style) return
  for (const layer of style.layers) {
    if (layer.type === 'symbol') {
      glMap.setLayoutProperty(layer.id, 'visibility', 'none')
    }
  }
}

// Renders the vector basemap via MapLibre GL (through the maplibre-gl-leaflet
// bridge) so it lives in the same tile pane a raster TileLayer would have
// used, underneath all the Polygon/Marker overlays below.
function PokemonStyleBaseLayer() {
  const map = useMap()

  useEffect(() => {
    const glLayer = L.maplibreGL({
      style: BASEMAP_STYLE_URL,
      className: 'territory-map-tiles',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const glMap = glLayer.getMaplibreMap()
    glMap.on('styledata', () => hideSymbolLayers(glMap))
    hideSymbolLayers(glMap)

    return () => {
      map.removeLayer(glLayer)
    }
  }, [map])

  return null
}

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

// Zoom level (out of the 16-19 range ViewRadiusLimiter allows) at which the
// map settles into its tilted "close-up" view, Google Maps/Pokémon GO style.
const CLOSE_IN_TILT_ZOOM = 18

// The map stays flat/top-down until the player zooms in close, at which
// point it settles into a standing 3D tilt (rather than just a brief
// flourish mid-zoom) so building-3d extrusions in the basemap actually read
// as buildings instead of flat footprints. It's forced back flat whenever
// manualMode is on, though: this is a CSS transform on the whole map (see
// .territory-map-tilt), not a real perspective camera, so Leaflet's own
// click-to-latlng math (used by ClickCapture for tap-to-draw) only stays
// accurate while flat — a permanent tilt during drawing would place taps
// somewhere other than where the player visually tapped.
function ZoomTiltEffect({ tiltRef, manualMode }) {
  const map = useMapEvents({
    zoomstart() {
      tiltRef.current?.classList.add('is-zooming')
    },
    zoomend() {
      tiltRef.current?.classList.remove('is-zooming')
    },
    zoom() {
      syncCloseInTilt()
    },
  })

  function syncCloseInTilt() {
    const closeIn = map.getZoom() >= CLOSE_IN_TILT_ZOOM && !manualMode
    tiltRef.current?.classList.toggle('is-close-in', closeIn)
  }

  useEffect(() => {
    syncCloseInTilt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode])

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

// Captures the Leaflet map instance for controls that render outside
// MapContainer (see LocateButton/ZoomControls below) and so can't reach it
// via useMap() themselves.
function CaptureMapInstance({ onReady }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

// Floating "locate me" FAB, styled after Pokémon GO's compass button —
// stopping propagation keeps a click from also registering as a
// tap-to-draw point on the map underneath it. Rendered as a sibling of the
// tilted map div (not a MapContainer child) so the persistent close-in tilt
// (see ZoomTiltEffect) never warps it.
function locateErrorMessage(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission denied — enable it in your browser settings.'
  }
  if (error.code === error.TIMEOUT) {
    return 'Timed out finding your location. Try again.'
  }
  return 'Could not find your location right now.'
}

function LocateButton({ map }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!error) return
    const timeout = setTimeout(() => setError(null), 4500)
    return () => clearTimeout(timeout)
  }, [error])

  function handleClick(e) {
    e.stopPropagation()
    if (!('geolocation' in navigator)) {
      setError('Location is not supported on this device.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setError(null)
        map.flyTo(
          [position.coords.latitude, position.coords.longitude],
          Math.max(map.getZoom(), 17)
        )
      },
      // A permission denial or an insecure (non-HTTPS, non-localhost) origin
      // means the success callback never fires - without visible feedback
      // here the button just looks completely unresponsive to the player.
      (err) => {
        console.warn('Locate button: geolocation failed', err)
        setError(locateErrorMessage(err))
      }
    )
  }

  return (
    <>
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
      {error && (
        <div
          className="territory-map-locate-error"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {error}
        </div>
      )}
    </>
  )
}

// Pokémon GO has no visible zoom buttons at all (pinch/scroll only) — but a
// mouse-and-trackpad desktop audience benefits from an explicit control, so
// this keeps one, just restyled as a chunky ink-outlined game piece instead
// of Leaflet's flat default. Rendered outside the tilted map div for the
// same reason as LocateButton above.
function ZoomControls({ map }) {
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
  const [mapInstance, setMapInstance] = useState(null)

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
          <PokemonStyleBaseLayer />

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
          <ZoomTiltEffect tiltRef={tiltRef} manualMode={manualMode} />
          <CaptureMapInstance onReady={setMapInstance} />
        </MapContainer>
      </div>
      <div className="territory-map-vignette" aria-hidden="true" />
      {mapInstance && (
        <>
          <LocateButton map={mapInstance} />
          <ZoomControls map={mapInstance} />
        </>
      )}
    </div>
  )
}
