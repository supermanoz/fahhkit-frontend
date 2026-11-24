/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { IconCompassNeedle } from './GameIcons'
import {
  TEST_HEADING_OVERRIDES,
  createHeadingTracker,
} from '../utils/headingTracker'
import { isMapDebugEnabled } from '../utils/mapDebug'
import { installRotationSupport } from '../utils/leafletRotation'
import { subscribeFixes } from '../utils/gpsFeed'
import { subscribeCompass } from '../utils/compassHeading'
import { isNative } from '../utils/geo'
import { getRunView } from '../utils/runView'
import {
  hasSeenRotationHint,
  markRotationHintSeen,
} from '../utils/mapRotationSetting'
import { visibleInterval } from '../utils/visibleInterval'

// Heading-up map for an active run (Conquer, Training, PvP, Club War: they
// all run through TerritoryMap). See utils/headingTracker.js for the heading
// signal and its tunables.
//
// How it turns the map: the map (.territory-map-tilt, the "rotor") is turned
// with a CSS transform; Leaflet keeps working in its own unrotated space.
// Markers counter-rotate (CSS `rotate: var(--map-counter)`) so the hero,
// flag etc. always stay upright. Taps and drags are un-rotated by
// installRotationSupport. Everything per-update is imperative: custom
// properties on two elements, animated by CSS transitions. React only hears
// about the rare changes (compass visible / north-up chosen / first-time
// hint), never a per-update re-render.
//
// While the map is rotated the rotor is made large enough that its corners
// never show (a circle around the screen, plus the lower-third shift): that
// is the extra tile / canvas cost, and it is only paid during a run.

const GLIDE_MS = 520 // one heading step; linear so back-to-back steps join up
const RESET_MS = 650 // compass tap (eased)
const VIEW_MS = 500 // entering RUN view / leaving it back to north-up (eased)
const GL_MAX_PIXEL_RATIO = 2 // the bigger canvas must not blow memory
const PLAYER_ROW = 2 / 3 // heading-up: player sits this far down the visible map
const norm360 = (d) => ((d % 360) + 360) % 360
const shortArc = (from, to) => ((((to - from) % 360) + 540) % 360) - 180

function readSheetH(root) {
  const v = parseFloat(getComputedStyle(root).getPropertyValue('--sheet-h'))
  return Number.isFinite(v) ? v : 90
}

