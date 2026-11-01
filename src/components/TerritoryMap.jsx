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
import { haversineDistance } from '../utils/run'
// Same fallback image GamePage.jsx uses (its own defaultAvatarImage) - this
// used to be a different local avatar (Wind), so a broken avatarSrc (e.g.
// the account's equipped Hero's assetUrl 404ing) showed one character on
// the map and a different one in the Me panel instead of matching.
import defaultAvatarImage from '../assets/avatars/blaze.png'
import { getHero } from '../utils/heroManifest'
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

// Scales up the on-map player marker - both the round avatar/GPS-dot variant
// below and the animated hero sprite further down - from its original size.
// The one number every marker dimension in this file is computed from:
// iconSize/iconAnchor read it directly in JS, and every size/offset in
// TerritoryMap.css that can't just be a percentage of its parent (the pulse
// ring's inset, the sprite's transform-origin/ground offset, the sheet's
// background-size/position) reads it back via the `--s` custom property set
// inline on each marker's own html below - the same pattern already used
// for --hero-heading - so CSS can never drift out of sync with this value.
const PLAYER_MARKER_SCALE = 1.5

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
// Plain GPS dot - no Google Maps-style heading cone fanning out from it.
const AVATAR_ICON_SIZE = 40 * PLAYER_MARKER_SCALE

function buildPlayerMarkerIcon(avatarSrc, fallbackSrc) {
  return L.divIcon({
    className: 'territory-map-player-icon',
    html:
      `<span style="--s:${PLAYER_MARKER_SCALE}">` +
      '<span class="territory-map-player-pulse"></span>' +
      '<span class="territory-map-player-pulse territory-map-player-pulse-b"></span>' +
      `<img class="territory-map-player-avatar" src="${avatarSrc}" alt="" onerror="this.onerror=null;this.src='${fallbackSrc}';" />` +
      '</span>',
    iconSize: [AVATAR_ICON_SIZE, AVATAR_ICON_SIZE],
    iconAnchor: [AVATAR_ICON_SIZE / 2, AVATAR_ICON_SIZE / 2],
  })
}

// Blaze, Comet and Bolt each get a full-body animated sprite on the map
// instead of the round avatar photo: idle when standing still, and a
// single back-view run cycle while moving. There is only ever ONE sheet
// per pose (no separate up/down/left/right sheets to switch between) - the
// sprite always shows the character from behind/top-down, and faces the
// right way by ROTATING via CSS (see .territory-map-blaze-body's
// --hero-heading, driven imperatively by useSmoothMarkerHeading below),
// the same way a real top-down game character would, instead of snapping
// between four fixed-angle drawings. Each sheet is a horizontal strip
// stepped through by CSS (see .territory-map-blaze) - idle is a slower
// 48-frame stretch (shoulder, then arm), running is a finer 15-frame cycle
// at 24fps (see the [data-frames] overrides in TerritoryMap.css), so frame
// count travels with the sheet (see each hero's manifest.json, read via
// heroManifest.js's getHero) instead of being hard-coded in one class -
// that CSS keys purely off frame count, not which hero, so every hero's
// sheet reuses it unchanged. See scripts/build_<hero>_stretch_strips.py.
// Any hero with no manifest falls back to the flat avatar photo instead of
// Blaze's sprite (see animatedMarkerHero in GamePage.jsx, which only ever
// passes 'blaze'/'comet'/'bolt' here - any other hero never reaches
// buildAnimatedMarkerIcon at all).

// Anchored at his feet (not the icon's center) so he stands on the GPS
// point; the sonar pulse sits flattened on the ground underneath him.
// `moving` just picks idle vs. run - which way he's FACING is handled
// separately, imperatively, by useSmoothMarkerHeading rotating
// .territory-map-blaze-body, so this icon never needs rebuilding on a
// heading change (only on an idle<->running swap).
const BLAZE_ICON_WIDTH = 48 * PLAYER_MARKER_SCALE
const BLAZE_ICON_HEIGHT = 64 * PLAYER_MARKER_SCALE
const BLAZE_ICON_ANCHOR_X = 24 * PLAYER_MARKER_SCALE
const BLAZE_ICON_ANCHOR_Y = 58 * PLAYER_MARKER_SCALE

