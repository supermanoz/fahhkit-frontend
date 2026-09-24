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
import {
  PLAYER_COLOR,
  formatArea,
  mergeTouchingParcels,
} from '../utils/territoryGame'
import { resolveFileUrl } from '../api/client'
// Same fallback image GamePage.jsx uses (its own defaultAvatarImage) - this
// used to be a different local avatar (Wind), so a broken avatarSrc (e.g.
// the account's equipped Hero's assetUrl 404ing) showed one character on
// the map and a different one in the Me panel instead of matching.
import defaultAvatarImage from '../assets/images/player-avatar-blaze.png'
import blazeIdleSheet from '../assets/images/blaze-map-idle.png'
import blazeRunUpSheet from '../assets/images/blaze-map-run-up.png'
import blazeRunDownSheet from '../assets/images/blaze-map-run-down.png'
import blazeRunLeftSheet from '../assets/images/blaze-map-run-left.png'
import blazeRunRightSheet from '../assets/images/blaze-map-run-right.png'
import TapEffect from './TapEffect'
import 'leaflet/dist/leaflet.css'
import './TerritoryMap.css'

// A free, keyless vector basemap (OpenFreeMap) instead of a raster tile
// provider — lets us drop most text/icon labels ourselves, keeping only
// major place names (see hideSymbolLayers below), rather than hoping a
// provider ships a labels-optional raster variant with global coverage
// and the specific big-places-only cut we want. Fallback only - GamePage.jsx
// always passes mapStyleUrl (see constants/mapStyles.js, MAP_STYLES[0] is
// the actual default, currently "Positron").
const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

// OpenMapTiles-schema styles put every label AND every POI icon on "symbol"
// type layers — hiding just that one layer type strips all text/pins while
// leaving roads, water, parks, and building footprints untouched. A few of
// those layers are kept visible (see IMPORTANT_PLACE_LABEL_IDS) so named
// places still read on the map instead of it going label-free entirely.
//
// Ids come from the "liberty" style's place layers, one per class:
// label_country_{1,2,3}/label_state/label_city(_capital)/label_town/
// label_village for places that already get their own dedicated layer. The
// generic idea, from largest to smallest: keep anything that's a real,
// commonly-referred-to place name (a country/state/city/town/village, or —
// checked against OSM directly for e.g. Kathmandu's Maitidevi and
// Baneshwor, which both turned out to be place=neighbourhood/suburb — a
// named locality within a city), and only cut things too fine-grained or
// too rural to matter on a game map (hamlets, isolated dwellings, and the
// quarter/borough tags some cities double up with neighbourhood).
//
// This is specific to positron/liberty/bright (the only MAP_STYLES options
// - see constants/mapStyles.js). The night look is a CSS filter over one of
// those same three, not OpenFreeMap's own separate "dark" style, which
// uses a completely different layer-id/field schema and whose own layers
// reference a sprite image missing from its sprite sheet badly enough to
// stall the renderer - so there's no second schema to account for here.
const IMPORTANT_PLACE_LABEL_IDS = new Set([
  'label_city',
  'label_city_capital',
  'label_state',
  'label_country_3',
  'label_country_2',
  'label_country_1',
  'label_town',
  'label_village',
  'label_other',
])

// label_other is a catch-all for every place class without its own layer —
// suburb and neighbourhood (what Maitidevi/Baneshwor are tagged as) belong
// there, but so do hamlet, isolated_dwelling, and quarter, which are what
// this list is deliberately leaving out.
const LABEL_OTHER_ALLOWED_CLASSES = ['suburb', 'neighbourhood']

// OpenMapTiles' "name" field holds whatever the local OSM convention is -
// Devanagari script for places in Nepal (e.g. "काठमाडौं" for Kathmandu) -
// and these styles' default text-field expressions show that local name
// first. The game is English-facing, so every visible label is forced onto
// name:en (falling back to name:latin, then the raw name where neither
// translation exists) instead of whatever script the style would otherwise
// pick.
const LATIN_LABEL_TEXT_FIELD = [
  'coalesce',
  ['get', 'name:en'],
  ['get', 'name:latin'],
  ['get', 'name'],
]

