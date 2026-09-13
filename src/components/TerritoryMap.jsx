/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { setWorkerUrl } from 'maplibre-gl'
import '@maplibre/maplibre-gl-leaflet'
import { FaCrosshairs } from 'react-icons/fa'

// maplibre-gl resolves its worker script relative to wherever Vite's
// production build happens to place its own chunk, and that chunk isn't
// next to the worker file it needs (nor the "maplibre-gl-shared.mjs"
// helper the worker itself imports) — every request 404s and, since
// Netlify's SPA rewrite catches the missing path, comes back as text/html
// instead of a real 404, so the basemap silently never renders, leaving
// just the polygons/markers on a blank background. The vite.config.js
// `copyMaplibreWorker` plugin copies both files verbatim into
// public/mlgl (so their relative import of each other still resolves) —
// this just has to point maplibre-gl at the copy before it creates one.
setWorkerUrl(`${import.meta.env.BASE_URL}mlgl/maplibre-gl-worker.mjs`)
import { formatArea } from '../utils/territoryGame'
import defaultAvatarImage from '../assets/images/player-avatar-specter.png'
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
// instant it opens. Uses the athlete's real profile picture when set (the
// backend's cosmetics are borders/colors layered on that photo, not a
// separate avatar character — see the Shop tab) and falls back to a
// generic placeholder icon otherwise.
function buildPlayerMarkerIcon(avatarSrc) {
  return L.divIcon({
    className: 'territory-map-player-icon',
    html:
      '<span class="territory-map-player-pulse"></span>' +
      '<span class="territory-map-player-pulse territory-map-player-pulse-b"></span>' +
      `<img class="territory-map-player-avatar" src="${avatarSrc}" alt="" />`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

// Territories read as Pokémon GO gyms: just a colored, ink-outlined badge
// planted at the centroid — no name floating on the map. Tapping it still
// reveals who holds it via a popup, so the information isn't lost, just not
// cluttering the default view.
function territoryBadgeIcon(t, isMine) {
  const emoji = isMine ? '👑' : '🚩'
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

// Flies the map to whichever owner's parcels the player tapped in the
// leaderboard. Depends only on highlightOwnerId (not the territories array
// itself, which gets a new reference on every render) so it doesn't refly
// mid-run every time the parcel list refreshes for an unrelated reason.
function FocusHighlight({ highlightOwnerId, territories }) {
  const map = useMap()
  useEffect(() => {
    if (!highlightOwnerId) return
    const matches = territories.filter((t) => t.ownerId === highlightOwnerId)
    if (matches.length === 0) return
    const bounds = L.latLngBounds(matches.flatMap((t) => toLatLngs(t.points)))
    map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 19 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, highlightOwnerId])
  return null
}

// TEMP: admin-only tap-to-draw (see GamePage.jsx). Registers a plain
// Leaflet click handler rather than anything territory-specific, so it can
// go away with a one-line deletion once real device testing replaces it.
function ClickCapture({ enabled, onMapClick }) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// Zoom level (the max of the 16-19 range ZoomRangeLimiter allows) at which
// the map settles into its tilted "close-up" view, Google Maps/Pokémon GO
// style — only at the very last zoom step (scrolled or pinched all the way
// in), not partway through zooming closer.
const CLOSE_IN_TILT_ZOOM = 19

// The map stays flat/top-down until the player zooms in close, at which
// point it settles into a standing 3D tilt (rather than just a brief
// flourish mid-zoom) so building-3d extrusions in the basemap actually read
// as buildings instead of flat footprints. Forced back flat whenever
// manualMode is on: this is a CSS transform on the whole map, not a real
// perspective camera, so Leaflet's own click-to-latlng math (used by
// ClickCapture for tap-to-draw) only stays accurate while flat.
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

// Keeps zoom within a sane range (close enough to read the map, not so far
// out it's the whole city) without fencing where the player can pan to —
// the map view itself is free to explore now, unlike the pan-locked-to-a-
// radius behavior this used to also do.
function ZoomRangeLimiter() {
  const map = useMap()
  useEffect(() => {
    map.setMinZoom(16)
    map.setMaxZoom(19)
  }, [map])
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

// Floating "locate me" FAB, styled after Pokémon GO's compass button.
// Rendered as a sibling of the tilted map div (not a MapContainer child) so
// the persistent close-in tilt (see ZoomTiltEffect) never warps it.
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
  currentUserId,
  highlightOwnerId,
  avatarSrc,
  manualMode,
  onMapClick,
}) {
  const showPreview = livePath.length >= 3
  const tiltRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)
  const playerMarkerIcon = useMemo(
    () => buildPlayerMarkerIcon(avatarSrc || defaultAvatarImage),
    [avatarSrc]
  )

  return (
    <div className="territory-map">
      <div className="territory-map-tilt" ref={tiltRef}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={17}
          scrollWheelZoom
          zoomControl={false}
        >
          <PokemonStyleBaseLayer />

          {territories.map((t) => {
            const isMine = Boolean(currentUserId) && t.ownerId === currentUserId
            const isHighlighted = highlightOwnerId === t.ownerId
            return (
              <Polygon
                key={t.id}
                positions={toLatLngs(t.points)}
                pathOptions={{
                  color: isHighlighted ? '#FFFFFF' : '#2B2140',
                  weight: isHighlighted ? 4 : 3,
                  fillColor: t.color,
                  fillOpacity: isHighlighted ? 0.65 : isMine ? 0.5 : 0.35,
                  className: isHighlighted
                    ? 'territory-poly-highlight'
                    : isMine
                      ? 'territory-poly-player'
                      : undefined,
                }}
              />
            )
          })}

          {territories.map((t) => {
            const isMine = Boolean(currentUserId) && t.ownerId === currentUserId
            return (
              <Marker
                key={`${t.id}-badge`}
                position={polygonCentroid(t.points)}
                icon={territoryBadgeIcon(t, isMine)}
              >
                <Popup>
                  <strong>{isMine ? 'You' : t.ownerName}</strong>
                  <br />
                  {formatArea(t.area)}
                </Popup>
              </Marker>
            )
          })}

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
              interactive={false}
            />
          )}

          <FocusHighlight
            highlightOwnerId={highlightOwnerId}
            territories={territories}
          />
          <ClickCapture enabled={Boolean(manualMode)} onMapClick={onMapClick} />
          <InvalidateSizeOnMount />
          <ZoomRangeLimiter />
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