function buildAnimatedMarkerIcon(heroKey, moving) {
  const sheet = getHero(heroKey).map[moving ? 'run' : 'idle']
  // The sprite's per-frame cell, scaled from the sheet's REAL pixel size
  // (sheet.frameWidth/frameHeight, read straight off each hero's own
  // manifest.json - see scripts/build_<hero>_stretch_strips.py) down to
  // this marker's fixed on-screen height (64px at 1x - BLAZE_ICON_HEIGHT),
  // preserving the real aspect ratio exactly. TerritoryMap.css used to
  // hardcode this as a flat 48x64 cell (the old hand-cut sprites this
  // replaced) - that silently went stale and slightly stretched every
  // frame once the pipeline moved to these auto-built 128x170 sheets,
  // since nothing forced the two to stay in sync. Passed in as inline
  // custom properties so CSS never has to guess the sheet's real size
  // again.
  const cellHeight = 64
  const cellWidth = (sheet.frameWidth / sheet.frameHeight) * cellHeight
  return L.divIcon({
    className: 'territory-map-player-icon territory-map-blaze-icon',
    html:
      `<span class="territory-map-blaze-body" style="--s:${PLAYER_MARKER_SCALE}">` +
      '<span class="territory-map-blaze-ground">' +
      '<span class="territory-map-player-pulse"></span>' +
      '<span class="territory-map-player-pulse territory-map-player-pulse-b"></span>' +
      '</span>' +
      `<span class="territory-map-blaze is-${moving ? 'running' : 'idle'}" data-frames="${sheet.frames}" style="background-image:url('${sheet.src}');--cell-w:${cellWidth};--cell-h:${cellHeight}"></span>` +
      '</span>',
    iconSize: [BLAZE_ICON_WIDTH, BLAZE_ICON_HEIGHT],
    iconAnchor: [BLAZE_ICON_ANCHOR_X, BLAZE_ICON_ANCHOR_Y],
  })
}