export function MapRotationController({
  rotorRef,
  rootRef,
  glMapRef,
  enabled, // setting on AND a run is being tracked
  runView = 'run', // 'run': turn with the runner; 'idle': fixed north-up
  following, // the camera is following the player (not free-look)
  controlRef,
  debugRef, // optional: filled with () => snapshot for the debug panel
  onInfo,
  onRequestFollow,
}) {
  const map = useMap()
  const trackerRef = useRef(null)
  if (!trackerRef.current) trackerRef.current = createHeadingTracker()
  const st = useRef({
    rot: 0, // unwrapped CSS rotation of the map, degrees
    userNorth: false,
    big: false,
    shift: 0,
    reported: null,
    shrinkTimer: null,
    hinted: false,
  })
  const followingRef = useRef(following)
  followingRef.current = following
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const runViewRef = useRef(runView)
  runViewRef.current = runView
  const infoRef = useRef(onInfo)
  infoRef.current = onInfo

  // Taps / drags / pinch centre must undo the rotation.
  useEffect(() => {
    if (!rotorRef.current) return undefined
    return installRotationSupport(map, rotorRef.current, L)
  }, [map, rotorRef])

  function report(force = false) {
    const s = st.current
    const bucket = Math.round(s.rot / 10)
    const key = `${bucket}|${s.userNorth}`
    if (!force && s.reported === key) return
    s.reported = key
    infoRef.current?.({ rot: s.rot, userNorth: s.userNorth })
  }

  function paint(deg, shiftPx, durMs, ease) {
    const rotor = rotorRef.current
    const root = rootRef.current
    if (!rotor || !root) return
    root.style.setProperty('--map-rot-dur', `${durMs}ms`)
    root.style.setProperty('--map-rot-ease', ease)
    rotor.style.setProperty('--map-rot', `${deg}deg`)
    rotor.style.setProperty('--map-shift', `${shiftPx}px`)
    root.style.setProperty('--map-counter', `${-deg}deg`)
    root.style.setProperty('--map-compass', `${deg}deg`)
  }

  // Size the rotor to cover the screen at ANY angle, centred on the player.
  function growRotor() {
    const rotor = rotorRef.current
    const root = rootRef.current
    if (!rotor || !root) return
    const s = st.current
    const W = root.clientWidth
    const H = root.clientHeight
    if (!W || !H) return
    const visible = Math.max(H - readSheetH(root), H * 0.5)
    s.shift = Math.max(0, Math.round(visible * PLAYER_ROW - H / 2))
    const size = Math.ceil(2 * (Math.hypot(W, H) / 2 + s.shift) + 8)
    rotor.style.setProperty('--rotor-size', `${size}px`)
    if (!s.big) {
      s.big = true
      rotor.classList.add('is-rotor')
      const gl = glMapRef?.current
      if (gl?.setPixelRatio) {
        s.pixelRatio = gl.getPixelRatio?.() ?? window.devicePixelRatio
        gl.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, GL_MAX_PIXEL_RATIO)
        )
      }
    }
    map.invalidateSize({ animate: false })
  }

  function shrinkRotor() {
    const rotor = rotorRef.current
    const s = st.current
    if (!rotor || !s.big) return
    s.big = false
    rotor.classList.remove('is-rotor')
    rotor.style.removeProperty('--rotor-size')
    const gl = glMapRef?.current
    if (gl?.setPixelRatio && s.pixelRatio) gl.setPixelRatio(s.pixelRatio)
    map.invalidateSize({ animate: false })
  }

  // Heading-up: the travel direction (a compass bearing) points up.
  function applyBearing(bearing, durMs = GLIDE_MS, ease = 'linear') {
    const s = st.current
    s.rot += shortArc(norm360(s.rot), norm360(-bearing))
    paint(s.rot, s.shift, durMs, ease)
    if (!s.hinted && Math.abs(s.rot) > 5 && !hasSeenRotationHint()) {
      s.hinted = true
      markRotationHintSeen()
      infoRef.current?.({ rot: s.rot, userNorth: s.userNorth, hint: true })
    }
    report()
  }

  function goNorth(durMs = RESET_MS) {
    const s = st.current
    // Nearest whole turn so a long run never spins backwards.
    s.rot = Math.round(s.rot / 360) * 360
    paint(s.rot, 0, durMs, 'cubic-bezier(0.4, 0, 0.2, 1)')
    report()
  }

  // Run starts / ends.
  useEffect(() => {
    const s = st.current
    clearTimeout(s.shrinkTimer)
    if (enabled) {
      // Fresh tracker per run; walking-speed test thresholds only while the
      // hidden debug switch is on.
      trackerRef.current = createHeadingTracker(
        isMapDebugEnabled() ? TEST_HEADING_OVERRIDES : {}
      )
      s.userNorth = false
      growRotor()
      report(true)
      return undefined
    }
    if (s.big) {
      goNorth()
      s.shrinkTimer = setTimeout(() => {
        // Settle the unwrapped angle at 0 without a visible change, then
        // give the map its normal size back.
        s.rot = 0
        paint(0, 0, 0, 'linear')
        shrinkRotor()
        report(true)
      }, RESET_MS + 80)
    }
    return () => clearTimeout(s.shrinkTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // Keep the cover correct if the screen changes size (rotate device, keyboard).
  useEffect(() => {
    const onResize = () => {
      if (st.current.big) growRotor()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Feed every raw GPS fix to the heading tracker (see utils/gpsFeed: the run
  // recorder's own points are throttled and filtered for distance, which
  // starved this).
  useEffect(() => {
    if (!enabled) return undefined
    return subscribeFixes((fix) => {
      trackerRef.current.pushFix({
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        speed: fix.speed,
        heading: fix.heading,
        t: Number.isFinite(fix.t) ? fix.t : Date.now(),
      })
    })
  }, [enabled])

  // Phone compass: native app only, and only a slow-start fallback inside the
  // tracker (it never drives the map on its own).
  useEffect(() => {
    if (!enabled || !isNative) return undefined
    return subscribeCompass((deg, t) => trackerRef.current.pushCompass(deg, t))
  }, [enabled])

  // Debug panel snapshot (read on demand, never per frame).
  useEffect(() => {
    if (!debugRef) return undefined
    debugRef.current = () => {
      const s = st.current
      const d = trackerRef.current.debug()
      let rotation = 'off (no run / setting off)'
      let why = ''
      if (enabledRef.current) {
        if (s.userNorth) {
          rotation = 'paused'
          why = 'north-up chosen (compass button)'
        } else if (!followingRef.current) {
          rotation = 'paused'
          why = 'free-look (map not following you)'
        } else if (runViewRef.current !== 'run') {
          rotation = 'fixed'
          why = `IDLE view: ${getRunView().state().reason}`
        } else if (d.state === 'held') {
          rotation = 'held'
          why = d.reason
        } else if (d.state === 'active' || d.state === 'turning') {
          rotation = 'active'
          why = d.reason
        } else {
          rotation = 'waiting'
          why = d.reason
        }
      }
      return {
        ...d,
        rotation,
        why,
        runView: { ...getRunView().state(), shared: runViewRef.current },
        mapBearing: norm360(-s.rot),
        mapRotationCss: s.rot,
        native: isNative,
        testMode: isMapDebugEnabled(),
      }
    }
    return () => {
      debugRef.current = null
    }
  }, [debugRef])

  // The clock: ~2 updates a second, and nothing at all while the app is in
  // the background (visibleInterval) or no run is active.
  useEffect(() => {
    if (!enabled) return undefined
    return visibleInterval(
      () => {
        const out = trackerRef.current.tick(Date.now())
        if (out === null) return
        const s = st.current
        // IDLE view: the tracker keeps its heading warm but the map stays put.
        if (runViewRef.current !== 'run') return
        if (!followingRef.current || s.userNorth) return
        applyBearing(out)
      },
      500,
      'map-heading'
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // The shared RUN / IDLE view flips: RUN glides to the current heading,
  // IDLE glides back to north-up and then holds fixed. Both take the shortest
  // arc (applyBearing / goNorth) at ~VIEW_MS, transform-only.
  useEffect(() => {
    const s = st.current
    if (!enabledRef.current || s.userNorth || !followingRef.current) return
    if (runView === 'run') {
      const h = trackerRef.current.current()
      if (h !== null) applyBearing(h, VIEW_MS, 'cubic-bezier(0.4, 0, 0.2, 1)')
    } else {
      goNorth(VIEW_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runView])

  // Back from free-look: join the current view again (RUN: current heading,
  // IDLE: north-up).
  useEffect(() => {
    const s = st.current
    if (!enabled || !following || s.userNorth) return
    if (runViewRef.current === 'run') {
      const h = trackerRef.current.current()
      if (h !== null) applyBearing(h, RESET_MS, 'cubic-bezier(0.4, 0, 0.2, 1)')
    } else {
      goNorth(RESET_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following])

  // Compass button.
  useEffect(() => {
    if (!controlRef) return undefined
    controlRef.current = {
      toggleNorth() {
        const s = st.current
        if (!enabledRef.current) return
        if (!s.userNorth) {
          s.userNorth = true
          goNorth()
        } else {
          s.userNorth = false
          onRequestFollow?.()
          const h = trackerRef.current.current()
          if (h !== null && runViewRef.current === 'run') {
            applyBearing(h, RESET_MS, 'cubic-bezier(0.4, 0, 0.2, 1)')
          }
        }
        report(true)
      },
    }
    return () => {
      controlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlRef, onRequestFollow])

  useEffect(() => () => clearTimeout(st.current.shrinkTimer), [])
  return null
}

// Small game-style compass: the needle shows where north is on screen. Only
// there while the map is turned (or the runner chose north-up and may want to
// turn it back).
export function MapCompass({ visible, userNorth, onClick }) {
  if (!visible) return null
  return (
    <button
      type="button"
      className="territory-map-compass"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={
        userNorth ? 'Turn the map with your run' : 'Point the map north'
      }
      title={userNorth ? 'Turn with my run' : 'North up'}
      data-testid="map-compass"
    >
      <IconCompassNeedle className="territory-map-compass-needle" />
    </button>
  )
}

// One-time tip, shown once ever (see mapRotationSetting).
export function RotationHint({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 6500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div
      className="territory-map-rotation-hint"
      role="status"
      data-testid="map-rotation-hint"
    >
      Map turns as you run. Tap the compass for north-up.
    </div>
  )
}