function hideSymbolLayers(glMap) {
  const style = glMap.getStyle()
  if (!style) return
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue
    const visible = IMPORTANT_PLACE_LABEL_IDS.has(layer.id)
    glMap.setLayoutProperty(
      layer.id,
      'visibility',
      visible ? 'visible' : 'none'
    )
    if (visible && layer.layout?.['text-field']) {
      glMap.setLayoutProperty(layer.id, 'text-field', LATIN_LABEL_TEXT_FIELD)
    }
    if (layer.id === 'label_other' && visible) {
      glMap.setFilter('label_other', [
        'in',
        ['get', 'class'],
        ['literal', LABEL_OTHER_ALLOWED_CLASSES],
      ])
    }
  }
}

// Renders the vector basemap via MapLibre GL (through the maplibre-gl-leaflet
// bridge) so it lives in the same tile pane a raster TileLayer would have
// used, underneath all the Polygon/Marker overlays below.
function PokemonStyleBaseLayer({ styleUrl, onReady }) {
  const map = useMap()

  useEffect(() => {
    const glLayer = L.maplibreGL({
      style: styleUrl || BASEMAP_STYLE_URL,
      className: 'territory-map-tiles',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const glMap = glLayer.getMaplibreMap()
    glMap.on('styledata', () => hideSymbolLayers(glMap))
    hideSymbolLayers(glMap)
    // "idle" fires once every source has actually finished loading tiles -
    // the point at which the basemap visually looks complete, not just
    // "style applied." Gates GamePage's loading screen.
    glMap.once('idle', () => onReady?.())

    return () => {
      map.removeLayer(glLayer)
    }
    // Re-created (not just re-styled) on a style change - simplest way to
    // fully swap a maplibre-gl-leaflet layer without fighting its own
    // internal style-diffing. The real-world weather/time look is a CSS
    // filter driven from .territory-map (see --ambience-filter), so it
    // never forces a re-create.
  }, [map, styleUrl, onReady])

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
// avatarSrc is frequently a server-hosted URL (equipped Store Hero, or a
// profile picture) rather than one of the bundled local placeholders - if
// that request ever fails (server hiccup, an equipped item whose asset got
// deleted, a stale/expired URL), the <img> just renders broken with nothing
// else on the marker, which is what made the avatar appear to "vanish" after
// the game had been open a while. onerror falls back to a guaranteed-local
// bundled image and clears itself so it can't loop.
// heading is course-over-ground in degrees (0 = north, clockwise) - see
// bearingBetween in utils/territoryGame.js. The cone element overflows well
// past the marker's own 40x40 box (same trick the pulse rings already use -
// Leaflet doesn't clip icon overflow), pointing away from the dot's exact
// center so rotating it in place sweeps correctly regardless of heading.
function buildPlayerMarkerIcon(avatarSrc, fallbackSrc, heading) {
  return L.divIcon({
    className: 'territory-map-player-icon',
    html:
      `<span class="territory-map-player-heading" style="transform:rotate(${heading || 0}deg)"></span>` +
      '<span class="territory-map-player-pulse"></span>' +
      '<span class="territory-map-player-pulse territory-map-player-pulse-b"></span>' +
      `<img class="territory-map-player-avatar" src="${avatarSrc}" alt="" onerror="this.onerror=null;this.src='${fallbackSrc}';" />`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

// Blaze gets a full-body animated sprite on the map instead of the round
// avatar photo: idle when standing still, and a run cycle facing the
// on-screen direction of travel while moving. Each sheet is a 4-frame
// horizontal strip stepped through by CSS (see .territory-map-blaze).
const BLAZE_SHEETS = {
  idle: blazeIdleSheet,
  up: blazeRunUpSheet,
  down: blazeRunDownSheet,
  left: blazeRunLeftSheet,
  right: blazeRunRightSheet,
}

// Compass heading -> which way he runs on screen (north is up on the
// non-rotated map).
function blazePoseForHeading(heading) {
  const h = (((heading || 0) % 360) + 360) % 360
  if (h >= 315 || h < 45) return 'up'
  if (h < 135) return 'right'
  if (h < 225) return 'down'
  return 'left'
}

// Anchored at his feet (not the icon's center) so he stands on the GPS
// point; the sonar pulse sits flattened on the ground underneath him.
function buildBlazeMarkerIcon(pose) {
  return L.divIcon({
    className: 'territory-map-player-icon territory-map-blaze-icon',
    html:
      '<span class="territory-map-blaze-body">' +
      '<span class="territory-map-blaze-ground">' +
      '<span class="territory-map-player-pulse"></span>' +
      '<span class="territory-map-player-pulse territory-map-player-pulse-b"></span>' +
      '</span>' +
      `<span class="territory-map-blaze is-${pose === 'idle' ? 'idle' : 'running'}" style="background-image:url('${BLAZE_SHEETS[pose]}')"></span>` +
      '</span>',
    iconSize: [48, 64],
    iconAnchor: [24, 58],
  })
}

// Territories read as Pokémon GO gyms: just a colored, ink-outlined badge
// planted at the centroid — no name floating on the map. Tapping it still
// reveals who holds it via a popup, so the information isn't lost, just not
// cluttering the default view.
//
// t.emojiUrl is the owner's equipped TERRITORY_EMOJI Store item (see
// toDisplayParcel) — an uploaded image, not a literal emoji glyph, despite
// the category's name. Falls back to the default crown/flag glyph when the
// owner has nothing equipped there.
function territoryBadgeIcon(t, isMine, playerColor) {
  const background = isMine ? playerColor || PLAYER_COLOR : t.color
  const badgeContent = t.emojiUrl
    ? `<img src="${resolveFileUrl(t.emojiUrl)}" alt="" onerror="this.replaceWith(document.createTextNode('${isMine ? '👑' : '🚩'}'))" />`
    : isMine
      ? '👑'
      : '🚩'
  return L.divIcon({
    className: 'territory-badge-icon',
    html: `<div class="territory-badge" style="background:${background}">${badgeContent}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function polygonCentroid(points) {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length
  return [lat, lng]
}

// Groups territories by owner before merging (see mergeTouchingParcels in
// utils/territoryGame.js, shared with the Me tab's own "My Territories"
// list) so the two touching/overlapping-parcel-fusing rules stay in exactly
// one place instead of drifting apart.
function mergeOwnerTerritories(territories) {
  const byOwner = new Map()
  for (const t of territories) {
    if (!byOwner.has(t.ownerId)) byOwner.set(t.ownerId, [])
    byOwner.get(t.ownerId).push(t)
  }

  const merged = []
  for (const parcels of byOwner.values()) {
    const { ownerId, ownerName, color, emojiUrl } = parcels[0]
    for (const m of mergeTouchingParcels(parcels)) {
      merged.push({
        ...m,
        id: `${ownerId}-${m.id}`,
        ownerId,
        ownerName,
        color,
        emojiUrl,
      })
    }
  }
  return merged
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
function FocusHighlight({ highlightOwnerId, highlightParcelId, territories }) {
  const map = useMap()
  useEffect(() => {
    if (!highlightOwnerId) return
    // A specific parcel (picked from the "Me" tab list) flies to just that
    // one shape instead of every parcel the owner has in view, so tapping
    // different rows in the list actually goes to different places.
    const matches = highlightParcelId
      ? territories.filter((t) => t.id === highlightParcelId)
      : territories.filter((t) => t.ownerId === highlightOwnerId)
    if (matches.length === 0) return
    const bounds = L.latLngBounds(matches.flatMap((t) => toLatLngs(t.points)))
    map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 19 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, highlightOwnerId, highlightParcelId])
  return null
}

// One claimed parcel's polygon. A tap also kicks off the gold lap flourish
// around it (see TapEffect.jsx).
function TerritoryPolygon({
  t,
  isMine,
  isHighlighted,
  playerColor,
  onParcelClick,
  onTapEffect,
}) {
  return (
    <Polygon
      positions={toLatLngs(t.points)}
      pathOptions={{
        color: isHighlighted
          ? '#FFFFFF'
          : isMine
            ? playerColor || PLAYER_COLOR
            : '#2B2140',
        weight: isHighlighted ? 4 : isMine ? 4 : 3,
        fillColor: isMine ? playerColor || PLAYER_COLOR : t.color,
        fillOpacity: isHighlighted ? 0.65 : isMine ? 0.5 : 0.35,
        className: isHighlighted
          ? 'territory-poly-highlight territory-poly-clickable'
          : isMine
            ? 'territory-poly-player territory-poly-clickable'
            : 'territory-poly-clickable',
      }}
      eventHandlers={{
        click: (e) => {
          L.DomEvent.stopPropagation(e)
          onTapEffect(t.points)
          onParcelClick?.(t)
        },
      }}
    />
  )
}

// Zoom level (the max of the 14-19 range ZoomRangeLimiter allows) at which
// the map settles into its tilted "close-up" view, Google Maps/Pokémon GO
// style — only at the very last zoom step (scrolled or pinched all the way
// in), not partway through zooming closer.
const CLOSE_IN_TILT_ZOOM = 19

// The map stays flat/top-down until the player zooms in close, at which
// point it settles into a standing 3D tilt so building-3d extrusions in the
// basemap actually read as buildings instead of flat footprints. Only that
// close-in state tilts — mid-zoom gestures at any other level stay flat, so
// scrolling/pinching through the rest of the range doesn't wobble the whole
// map. Deliberately NOT forced on just because a run is being tracked
// (isNavigating, see NavigationCameraEffect below) - combined with that
// mode's own heading-rotation scale, the two together over-tilted/over-
// zoomed the view into a flattened, sideways-looking "landscape" camera
// angle instead of a readable nav view. Nav mode stays flat/rotating; the
// 3D tilt is purely a zoom-triggered thing.
function ZoomTiltEffect({ tiltRef }) {
  const map = useMapEvents({
    zoom() {
      syncCloseInTilt()
    },
  })

  function syncCloseInTilt() {
    const closeIn = map.getZoom() >= CLOSE_IN_TILT_ZOOM
    tiltRef.current?.classList.toggle('is-close-in', closeIn)
  }

  useEffect(() => {
    syncCloseInTilt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

// Google Maps "start riding" nav mode - while actively tracking a run, the
// camera keeps the player centered automatically instead of requiring a
// manual pan/zoom, at a close enough zoom to actually read as navigation.
// playerLocation gets a new object reference on every GPS fix (see
// GamePage.jsx), so this re-centers on each real position update.
function NavigationCameraEffect({ isNavigating, playerLocation }) {
  const map = useMap()
  useEffect(() => {
    if (!isNavigating || !playerLocation) return
    map.setView(
      [playerLocation.lat, playerLocation.lng],
      Math.max(map.getZoom(), 18),
      { animate: true, duration: 0.8 }
    )
  }, [map, isNavigating, playerLocation])
  return null
}

// Keeps zoom within a sane range (close enough to read the map, not so far
// out it's the whole city) without fencing where the player can pan to —
// the map view itself is free to explore now, unlike the pan-locked-to-a-
// radius behavior this used to also do.
function ZoomRangeLimiter() {
  const map = useMap()
  useEffect(() => {
    map.setMinZoom(14)
    map.setMaxZoom(19)
  }, [map])
  return null
}

// Captures the Leaflet map instance for controls that render outside
// MapContainer (see LocateButton below) and so can't reach it via useMap()
// themselves.
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

// Leaflet's default SVG renderer only buffers a small padding (10% of the
// viewport) beyond what's visible, so panning/dragging (a "hover" drag on a
// touch device) past that buffer visibly clips territory polygons until the
// gesture ends and Leaflet redraws around the new center. A much larger
// padding keeps a wide buffer of polygons pre-rendered around the visible
// area so ordinary pans don't visibly crop anything before the redraw.
const territoryRenderer = L.svg({ padding: 2 })

export default function TerritoryMap({
  center,
  playerLocation,
  territories,
  livePath,
  currentUserId,
  highlightOwnerId,
  highlightParcelId,
  avatarSrc,
  playerHeading,
  playerColor,
  trailColor,
  mapStyleUrl,
  ambience,
  blazeSprite,
  playerMoving,
  isNavigating,
  onParcelClick,
  onMapReady,
}) {
  const showPreview = livePath.length >= 3
  const tiltRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)
  // While navigating, the whole map rotates to point the travel direction
  // up (see .territory-map-heading below) - the marker's own heading cone
  // would otherwise double up on that rotation, so it just points straight
  // up (0deg, already "forward" on a rotated map) instead of the real
  // compass heading.
  // Blaze's pose only changes on idle/running or a new quadrant, so the icon
  // (and its CSS animation) isn't rebuilt on every small heading update.
  const blazePose = blazeSprite
    ? !playerMoving
      ? 'idle'
      : isNavigating
        ? 'up'
        : blazePoseForHeading(playerHeading)
    : null
  const markerHeading = blazePose ? null : isNavigating ? 0 : playerHeading
  const playerMarkerIcon = useMemo(
    () =>
      blazePose
        ? buildBlazeMarkerIcon(blazePose)
        : buildPlayerMarkerIcon(
            avatarSrc || defaultAvatarImage,
            defaultAvatarImage,
            markerHeading
          ),
    [blazePose, avatarSrc, markerHeading]
  )

  // Warm the cache so switching idle -> running never shows a blank frame.
  useEffect(() => {
    if (!blazeSprite) return
    Object.values(BLAZE_SHEETS).forEach((src) => {
      new Image().src = src
    })
  }, [blazeSprite])

  const [activeTapEffects, setActiveTapEffects] = useState([])
  const nextTapEffectIdRef = useRef(0)
  function handleTapEffect(points) {
    const id = nextTapEffectIdRef.current++
    setActiveTapEffects((effects) => [...effects, { id, points }])
  }
  function clearTapEffect(id) {
    setActiveTapEffects((effects) => effects.filter((e) => e.id !== id))
  }

  const mergedTerritories = useMemo(
    () => mergeOwnerTerritories(territories),
    [territories]
  )

  return (
    <div
      className="territory-map"
      style={
        ambience?.filter ? { '--ambience-filter': ambience.filter } : undefined
      }
    >
      <div
        className="territory-map-heading"
        style={{
          transform: isNavigating
            ? `rotate(${-(playerHeading || 0)}deg) scale(1.5)`
            : 'none',
          // Blaze counter-rotates by this so he stays upright on screen
          // while the whole map is rotated in nav view.
          '--map-counter-rotation': isNavigating
            ? `${playerHeading || 0}deg`
            : '0deg',
        }}
      >
        <div className="territory-map-tilt" ref={tiltRef}>
          <MapContainer
            center={[center.lat, center.lng]}
            zoom={17}
            scrollWheelZoom
            zoomControl={false}
            renderer={territoryRenderer}
          >
            <PokemonStyleBaseLayer
              styleUrl={mapStyleUrl}
              onReady={onMapReady}
            />

            {mergedTerritories.map((t) => {
              const isMine =
                Boolean(currentUserId) && t.ownerId === currentUserId
              const isHighlighted = highlightParcelId
                ? t.sourceIds.includes(highlightParcelId)
                : highlightOwnerId === t.ownerId
              return (
                <TerritoryPolygon
                  key={t.id}
                  t={t}
                  isMine={isMine}
                  isHighlighted={isHighlighted}
                  playerColor={playerColor}
                  onParcelClick={onParcelClick}
                  onTapEffect={handleTapEffect}
                />
              )
            })}

            {mergedTerritories.map((t) => {
              const isMine =
                Boolean(currentUserId) && t.ownerId === currentUserId
              return (
                <Marker
                  key={`${t.id}-badge`}
                  position={polygonCentroid(t.points)}
                  icon={territoryBadgeIcon(t, isMine, playerColor)}
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
                pathOptions={{ color: trailColor || '#E63946', weight: 4 }}
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
                // Tapping your own avatar shows nothing - interactive so the
                // tap doesn't fall through to a territory badge/polygon it
                // happens to be sitting on and pop that up instead.
                eventHandlers={{
                  click: (e) => L.DomEvent.stopPropagation(e),
                }}
              />
            )}

            <FocusHighlight
              highlightOwnerId={highlightOwnerId}
              highlightParcelId={highlightParcelId}
              territories={territories}
            />
            <InvalidateSizeOnMount />
            <ZoomRangeLimiter />
            <ZoomTiltEffect tiltRef={tiltRef} />
            <NavigationCameraEffect
              isNavigating={isNavigating}
              playerLocation={playerLocation}
            />
            <CaptureMapInstance onReady={setMapInstance} />
            {activeTapEffects.map((effect) => (
              <TapEffect
                key={effect.id}
                points={effect.points}
                onDone={() => clearTapEffect(effect.id)}
              />
            ))}
          </MapContainer>
        </div>
      </div>
      {ambience && (
        <div
          className={`territory-map-sky sky-phase-${ambience.phase} sky-${ambience.sky}`}
          aria-hidden="true"
        >
          <div className="territory-map-sky-weather" />
        </div>
      )}
      <div className="territory-map-vignette" aria-hidden="true" />
      {mapInstance && <LocateButton map={mapInstance} />}
    </div>
  )
}