// Start/finish pin for whichever route is currently being previewed or run
// (saved route, PvP course, or a generated "Run this territory" loop) -
// every route in this game is a closed loop (territory claims require one),
// so its start and finish are the same physical point: one flag, not two
// overlapping pins. Plain checkered-flag glyph, same divIcon-with-raw-HTML
// pattern the player/avatar markers above already use.
function buildRouteAnchorIcon() {
  return L.divIcon({
    className: 'territory-map-route-anchor-icon',
    html: '<span class="territory-map-route-anchor">🏁</span>',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
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

// Floor for FocusHighlight's camera below - a large territory used to
// fitBounds all the way out with no lower limit, so a big enough one could
// zoom out past readable street level. 14 keeps roads/blocks legible (well
// below FOLLOW_ZOOM/CLOSE_IN_TILT_ZOOM's 19, well above the globe handoff's
// GLOBE_ENTER_ZOOM of 4) while still being loose enough that the 70px side
// padding plus the popup's own bottom padding (see
// TERRITORY_FOCUS_BOTTOM_PADDING) comfortably fit alongside it. A single
// named constant, per the brief, so this is the only place to tune it.
const TERRITORY_FOCUS_MIN_ZOOM = 14
// Extra bottom padding (on top of the uniform 70px every other side gets)
// so a large territory's own bounds don't end up hidden behind the
// territory popup, which is bottom-anchored on mobile (see GamePage.css's
// .game-territory-popup) - this is a rough, safe estimate of that popup's
// height, not read from the DOM.
const TERRITORY_FOCUS_BOTTOM_PADDING = 190
// Leaflet's flyTo/flyToBounds duration is in seconds, not ms - the brief's
// own "about 400-600ms" asked for here.
const TERRITORY_FOCUS_FLY_SECONDS = 0.5

// Flies the map to whichever owner's parcels the player tapped (on the map
// itself, from the "Me" tab list, or from the leaderboard). Depends only on
// highlightOwnerId/highlightParcelId (not the territories array itself,
// which gets a new reference on every render) so it doesn't refly mid-run
// every time the parcel list refreshes for an unrelated reason.
function FocusHighlight({
  highlightOwnerId,
  highlightParcelId,
  territories,
  playerLocation,
}) {
  const map = useMap()
  // The camera right before the first fly of this highlight session, so
  // closing the popup (highlightOwnerId going back to null) can return
  // smoothly to it instead of leaving the camera wherever the highlight
  // left it. Cleared once restored, so a second unrelated highlight later
  // doesn't fly back to a now-stale spot.
  const previousViewRef = useRef(null)

  useEffect(() => {
    if (!highlightOwnerId) {
      if (previousViewRef.current) {
        const { center, zoom } = previousViewRef.current
        previousViewRef.current = null
        map.flyTo(center, zoom, { duration: TERRITORY_FOCUS_FLY_SECONDS })
      }
      return
    }
    // A specific parcel (picked from the "Me" tab list) flies to just that
    // one shape instead of every parcel the owner has in view, so tapping
    // different rows in the list actually goes to different places.
    const matches = highlightParcelId
      ? territories.filter((t) => t.id === highlightParcelId)
      : territories.filter((t) => t.ownerId === highlightOwnerId)
    if (matches.length === 0) return

    if (!previousViewRef.current) {
      previousViewRef.current = { center: map.getCenter(), zoom: map.getZoom() }
    }

    const allPoints = matches.flatMap((t) => t.points)
    const bounds = L.latLngBounds(toLatLngs(allPoints))
    const padding = L.point(70, 70)
    const bottomPadding = L.point(70, TERRITORY_FOCUS_BOTTOM_PADDING)
    // The zoom fitBounds would naturally land on, uncapped - only used to
    // decide whether this territory actually needs the floor below, not
    // passed to flyToBounds itself.
    const naturalFitZoom = map.getBoundsZoom(bounds, false, padding)

    if (naturalFitZoom >= TERRITORY_FOCUS_MIN_ZOOM) {
      map.flyToBounds(bounds, {
        paddingTopLeft: padding,
        paddingBottomRight: bottomPadding,
        maxZoom: 19,
        duration: TERRITORY_FOCUS_FLY_SECONDS,
      })
      return
    }

    // Too large to fit at the floor zoom without zooming out further than
    // that - center on whichever point of the territory is nearest the
    // player instead of the whole shape's centroid, so the ground actually
    // closest to them stays on screen (falls back to the centroid when
    // their location isn't known yet).
    const focusPoint = playerLocation
      ? allPoints.reduce((nearest, p) =>
          haversineDistance(p, playerLocation) <
          haversineDistance(nearest, playerLocation)
            ? p
            : nearest
        )
      : bounds.getCenter()
    map.flyTo([focusPoint.lat, focusPoint.lng], TERRITORY_FOCUS_MIN_ZOOM, {
      duration: TERRITORY_FOCUS_FLY_SECONDS,
    })
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
  drawActive,
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
          // While drawing a route, a tap on a parcel is a draw point like
          // anywhere else on the map - routes aren't claims, so there's no
          // reason someone else's territory should block a tap from
          // reaching DrawClickCatcher the way it normally does (stopping
          // propagation here is what makes the parcel "claim-able" from a
          // tap in every other context).
          if (drawActive) return
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
// map. Explicitly suppressed while isFollowing (a tracked run) even though
// FOLLOW_ZOOM below now sits AT this same threshold - a steep tilt during a
// run would reintroduce the "no 3D tilt" glitch surface the run view was
// deliberately simplified away from, and fights the run view for screen
// space anyway. Free/manual zooming in this close still gets the tilt as
// before. The map never rotates at all (the run view's old bearing-rotation
// and this independent, zoom-only tilt were the two things that combined
// into a past "flattened, sideways-looking landscape" glitch), so there's
// nothing left here to guard against stacking with.
function ZoomTiltEffect({ tiltRef, isFollowing }) {
  const map = useMapEvents({
    zoom() {
      syncCloseInTilt()
    },
  })

  function syncCloseInTilt() {
    tiltRef.current?.classList.toggle(
      'is-close-in',
      !isFollowing && map.getZoom() >= CLOSE_IN_TILT_ZOOM
    )
  }

  useEffect(() => {
    syncCloseInTilt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFollowing])

  return null
}

// Zoom floor for the auto-following camera below - "zoomed in more, as
// close as the tile source supports without blur," per the brief. Checked
// directly: every MAP_STYLES option is OpenFreeMap's "openmaptiles" vector
// source, whose own TileJSON reports maxzoom 14 - but that's vector tile
// DATA, not raster imagery, so zooming past it doesn't blur or blank out
// the way an overzoomed photo tile would; MapLibre just reuses z14's
// geometry at a larger on-screen scale, which still reads perfectly crisp
// (labels render at native resolution regardless of zoom too). So the real
// ceiling here isn't the tile data's maxzoom (14 would be a city-scale
// view, not street-level) - it's Leaflet's own configured maxZoom (see
// ZoomRangeLimiter below), which this now matches exactly. Only ever
// raises the zoom (Math.max against whatever it currently is) - never
// zooms OUT, so a player who's manually zoomed in further keeps that.
const FOLLOW_ZOOM = 19

// Google Maps "start riding" nav mode - while actively tracking a run, the
// camera keeps the player centered automatically instead of requiring a
// manual pan/zoom, at a close enough zoom to actually read as navigation.
// playerLocation gets a new object reference on every GPS fix (see
// GamePage.jsx), so this re-centers on each real position update.
// programmaticMoveRef is set right before the setView call below so
// UserPanDetector (a sibling under the same map) can tell this move apart
// from a real pinch/drag and not mistake it for one.
function NavigationCameraEffect({
  isFollowing,
  playerLocation,
  programmaticMoveRef,
}) {
  const map = useMap()
  useEffect(() => {
    if (!isFollowing || !playerLocation) return
    programmaticMoveRef.current = true
    map.setView(
      [playerLocation.lat, playerLocation.lng],
      Math.max(map.getZoom(), FOLLOW_ZOOM),
      { animate: true, duration: 0.8 }
    )
  }, [map, isFollowing, playerLocation, programmaticMoveRef])
  return null
}

// Drops straight to the location button's Free state the moment the player
// actually pinches/drags the map themselves
// (Google Maps' "free look" while navigating) - active only while
// isFollowing, so it's a no-op the rest of the time. dragstart only ever
// fires for a real pointer/touch drag (setView's own pan doesn't go
// through Leaflet's Draggable), but setView's zoom change DOES fire
// zoomstart, so that one needs programmaticMoveRef to tell a real pinch
// apart from the camera's own re-center.
function UserPanDetector({ isFollowing, programmaticMoveRef, onUserPan }) {
  useMapEvents({
    dragstart() {
      if (isFollowing) onUserPan?.()
    },
    zoomstart() {
      if (isFollowing && !programmaticMoveRef.current) onUserPan?.()
    },
    moveend() {
      programmaticMoveRef.current = false
    },
  })
  return null
}

// Route-drawing mode (see GamePage.jsx's routeDraftMode) - tapping the map
// adds a waypoint. Same useMapEvents shape as ZoomTiltEffect/GlobeHandoff
// above, just for clicks instead of zoom/move.
function DrawClickCatcher({ active, onPoint }) {
  useMapEvents({
    click(e) {
      if (!active) return
      onPoint?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// Brings a saved/shared route into view the moment it's opened (My Routes /
// Club shared routes) instead of leaving the player to pan/zoom to find it.
// Only runs once per route - re-fitting on every render would fight a
// manual pan/zoom the player does afterward.
function FitRouteBounds({ points }) {
  const map = useMap()
  const fittedForRef = useRef(null)
  useEffect(() => {
    if (!points || points.length === 0) {
      fittedForRef.current = null
      return
    }
    if (fittedForRef.current === points) return
    fittedForRef.current = points
    map.fitBounds(L.latLngBounds(toLatLngs(points)), { padding: [40, 40] })
  }, [map, points])
  return null
}

// A new GPS fix lands at most every ~2.5s (see useRunTracker's
// MIN_POINT_INTERVAL_MS) and playerLocation just snapped straight to it on
// every render, so the hero dot visibly teleported between fixes instead of
// gliding like Google Maps' moving-vehicle dot. This tweens the *Leaflet
// marker itself* via requestAnimationFrame + setLatLng, imperatively,
// deliberately bypassing React state/props for the position — going through
// React would mean the <Marker position> prop keeps resetting the marker
// back to the raw (un-smoothed) fix on every render that the tween is also
// trying to animate away from, fighting itself and flickering. The tween
// duration is matched to how long actually elapsed since the previous fix
// (clamped to a sane range) so the dot arrives right around when the next
// fix is expected, rather than under/overshooting a fixed guess.
const MARKER_TWEEN_MIN_MS = 400
const MARKER_TWEEN_MAX_MS = 2500
const MARKER_TWEEN_DEFAULT_MS = 1500

function useSmoothMarkerPosition(markerRef, target) {
  const currentRef = useRef(null)
  const fromRef = useRef(null)
  const toRef = useRef(null)
  const startRef = useRef(0)
  const durationRef = useRef(MARKER_TWEEN_DEFAULT_MS)
  const lastArrivalRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const marker = markerRef.current
    if (!target || !marker) return

    if (!currentRef.current) {
      // First fix for this marker instance - nothing to tween from yet.
      currentRef.current = target
      toRef.current = target
      lastArrivalRef.current = performance.now()
      marker.setLatLng([target.lat, target.lng])
      return
    }
    if (toRef.current === target) return // re-render with no new fix

    const now = performance.now()
    const gap =
      lastArrivalRef.current == null
        ? MARKER_TWEEN_DEFAULT_MS
        : now - lastArrivalRef.current
    durationRef.current = Math.min(
      MARKER_TWEEN_MAX_MS,
      Math.max(MARKER_TWEEN_MIN_MS, gap)
    )
    lastArrivalRef.current = now
    fromRef.current = currentRef.current
    toRef.current = target
    startRef.current = now

    // A tween is already mid-flight - it reads from/to/start fresh every
    // frame, so just updating the refs above is enough to smoothly
    // re-target it from wherever it currently is.
    if (rafRef.current != null) return

    const tick = () => {
      const m = markerRef.current
      if (!m) {
        rafRef.current = null
        return
      }
      const t = Math.min(
        1,
        (performance.now() - startRef.current) / durationRef.current
      )
      const from = fromRef.current
      const to = toRef.current
      const next = {
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t,
      }
      currentRef.current = next
      m.setLatLng([next.lat, next.lng])
      rafRef.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [markerRef, target])

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    []
  )
}

// How long a heading change takes to visually settle on the character -
// tweak here. Deliberately NOT tied to the position tween's own duration
// above (which is matched to the GPS fix interval) - a heading flip should
// always ease at the same, fairly quick pace regardless of how far apart
// two fixes landed.
const ROTATION_EASE_MS = 400

// Shortest signed angle from `from` to `to`, in (-180, 180] - turning right
// through 350deg->10deg is a +20 step, never a -340 one.
function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180
}

// Writes the character's facing direction straight to the marker's DOM
// element as a CSS custom property (see .territory-map-blaze-body's
// `rotate: var(--hero-heading, 0deg)`) - never through React state/props,
// so a heading update never re-renders anything or touches the icon's
// `html` (which would restart its run-cycle animation).
function applyMarkerHeading(marker, deg) {
  const el = marker.getElement?.()
  if (el) el.style.setProperty('--hero-heading', `${deg}deg`)
}

// Eases the marker's on-screen facing direction toward `heading` (degrees,
// 0-360, or null if no direction is known/applicable yet - see
// animatedMarkerHero in GamePage.jsx) over ROTATION_EASE_MS, shortest path,
// entirely via refs + requestAnimationFrame - heading changes arrive as a
// plain number prop, so this effect only ever re-fires on a REAL change
// (React skips re-running an effect whose dependency didn't change value),
// and the tween itself never triggers a React re-render either. `heading`
// is expected to already be GPS-course-only (see playerHeading in
// GamePage.jsx) - this hook has no idea where it came from and doesn't
// care, it just animates toward whatever number it's given.
function useSmoothMarkerHeading(markerRef, heading, icon) {
  const currentRef = useRef(null) // unwrapped running total, can exceed 0-360
  const fromRef = useRef(0)
  const toRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    // null means no directional sprite, OR outside the run view (see
    // markerHeading's isTracking gate) - eases back to upright (0) the
    // same way it eases to any other heading, instead of bailing out and
    // freezing the marker at whatever it was last facing mid-run. This
    // was the other half of the "tilts on the HUD" bug: even after gating
    // markerHeading to null outside a run, this hook previously did
    // nothing at all when it received null, so the marker stayed rotated
    // from the last run forever instead of straightening up.
    const target = heading ?? 0

    if (currentRef.current == null) {
      // First heading this marker instance has ever been given - snap,
      // nothing to ease from yet.
      currentRef.current = target
      applyMarkerHeading(marker, target)
      return
    }

    fromRef.current = currentRef.current
    toRef.current =
      fromRef.current + shortestAngleDelta(fromRef.current, target)
    startRef.current = performance.now()

    if (rafRef.current != null) return // already mid-tween; refs above retarget it

    const tick = () => {
      const m = markerRef.current
      if (!m) {
        rafRef.current = null
        return
      }
      const t = Math.min(
        1,
        (performance.now() - startRef.current) / ROTATION_EASE_MS
      )
      const next = fromRef.current + (toRef.current - fromRef.current) * t
      currentRef.current = next
      applyMarkerHeading(m, next)
      rafRef.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [markerRef, heading])

  // An idle<->running swap gives this marker a brand new icon - Leaflet's
  // own setIcon() rebuilds the DOM element from scratch (same L.Marker
  // instance, see PlayerMarker's own comment, but a fresh element), which
  // starts with no --hero-heading set on it at all. Without this, the
  // character would visibly snap to facing north (CSS's
  // var(--hero-heading, 0deg) fallback) for a moment after every
  // idle<->running transition, not easing back to the real heading until
  // the next genuine heading CHANGE happened to come in (the tween effect
  // above only re-fires then, never on an icon-only swap). Re-stamps the
  // already-known current angle straight onto the new element instead -
  // no easing needed, it's the same value it already had.
  useEffect(() => {
    const marker = markerRef.current
    if (!marker || currentRef.current == null) return
    applyMarkerHeading(marker, currentRef.current)
  }, [markerRef, icon])

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    []
  )
}

// Dev-only sanity check for the "two characters" bug class: queries the DOM
// for every element carrying the player-character class and warns if more
// than one ever turns up. There should only ever be one <PlayerMarker/> in
// the tree (see TerritoryMap's render) and this component creates its
// Leaflet marker exactly once per mount (see the ref-driven hooks above -
// nothing here ever calls L.marker() or re-creates the icon on a position/
// heading update), so a count above 1 means a marker got duplicated rather
// than reused - most likely a real mount-twice bug, not StrictMode (which
// mounts, cleans up, then re-mounts in dev, and should net out to 1 as
// long as the Marker's own cleanup runs, which react-leaflet's does).
function useWarnOnDuplicateCharacter() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const raf = requestAnimationFrame(() => {
      const count = document.querySelectorAll(
        '.territory-map-player-icon'
      ).length
      if (count > 1) {
        console.warn(
          `[TerritoryMap] ${count} player character elements found in the DOM at once - expected exactly 1. The marker is being duplicated instead of reused.`
        )
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [])
}

// react-leaflet forwards a Marker's ref to the underlying Leaflet marker
// instance, which is what lets the hooks above drive it directly. The
// `position` prop is only ever the very first fix this instance sees
// (captured once, frozen) - every fix after that is applied imperatively,
// never through a changing prop, so react-leaflet's own prop-sync effect
// never fights the tween. This marker is created exactly once per mount
// and removed on unmount by react-leaflet's own Marker lifecycle - nothing
// here ever calls L.marker()/removeLayer() a second time or swaps in a new
// instance on a position/heading/moving change.
function PlayerMarker({ playerLocation, icon, heading }) {
  const markerRef = useRef(null)
  const originRef = useRef(playerLocation)
  useSmoothMarkerPosition(markerRef, playerLocation)
  useSmoothMarkerHeading(markerRef, heading, icon)
  useWarnOnDuplicateCharacter()
  return (
    <Marker
      ref={markerRef}
      position={[originRef.current.lat, originRef.current.lng]}
      icon={icon}
      zIndexOffset={1000}
      // Tapping your own avatar shows nothing - interactive so the tap
      // doesn't fall through to a territory badge/polygon it happens to be
      // sitting on and pop that up instead.
      eventHandlers={{
        click: (e) => L.DomEvent.stopPropagation(e),
      }}
    />
  )
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
function GlobeHandoff({ isFollowing, onGlobeCamera, onRevealGlobe }) {
  const map = useMapEvents({
    moveend() {
      const zoom = map.getZoom()
      if (isFollowing || zoom > GLOBE_WARM_ZOOM) {
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
  animatedMarkerHero,
  playerMoving,
  isFollowing,
  isTracking = false,
  onUserPan,
  isLoopRun = true,
  drawActive = false,
  onDrawPoint,
  drawPoints,
  viewRoutePoints,
  ownRoutesOverlay,
  onRouteClick,
  routeGuidanceLine,
  routeOffCourse = false,
  routeAnchorPoint,
  onParcelClick,
  onMapReady,
}) {
  const routeAnchorIcon = useMemo(() => buildRouteAnchorIcon(), [])
  // The dashed closing preview only makes sense for a territory-conquer loop
  // run - a PvP race or club-war run has no "loop" to close, so drawing a
  // line from the last point back to the first there was just visual noise.
  const showPreview = isLoopRun && livePath.length >= 3
  const rootRef = useRef(null)
  const tiltRef = useRef(null)
  // Shared between NavigationCameraEffect and UserPanDetector so the
  // latter can ignore the former's own programmatic re-center.
  const programmaticMoveRef = useRef(false)
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
    if (isFollowing || highlightOwnerId || highlightParcelId) {
      setGlobeVisible(false)
    }
  }, [isFollowing, highlightOwnerId, highlightParcelId])
  // The icon (and its CSS run-cycle animation) only needs rebuilding on an
  // idle<->running swap - which way he's actually FACING is applied
  // separately, imperatively, by useSmoothMarkerHeading inside
  // PlayerMarker (see heading prop below), so a heading change never
  // touches this at all.
  const playerMarkerIcon = useMemo(
    () =>
      animatedMarkerHero
        ? buildAnimatedMarkerIcon(animatedMarkerHero, playerMoving)
        : buildPlayerMarkerIcon(
            avatarSrc || defaultAvatarImage,
            defaultAvatarImage
          ),
    [animatedMarkerHero, playerMoving, avatarSrc]
  )
  // Rotation only ever applies inside an actual tracked run - outside one
  // (the home/HUD screen, where this same marker still renders at the
  // player's live position) playerHeading keeps updating off passive GPS
  // course the whole time the game is open, not just while running (see
  // its own effect in GamePage.jsx), so without this isTracking gate the
  // character would visibly tilt to match wherever the player happens to
  // be physically walking/driving even when no run is in progress - this
  // was the actual cause of the "tilts randomly on the HUD" bug, not a
  // leftover compass listener (useDeviceHeading was already fully removed
  // - see its own deletion). Also still null, same as before, for a hero
  // with no real directional sprite - a flat round avatar photo has no
  // "facing" to show (see useSmoothMarkerHeading's own null guard).
  const markerHeading = animatedMarkerHero && isTracking ? playerHeading : null

  // Warm the cache so switching idle -> running never shows a blank frame.
  useEffect(() => {
    if (!animatedMarkerHero) return
    Object.values(getHero(animatedMarkerHero).map).forEach(({ src }) => {
      new Image().src = src
    })
  }, [animatedMarkerHero])

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
      ref={rootRef}
      className={`territory-map${globeVisible ? ' is-globe' : ''}`}
      style={
        ambience?.filter ? { '--ambience-filter': ambience.filter } : undefined
      }
    >
      {/* The map never rotates and never tilts except for this one,
          independent, zoom-triggered close-in building tilt (see
          ZoomTiltEffect/CLOSE_IN_TILT_ZOOM) - north is always up. */}
      <div className="territory-map-tilt" ref={tiltRef}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={17}
          scrollWheelZoom
          zoomControl={false}
          attributionControl={false}
          renderer={territoryRenderer}
        >
          <PokemonStyleBaseLayer
            styleUrl={mapStyleUrl}
            onReady={onMapReady}
            glMapRef={baseGlMapRef}
          />

          {mergedTerritories.map((t) => {
            const isMine = Boolean(currentUserId) && t.ownerId === currentUserId
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
                drawActive={drawActive}
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
            <PlayerMarker
              playerLocation={playerLocation}
              icon={playerMarkerIcon}
              heading={markerHeading}
            />
          )}

          {/* Route drawing/viewing - always a plain line, never a filled
                polygon (that's reserved for the territory-conquer loop
                preview above). */}
          {/* Every route the owner has drawn, always on (not gated by
                "viewing" one) - thinner than the actively-viewed line
                below so that one still reads as the highlighted one if
                they happen to be the same route. */}
          {/* Dashed, not solid, on every route line - against a filled
                territory polygon underneath it (same-ish blue/dark
                palette as some territory colours), a solid line can
                nearly disappear into the fill; a dash pattern keeps
                reading as "a line" no matter what's under it. */}
          {ownRoutesOverlay?.map(
            (route) =>
              route.points?.length > 0 && (
                <Polyline
                  key={route.id}
                  positions={toLatLngs(route.points)}
                  pathOptions={{
                    color: '#4d9bff',
                    weight: 3,
                    opacity: 0.6,
                    dashArray: '10 8',
                  }}
                  eventHandlers={{
                    click: (e) => {
                      // While drawing, let the tap fall through to the
                      // map (plants a point) instead of opening this.
                      if (drawActive) return
                      // Same as tapping it from My Routes - opens the
                      // same popup (Run This Route / Share with Club).
                      L.DomEvent.stopPropagation(e)
                      onRouteClick?.(route.id)
                    },
                  }}
                />
              )
          )}
          {drawPoints && drawPoints.length > 0 && (
            <Polyline
              positions={toLatLngs(drawPoints)}
              pathOptions={{ color: '#4d9bff', weight: 5, dashArray: '10 8' }}
            />
          )}
          {viewRoutePoints && viewRoutePoints.length > 0 && (
            <Polyline
              positions={toLatLngs(viewRoutePoints)}
              pathOptions={{
                color: '#4d9bff',
                weight: 5,
                dashArray: '10 8',
              }}
            />
          )}
          {/* Google Maps' own "line to destination" while driving/
                walking - the whole remaining path from wherever the
                runner actually is right now to the route's end, not just
                a short stretch ahead. Re-rendered fresh on every GPS fix
                (routeGuidanceLine is a new array each time), so the
                covered ground drops off the front of it live as they
                progress instead of the line staying a fixed length -
                this replaces the static full-route line (see
                viewRoutePoints above) while actually running it. Red
                while off-route, same as the turn HUD's own cue. */}
          {routeGuidanceLine && routeGuidanceLine.length > 1 && (
            <Polyline
              positions={toLatLngs(routeGuidanceLine)}
              pathOptions={{
                color: routeOffCourse ? '#ff5a4d' : '#4d9bff',
                weight: 6,
                opacity: 0.95,
              }}
            />
          )}
          {routeAnchorPoint && (
            <Marker
              position={[routeAnchorPoint.lat, routeAnchorPoint.lng]}
              icon={routeAnchorIcon}
              zIndexOffset={900}
              eventHandlers={{
                click: (e) => L.DomEvent.stopPropagation(e),
              }}
            />
          )}
          <DrawClickCatcher active={drawActive} onPoint={onDrawPoint} />
          <FitRouteBounds points={viewRoutePoints} />

          <FocusHighlight
            highlightOwnerId={highlightOwnerId}
            highlightParcelId={highlightParcelId}
            territories={territories}
            playerLocation={playerLocation}
          />
          <InvalidateSizeOnMount />
          <ZoomRangeLimiter />
          <GlobeHandoff
            isFollowing={isFollowing}
            onGlobeCamera={setGlobeCamera}
            onRevealGlobe={() => setGlobeVisible(true)}
          />
          <ZoomTiltEffect tiltRef={tiltRef} isFollowing={isFollowing} />
          <NavigationCameraEffect
            isFollowing={isFollowing}
            playerLocation={playerLocation}
            programmaticMoveRef={programmaticMoveRef}
          />
          <UserPanDetector
            isFollowing={isFollowing}
            programmaticMoveRef={programmaticMoveRef}
            onUserPan={onUserPan}
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
      {/* Hidden mid-run - GamePage's own Free/Follow location buttons sit in
          this exact spot then and fully replace it. */}
      {mapInstance && !isTracking && (
        <LocateButton map={mapInstance} onLocated={() => exitGlobe()} />
      )}
      {/* Leaflet's own attribution control lives inside .territory-map-tilt
          (attributionControl={false} above), reproduced here as a plain
          static element outside it instead - a straight copy of what
          Leaflet renders there by default. Hidden while the globe is up
          since TerritoryGlobe carries its own (compact) one. */}
      {!globeVisible && (
        <div className="territory-map-attribution">
          <a
            href="https://leafletjs.com"
            title="A JavaScript library for interactive maps"
          >
            Leaflet
          </a>
          {' | '}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
            OpenFreeMap
          </a>{' '}
          <a
            href="https://www.openmaptiles.org/"
            target="_blank"
            rel="noreferrer"
          >
            © OpenMapTiles
          </a>{' '}
          Data from{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>
        </div>
      )}
    </div>
  )
}
