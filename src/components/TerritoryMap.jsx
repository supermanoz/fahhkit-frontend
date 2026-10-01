/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconCrosshairs } from './GameIcons'
import {
  MapContainer,
  Polygon,
  Polyline,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import '@maplibre/maplibre-gl-leaflet'

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
import { PLAYER_COLOR, mergeTouchingParcels } from '../utils/territoryGame'
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
import 'maplibre-gl/dist/maplibre-gl.css'
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
// maplibre-gl-leaflet's end-of-zoom handoff snaps the canvas back to 1:1
// *before* MapLibre has redrawn at the new zoom, so for a frame the old
// picture shows at the wrong scale - the flicker/jump at the end of every
// scroll or pinch zoom. This waits for MapLibre's first frame at the new
// camera and swaps the transform in that same frame instead.
const SmoothMaplibreGL = L.MaplibreGL.extend({
  _transitionEnd() {
    L.Util.requestAnimFrame(() => {
      if (!this._map) return
      const center = this._map.getCenter()
      this._resizeContainer()
      this._glMap.once('render', () => this._zoomEnd())
      this._glMap.jumpTo({
        center: [center.lng, center.lat],
        zoom: this._map.getZoom() - 1,
      })
      this._glMap.triggerRepaint()
    })
  },
})

function PokemonStyleBaseLayer({ styleUrl, onReady, glMapRef }) {
  const map = useMap()

  useEffect(() => {
    const glLayer = new SmoothMaplibreGL({
      style: styleUrl || BASEMAP_STYLE_URL,
      // Extra off-screen margin so a zoom-out animation (which shrinks the
      // canvas until the redraw) doesn't expose bare edges mid-gesture.
      padding: 0.3,
      // A bigger tile cache means zooming back in/out over ground you've
      // already seen redraws from memory instead of re-fetching.
      maxTileCacheSize: 1000,
      className: 'territory-map-tiles',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const glMap = glLayer.getMaplibreMap()
    if (glMapRef) glMapRef.current = glMap
    glMap.on('styledata', () => hideSymbolLayers(glMap))
    hideSymbolLayers(glMap)
    // "idle" fires once every source has actually finished loading tiles -
    // the point at which the basemap visually looks complete, not just
    // "style applied." Gates GamePage's loading screen.
    glMap.once('idle', () => onReady?.())

    return () => {
      if (glMapRef) glMapRef.current = null
      map.removeLayer(glLayer)
    }
    // Re-created (not just re-styled) on a style change - simplest way to
    // fully swap a maplibre-gl-leaflet layer without fighting its own
    // internal style-diffing. The real-world weather/time look is a CSS
    // filter driven from .territory-map (see --ambience-filter), so it
    // never forces a re-create.
  }, [map, styleUrl, onReady, glMapRef])

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
// on-screen direction of travel while moving. Each sheet is a horizontal
// strip stepped through by CSS (see .territory-map-blaze) - 4 frames for
// idle/down/left/right, but "up" is a finer 15-frame cycle at 24fps (see
// the [data-frames="15"] override in TerritoryMap.css), so frame count
// travels with the sheet here instead of being hard-coded in one class.
const BLAZE_SHEETS = {
  idle: { src: blazeIdleSheet, frames: 4 },
  up: { src: blazeRunUpSheet, frames: 15 },
  down: { src: blazeRunDownSheet, frames: 4 },
  left: { src: blazeRunLeftSheet, frames: 4 },
  right: { src: blazeRunRightSheet, frames: 4 },
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
  const sheet = BLAZE_SHEETS[pose]
  return L.divIcon({
    className: 'territory-map-player-icon territory-map-blaze-icon',
    html:
      '<span class="territory-map-blaze-body">' +
      '<span class="territory-map-blaze-ground">' +
      '<span class="territory-map-player-pulse"></span>' +
      '<span class="territory-map-player-pulse territory-map-player-pulse-b"></span>' +
      '</span>' +
      `<span class="territory-map-blaze is-${pose === 'idle' ? 'idle' : 'running'}" data-frames="${sheet.frames}" style="background-image:url('${sheet.src}')"></span>` +
      '</span>',
    iconSize: [48, 64],
    iconAnchor: [24, 58],
  })
}

// Territories are just their coloured polygons - no marker planted on
// them (the player's own flag was removed). Centroid still used below.
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

// Zoom level (the max zoom ZoomRangeLimiter allows) at which
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

// Leaflet only draws flat Web Mercator, so past GLOBE_ENTER_ZOOM the map
// hands off to a native MapLibre globe (see TerritoryGlobe) and zooming back
// in to GLOBE_EXIT_ZOOM hands back. The one-level gap between the two keeps a
// gesture that ends right on the boundary from ping-ponging between them.
// Both are Leaflet zoom levels - MapLibre's 512px tiles put its own zoom
// one level lower for the same scale.
const GLOBE_ENTER_ZOOM = 4
const GLOBE_EXIT_ZOOM = 5
// From this zoom out, the globe is already mounted (invisible) and tracking
// the Leaflet camera, so its tiles are loaded by the time it fades in -
// otherwise the handoff flashes an empty sphere while they stream in.
const GLOBE_WARM_ZOOM = 6
// Street-level zoom a tapped territory dot dives down to.
const GLOBE_DIVE_ZOOM = 16
// Longest the globe waits on the flat map's tiles before fading out anyway.
const GLOBE_EXIT_WAIT_MS = 1500

// Leaflet bottoms out at GLOBE_ENTER_ZOOM - the globe takes over from there,
// all the way out to the whole earth. No pan bounds either way.
function ZoomRangeLimiter() {
  const map = useMap()
  useEffect(() => {
    map.setMinZoom(GLOBE_ENTER_ZOOM)
    map.setMaxZoom(19)
  }, [map])
  return null
}

// Warms the globe up as the player zooms out toward it, keeps its camera in
// step with Leaflet's, and reveals it once Leaflet is zoomed all the way out.
// Never during a tracked run - NavigationCameraEffect owns the camera then.
function GlobeHandoff({ isNavigating, onGlobeCamera, onRevealGlobe }) {
  const map = useMapEvents({
    moveend() {
      const zoom = map.getZoom()
      if (isNavigating || zoom > GLOBE_WARM_ZOOM) {
        onGlobeCamera(null)
        return
      }
      const c = map.getCenter()
      onGlobeCamera({ lat: c.lat, lng: c.lng, zoom: zoom - 1 })
      if (zoom <= GLOBE_ENTER_ZOOM) onRevealGlobe()
    },
  })
  return null
}

function territoryDotsGeoJSON(territories, currentUserId, playerColor) {
  return {
    type: 'FeatureCollection',
    features: territories.map((t) => {
      const [lat, lng] = polygonCentroid(t.points)
      const isMine = Boolean(currentUserId) && t.ownerId === currentUserId
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          color: isMine ? playerColor || PLAYER_COLOR : t.color || '#2B2140',
          mine: isMine,
        },
      }
    }),
  }
}

// Zoom at which the whole sphere fits on screen with some space around it.
// A MapLibre globe's radius is its world size over 2π, shrunk by the
// cosine of the center latitude (MapLibre's globe zoom correction).
function globeFitZoom(glMap) {
  const { clientWidth, clientHeight } = glMap.getContainer()
  const targetRadius = 0.42 * Math.min(clientWidth, clientHeight)
  const latScale = Math.max(
    Math.cos((glMap.getCenter().lat * Math.PI) / 180),
    0.3
  )
  return Math.max(Math.log2((targetRadius * 2 * Math.PI) / (512 * latScale)), 0)
}

// The zoomed-out "whole earth" view - a native MapLibre map (not the Leaflet
// bridge, which is locked to Mercator) in globe projection, laid over the
// Leaflet map while it's active. Territories show up as glowing dots, since
// the real polygons are far too small to see from orbit; tapping one dives
// straight back down to it. Mounted invisible from GLOBE_WARM_ZOOM out (see
// GlobeHandoff) and cross-faded in and out over the Leaflet map.
function TerritoryGlobe({
  camera,
  visible,
  styleUrl,
  territories,
  currentUserId,
  playerColor,
  onExit,
}) {
  const containerRef = useRef(null)
  const glMapRef = useRef(null)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const dots = useMemo(
    () => territoryDotsGeoJSON(territories, currentUserId, playerColor),
    [territories, currentUserId, playerColor]
  )
  const dotsRef = useRef(dots)
  dotsRef.current = dots
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  useEffect(() => {
    const glMap = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl || BASEMAP_STYLE_URL,
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      minZoom: 0,
      maxZoom: GLOBE_EXIT_ZOOM - 1,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    })
    glMap.touchZoomRotate.disableRotation()
    glMapRef.current = glMap

    // Pre-render the whole-earth zoom while still hidden, so pulling back
    // into space on reveal draws from cached tiles instead of popping them
    // in mid-flight - then go back to shadowing the Leaflet camera.
    glMap.once('load', () => {
      if (visibleRef.current) return
      glMap.jumpTo({ zoom: globeFitZoom(glMap) })
      glMap.once('idle', () => {
        if (visibleRef.current) return
        const c = cameraRef.current
        glMap.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom })
      })
    })

    glMap.on('styledata', () => hideSymbolLayers(glMap))
    glMap.on('style.load', () => {
      glMap.setProjection({ type: 'globe' })
      glMap.setSky({ 'atmosphere-blend': 1 })
      hideSymbolLayers(glMap)
      glMap.addSource('territory-dots', {
        type: 'geojson',
        data: dotsRef.current,
      })
      glMap.addLayer({
        id: 'territory-dots-glow',
        type: 'circle',
        source: 'territory-dots',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['case', ['get', 'mine'], 14, 10],
          'circle-opacity': 0.3,
          'circle-blur': 0.8,
        },
      })
      glMap.addLayer({
        id: 'territory-dots',
        type: 'circle',
        source: 'territory-dots',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['case', ['get', 'mine'], 6, 4],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        },
      })
    })
    glMap.on('click', 'territory-dots', (e) => {
      const [lng, lat] = e.features[0].geometry.coordinates
      // The whole dive happens in MapLibre (which flattens the globe into a
      // regular map as it nears the ground) - one continuous camera move
      // instead of two maps handing off halfway down.
      glMap.setMaxZoom(GLOBE_DIVE_ZOOM - 1)
      glMap.flyTo({
        center: [lng, lat],
        zoom: GLOBE_DIVE_ZOOM - 1,
        duration: 2600,
        curve: 1.6,
      })
    })
    glMap.on('mouseenter', 'territory-dots', () => {
      glMap.getCanvas().style.cursor = 'pointer'
    })
    glMap.on('mouseleave', 'territory-dots', () => {
      glMap.getCanvas().style.cursor = ''
    })
    glMap.on('zoomend', () => {
      // Hidden, it's only following Leaflet (see the camera effect below).
      if (!visibleRef.current) return
      if (glMap.getZoom() < GLOBE_EXIT_ZOOM - 1 - 0.05) return
      const c = glMap.getCenter()
      onExitRef.current({
        lat: c.lat,
        lng: c.lng,
        zoom: Math.round(glMap.getZoom() + 1),
      })
    })

    return () => {
      glMap.remove()
      glMapRef.current = null
    }
    // The camera is only the starting view - re-creating on every change
    // would fight the player's own panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl])

  // While hidden, mirror the Leaflet camera so the reveal lines up exactly
  // with the flat map it fades in over.
  useEffect(() => {
    if (visibleRef.current) return
    glMapRef.current?.jumpTo({
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
    })
  }, [camera])

  // The handoff zoom is still close enough that the sphere overflows the
  // screen - on reveal, pull back into space until the whole round globe
  // fits, while it fades in.
  useEffect(() => {
    const glMap = glMapRef.current
    if (!visible || !glMap) return
    // Undo a previous dot dive's raised cap (resetting it at the end of the
    // dive itself would clamp the zoom and fire a second handoff).
    glMap.setMaxZoom(GLOBE_EXIT_ZOOM - 1)
    // The reveal and Leaflet's last camera update land in the same render,
    // so the camera effect above skipped it - start from it here instead.
    glMap.jumpTo({
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
    })
    glMap.flyTo({ zoom: globeFitZoom(glMap), duration: 1600, curve: 1.2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    glMapRef.current?.getSource('territory-dots')?.setData(dots)
  }, [dots])

  return (
    <div
      className={`territory-globe${visible ? ' is-visible' : ''}`}
      ref={containerRef}
    />
  )
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

function LocateButton({ map, onLocated }) {
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
        onLocated?.()
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
        <IconCrosshairs />
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
  // Non-null while the globe is mounted (warm or showing) - the Leaflet
  // camera it follows while hidden. See GlobeHandoff.
  const [globeCamera, setGlobeCamera] = useState(null)
  const [globeVisible, setGlobeVisible] = useState(false)
  const baseGlMapRef = useRef(null)
  // Leaflet is lined up underneath first, and the globe only fades once the
  // flat map has finished drawing there - otherwise the fade reveals tiles
  // still popping in.
  function exitGlobe(view) {
    const baseGl = baseGlMapRef.current
    if (!view || !mapInstance || !baseGl) {
      setGlobeVisible(false)
      return
    }
    mapInstance.setView([view.lat, view.lng], view.zoom, { animate: false })
    let done = false
    const reveal = () => {
      if (done) return
      done = true
      setGlobeVisible(false)
    }
    baseGl.once('idle', reveal)
    setTimeout(reveal, GLOBE_EXIT_WAIT_MS)
  }

  // Anything that moves the Leaflet camera itself (a tracked run, flying to
  // a highlighted territory) needs the globe out of the way to be seen.
  useEffect(() => {
    if (isNavigating || highlightOwnerId || highlightParcelId) {
      setGlobeVisible(false)
    }
  }, [isNavigating, highlightOwnerId, highlightParcelId])
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
    Object.values(BLAZE_SHEETS).forEach(({ src }) => {
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
      className={`territory-map${globeVisible ? ' is-globe' : ''}`}
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
              glMapRef={baseGlMapRef}
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
            <GlobeHandoff
              isNavigating={isNavigating}
              onGlobeCamera={setGlobeCamera}
              onRevealGlobe={() => setGlobeVisible(true)}
            />
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
      {globeCamera && (
        <TerritoryGlobe
          camera={globeCamera}
          visible={globeVisible}
          styleUrl={mapStyleUrl}
          territories={mergedTerritories}
          currentUserId={currentUserId}
          playerColor={playerColor}
          onExit={exitGlobe}
        />
      )}
      {ambience && (
        <div
          className={`territory-map-sky sky-phase-${ambience.phase} sky-${ambience.sky}`}
          aria-hidden="true"
        >
          <div className="territory-map-sky-weather" />
        </div>
      )}
      <div className="territory-map-vignette" aria-hidden="true" />
      {mapInstance && (
        <LocateButton map={mapInstance} onLocated={() => exitGlobe()} />
      )}
    </div>
  )
}
