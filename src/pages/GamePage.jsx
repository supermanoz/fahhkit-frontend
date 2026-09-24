import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FaCheck,
  FaCoins,
  FaFlag,
  FaListUl,
  FaLock,
  FaPlay,
  FaStore,
  FaTimes,
  FaTrophy,
  FaUser,
  FaUsers,
} from 'react-icons/fa'
import { BsVolumeMuteFill, BsVolumeUpFill } from 'react-icons/bs'
import TerritoryMap from '../components/TerritoryMap'
import ShareRunCarousel from '../components/ShareRunCarousel'
import AthleteTerritoryProfilePanel from '../components/AthleteTerritoryProfilePanel'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useRunTracker } from '../hooks/useRunTracker'
import { ApiError, resolveFileUrl } from '../api/client'
import { createRun, getRun, getRuns } from '../api/runs'
import {
  findClubLeaderboard,
  findIndividualLeaderboard,
  findMyParcels,
  findMyTerritoryEvents,
  findParcelsNear,
  getTerritoryProfile,
} from '../api/territory'
import {
  equipStoreItem,
  getOwnedStoreItems,
  getStoreCatalog,
  purchaseStoreItem,
  unequipStoreItem,
} from '../api/store'
import { getFahhcoinBundles, initiateCoinPurchase } from '../api/coinPurchase'
import {
  DEFAULT_CENTER,
  LOOP_CLOSURE_THRESHOLD_METERS,
  LOOP_MIN_AREA_SQ_METERS,
  LOOP_MIN_POINTS,
  VIEW_RADIUS_METERS,
  bearingBetween,
  formatArea,
  levelProgress,
  loopPerimeterMeters,
  mergeTouchingParcels,
  pointInPolygon,
  polygonAreaSqMeters,
  smoothAngle,
  toDisplayParcel,
} from '../utils/territoryGame'
import {
  MIN_VALID_RUN_DISTANCE_METERS,
  MIN_VALID_RUN_DURATION_SECONDS,
  calculatePaceMinPerKm,
  formatDistance,
  formatDuration,
  formatPace,
  formatRunDate,
  haversineDistance,
  toLocalDateTimeString,
} from '../utils/run'
import {
  SHARE_VARIANTS,
  downloadBlob,
  exportShareCardBlob,
} from '../utils/shareCanvas'
import {
  playClickSound,
  playMenuSound,
  playMilestoneChime,
} from '../utils/gameSound'
import { isBlazeHero } from '../utils/hero'
import HeroSprite from '../components/HeroSprite'
import ClubPanel from '../components/ClubPanel'
import LeaderboardPodium from '../components/LeaderboardPodium'
import defaultAvatarImage from '../assets/images/player-avatar-blaze.png'
import runConquestLogo from '../assets/images/run-conquest-logo.png'
import {
  AVATARS,
  COMING_SOON_AVATARS,
  getAvatarById,
  loadAvatarId,
  saveAvatarId,
} from '../constants/avatars'
import {
  MAP_STYLES,
  getMapStyleById,
  loadMapStyleId,
  saveMapStyleId,
} from '../constants/mapStyles'
import {
  describeAmbience,
  fetchSkyConditions,
  pickWeatherHype,
} from '../utils/mapAmbience'
import {
  AREA_EMOJIS,
  getAreaEmojiById,
  loadAreaEmojiId,
  saveAreaEmojiId,
} from '../constants/areaEmojis'
import './GamePage.css'

function formatMeters(meters) {
  if (!meters) return '0 m'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

// Pokémon GO-style fan-out: tapping the pokéball FAB pops these options up
// in an arc instead of jumping straight to a menu, so the x/y offsets below
// are the whole point, not incidental styling. Leaderboard/Me/Shop form the
// top arc; "Start Conquering" sits centered below them, closer to the FAB,
// as the primary action. It isn't a menu tab like the other three (see its
// onClick special-case below) - it starts a run directly, moved in here off
// the map's persistent bottom bar so the idle map reads clean with just the
// FAB showing.
const RADIAL_ITEMS = [
  {
    tab: 'leaderboard',
    label: 'Leaderboard',
    Icon: FaTrophy,
    tone: 'gold',
    x: -119,
    y: -107,
  },
  { tab: 'me', label: 'Me', Icon: FaUser, tone: 'green', x: 0, y: -198 },
  {
    tab: 'shop',
    label: 'Shop',
    Icon: FaStore,
    tone: 'wood',
    x: 119,
    y: -107,
  },
  {
    tab: 'conquer',
    label: 'Start Conquering',
    Icon: FaPlay,
    tone: 'red',
    x: 0,
    y: -95,
  },
]

// Territory processing runs asynchronously on the server after POST /v1/run
// returns (see TerritoryRunCompletionListener) — there's no endpoint to ask
// "what happened to run X" directly, so this polls for any territory event
// that lands after the submit timestamp and gives up after ~15s. Loop
// geometry that never closes produces no event at all (a normal outcome,
// not an error), so a timeout here isn't necessarily bad news.
const RESULT_POLL_ATTEMPTS = 6
const RESULT_POLL_DELAY_MS = 2500

const MUSIC_MUTED_KEY = 'fahhkit_territory_music_muted'
const MILESTONE_METERS = 1000
// Clash-style digit grouping with spaces ("4 138 274") for the HUD counters.
const formatCoins = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
// Minimum time the loading screen stays up, even on a fast load.
const LOADING_MIN_MS = 4500
// Tally-style flags: one flag icon reads as 5 held territories instead of 1,
// so a player with dozens of parcels doesn't need a wall of flag glyphs.
const PARCELS_PER_FLAG = 5

const EVENT_TYPE_TITLES = {
  CLAIMED: 'Territory claimed!',
  CAPTURED: "You captured a rival's ground!",
  SPLIT: "You cropped a rival's edge!",
  MERGED: 'Territory expanded!',
  REJECTED: 'That loop was rejected.',
}

// One run can produce several territory events at once (e.g. capturing a
// smaller rival parcel and claiming the leftover ring of the loop as new
// ground in the same pass) — this picks one title that covers the whole
// set rather than only naming whichever event happened to be newest.
function summarizeRunEvents(events) {
  const types = new Set(events.map((e) => e.eventType))
  const totalArea = events.reduce(
    (sum, e) => sum + Math.abs(e.areaDeltaSqMeters || 0),
    0
  )
  const title =
    types.size === 1
      ? EVENT_TYPE_TITLES[events[0].eventType] || 'Territory updated!'
      : types.has('CAPTURED')
        ? 'Territory captured and claimed!'
        : 'Territory updated!'
  return { title, totalArea }
}

export default function GamePage() {
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const tracker = useRunTracker()
  // The live "Distance" stat during a run - throttled to refresh once every
  // 5s instead of on every render (tracker.elapsedSeconds ticks every
  // second, which would otherwise redraw this on every tick even though
  // the real distance only actually changes when a new GPS fix comes in).
  // A ref (not the tracker value itself) inside the interval closure so it
  // always reads the latest distance rather than the one captured when the
  // interval was created. Pace/Time stay tied to tracker's real-time
  // values - only this one display number is deliberately calmer.
  const trackerDistanceRef = useRef(0)
  trackerDistanceRef.current = tracker.distance
  const [displayedDistance, setDisplayedDistance] = useState(0)
  useEffect(() => {
    if (tracker.status !== 'tracking') {
      setDisplayedDistance(0)
      return
    }
    setDisplayedDistance(trackerDistanceRef.current)
    const interval = setInterval(() => {
      setDisplayedDistance(trackerDistanceRef.current)
    }, 5000)
    return () => clearInterval(interval)
  }, [tracker.status])
  // "Running View" (Google Maps nav-mode - auto-follow, rotate to heading,
  // see TerritoryMap's isNavigating) is the default the moment a run
  // starts, but not everyone wants the map spinning under them - this lets
  // the player flip back to the normal, manually-pannable north-up map
  // and back again as often as they like during the same run (see the
  // toggle button in the tracking controls below). Defaults back to
  // Running View at the start of each new run rather than remembering the
  // last run's choice.
  const [navViewOn, setNavViewOn] = useState(true)
  const wasTrackingRef = useRef(false)
  useEffect(() => {
    const isTracking = tracker.status === 'tracking'
    if (isTracking && !wasTrackingRef.current) setNavViewOn(true)
    wasTrackingRef.current = isTracking
  }, [tracker.status])
  const isNavigating = tracker.status === 'tracking' && navViewOn
  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [locating, setLocating] = useState(true)
  const [liveLocation, setLiveLocation] = useState(null)
  // Gates the "Preparing your run…" loading screen - true only once the
  // basemap has actually finished loading tiles (see TerritoryMap.jsx's
  // PokemonStyleBaseLayer, which fires this on MapLibre's "idle" event), not
  // just once the map component has mounted.
  const [mapReady, setMapReady] = useState(false)
  const handleMapReady = useCallback(() => setMapReady(true), [])

  const [profile, setProfile] = useState(null)
  const [myParcels, setMyParcels] = useState([])
  // The backend still lists one row per claimed loop, so two adjacent runs
  // show up as two separate parcels there - merged the same way
  // TerritoryMap.jsx merges them on the map itself, so the Me tab's "My
  // Territories" list always matches what actually reads as one connected
  // territory on screen instead of showing more, smaller entries than the
  // map does.
  const myTerritories = useMemo(() => {
    const displayParcels = myParcels.map((p) => toDisplayParcel(p, user?.id))
    return mergeTouchingParcels(displayParcels).map((m) => ({
      ...m,
      currentScore: m.sourceIds.reduce(
        (sum, id) =>
          sum + (myParcels.find((p) => p.id === id)?.currentScore || 0),
        0
      ),
    }))
  }, [myParcels, user?.id])
  const [myRuns, setMyRuns] = useState([])
  const [viewingRun, setViewingRun] = useState(null)
  const [loadingRunId, setLoadingRunId] = useState(null)
  const [nearbyParcels, setNearbyParcels] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardMode, setLeaderboardMode] = useState('individual')
  const [clubLeaderboard, setClubLeaderboard] = useState([])
  const [leaderboardError, setLeaderboardError] = useState(null)
  const [storeCatalog, setStoreCatalog] = useState([])
  const [ownedItems, setOwnedItems] = useState([])
  const [storeError, setStoreError] = useState(null)
  const [storeActionError, setStoreActionError] = useState(null)
  const [coinShopOpen, setCoinShopOpen] = useState(false)
  const [coinBundles, setCoinBundles] = useState([])
  const [coinBundlesError, setCoinBundlesError] = useState(null)
  const [buyingBundleAmount, setBuyingBundleAmount] = useState(null)
  const [coinBuyError, setCoinBuyError] = useState(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuTab, setMenuTab] = useState('me')
  const [radialOpen, setRadialOpen] = useState(false)

  const [highlightedEntry, setHighlightedEntry] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [storeChoice, setStoreChoice] = useState(null)
  const [avatarId, setAvatarId] = useState(
    () => loadAvatarId() || AVATARS[0].id
  )
  const [avatarChoice, setAvatarChoice] = useState(null)
  const [mapStyleId, setMapStyleId] = useState(
    () => loadMapStyleId() || MAP_STYLES[0].id
  )
  const [areaEmojiId, setAreaEmojiId] = useState(
    () => loadAreaEmojiId() || AREA_EMOJIS[0].id
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [gpsErrorDismissed, setGpsErrorDismissed] = useState(false)
  // The run just submitted, kept around so "Download Map" in the result
  // toast has something to export — createRun's response (RunSummaryResponse)
  // has no points, so this is built from the local pendingRun data plus the
  // id/avgPace the backend hands back.
  const [completedRun, setCompletedRun] = useState(null)
  const [downloadingMap, setDownloadingMap] = useState(false)

  // Background music mute, remembered across sessions like the avatar
  // choice — nobody wants the game to start blaring music again after they
  // muted it and closed the tab.
  const [musicMuted, setMusicMuted] = useState(() => {
    try {
      return localStorage.getItem(MUSIC_MUTED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const musicRef = useRef(null)

  // Real-world sky for the map (replaces the old manual dark/light
  // toggle) - weather + sunrise/sunset for the player's actual location,
  // loaded before the game is shown so the map never flashes the wrong
  // look. skyLoaded flips true even if the lookup fails; the map then just
  // falls back to a device-clock day/night guess (see mapAmbience.js).
  const [skyConditions, setSkyConditions] = useState(null)
  const [skyLoaded, setSkyLoaded] = useState(false)
  const [skyClock, setSkyClock] = useState(() => Date.now())
  // Last 1km-multiple the player was alerted for during the current tracked
  // run — a ref (not state) since it's read/written from inside an effect
  // and should never itself trigger a re-render.
  const lastMilestoneRef = useRef(0)

  // The bottom action sheet's height changes with its content (idle vs.
  // tracking vs. draft-run-with-stats) and with the device's own safe-area
  // inset - measuring it directly instead of guessing a fixed pixel offset
  // is what lets the floating action row (avatar/menu/locate) sit exactly
  // N px above it on every device, rather than needing hand-tuned
  // breakpoint values that were consistently wrong on real phones.
  const controlsRef = useRef(null)
  const [controlsHeight, setControlsHeight] = useState(90)

  useEffect(() => {
    const el = controlsRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setControlsHeight(el.offsetHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isAuthed) {
      setLocating(false)
      return
    }
    if (!('geolocation' in navigator)) {
      setLocating(false)
      return
    }
    const timeout = setTimeout(() => setLocating(false), 5000)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeout)
        setCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setLocating(false)
      },
      () => {
        clearTimeout(timeout)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 4500 }
    )
    return () => clearTimeout(timeout)
  }, [isAuthed])

  // A standing "where am I" watch, independent of whether a run is being
  // tracked — Pokémon GO always shows your position on the map, not just
  // while a loop is actively being recorded.
  useEffect(() => {
    if (!isAuthed) return
    if (!('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLiveLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          // Kept (like useRunTracker's points) so the heading cone and
          // Blaze's run animation also work outside a tracked run.
          accuracy: position.coords.accuracy,
          speed: position.coords.speed ?? null,
          heading: position.coords.heading ?? null,
        })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [isAuthed])

  const playerLocation =
    tracker.status === 'tracking' && tracker.path.length > 0
      ? tracker.path[tracker.path.length - 1]
      : liveLocation || center

  // Read through a ref so the refresh interval below doesn't restart on
  // every GPS update.
  const skyLocationRef = useRef(playerLocation)
  skyLocationRef.current = playerLocation

  useEffect(() => {
    if (locating) return
    let cancelled = false
    let controller = null
    async function loadSky() {
      controller?.abort()
      controller = new AbortController()
      const { lat, lng } = skyLocationRef.current
      try {
        const conditions = await fetchSkyConditions(lat, lng, {
          signal: controller.signal,
        })
        if (!cancelled) setSkyConditions(conditions)
      } catch {
        // Keep whatever sky we already had (or the clock-based fallback).
      } finally {
        if (!cancelled) setSkyLoaded(true)
      }
    }
    loadSky()
    // Don't hold the game hostage to a slow weather API.
    const giveUp = setTimeout(() => setSkyLoaded(true), 5000)
    const refresh = setInterval(loadSky, 15 * 60 * 1000)
    // Re-evaluates dawn/day/dusk/night between fetches.
    const tick = setInterval(() => setSkyClock(Date.now()), 60 * 1000)
    return () => {
      cancelled = true
      controller?.abort()
      clearTimeout(giveUp)
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [locating])

  const mapAmbience = useMemo(
    () => describeAmbience(skyConditions, skyClock),
    [skyConditions, skyClock]
  )

  // Weather hype pop-up - once per visit, a beat after the loading screen
  // clears so it lands on the actual map rather than being hidden behind
  // the overlay's fade-out.
  const [weatherHype, setWeatherHype] = useState(null)
  const weatherHypeShownRef = useRef(false)
  const introReady = !locating && mapReady && skyLoaded

  // Loading screen runs for at least LOADING_MIN_MS so the logo + bar get
  // their moment, but the bar can't pass the real load steps (location,
  // sky, map) - a slow load just holds it there until they land.
  const [loadStart] = useState(() => Date.now())
  const [loadNow, setLoadNow] = useState(loadStart)
  const [loadingDone, setLoadingDone] = useState(false)
  const loadStepCap = introReady
    ? 100
    : 12 + 29 * [!locating, skyLoaded, mapReady].filter(Boolean).length
  const loadPct = Math.min(
    (100 * (loadNow - loadStart)) / LOADING_MIN_MS,
    loadStepCap
  )
  useEffect(() => {
    if (loadingDone) return
    const tick = setInterval(() => setLoadNow(Date.now()), 100)
    return () => clearInterval(tick)
  }, [loadingDone])
  useEffect(() => {
    if (loadPct < 100 || loadingDone) return
    // Brief beat on a full bar before the overlay lifts.
    const done = setTimeout(() => setLoadingDone(true), 350)
    return () => clearTimeout(done)
  }, [loadPct, loadingDone])
  const gameReady = introReady && loadingDone

  useEffect(() => {
    if (!gameReady || weatherHypeShownRef.current) return
    // Marked shown inside the timeout, not before it - StrictMode's dev-only
    // effect double-run would otherwise clear the timer and never show it.
    const show = setTimeout(() => {
      weatherHypeShownRef.current = true
      setWeatherHype(pickWeatherHype(mapAmbience))
    }, 600)
    return () => clearTimeout(show)
    // Only the moment the game first becomes ready matters, not later sky
    // refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady])
  useEffect(() => {
    if (!weatherHype) return
    const hide = setTimeout(() => setWeatherHype(null), 6000)
    return () => clearTimeout(hide)
  }, [weatherHype])

  // "Entering [rival]'s territory!" banner - fires the moment the player's
  // dot physically crosses into a claimed parcel that isn't theirs, not just
  // when they tap one on the map. insideParcelId tracks which parcel (if
  // any) the player is currently standing in so this only fires on the
  // transition into a new one, not every location update while still inside.
  const [insideParcelId, setInsideParcelId] = useState(null)
  const [territoryEntryBanner, setTerritoryEntryBanner] = useState(null)
  useEffect(() => {
    if (!playerLocation) return
    const standingIn = nearbyParcels.find((t) =>
      pointInPolygon(playerLocation, t.points)
    )
    const nextId = standingIn?.id ?? null
    if (nextId === insideParcelId) return
    setInsideParcelId(nextId)
    if (standingIn && standingIn.ownerId !== user?.id) {
      setTerritoryEntryBanner({
        ownerName: standingIn.ownerName || 'a rival',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerLocation, nearbyParcels])

  useEffect(() => {
    if (!territoryEntryBanner) return
    const timeout = setTimeout(() => setTerritoryEntryBanner(null), 3200)
    return () => clearTimeout(timeout)
  }, [territoryEntryBanner])

  // Player marker's heading cone (Google Maps nav-view style), and - while
  // actively navigating a tracked run - the whole map's rotation (see
  // TerritoryMap's isNavigating). Real GPS/WiFi fixes jitter by meters even
  // standing still (MAX_ACCEPTABLE_ACCURACY_METERS admits up to 20m-
  // accuracy points, and network/WiFi positioning can report a
  // meaningfully different "best guess" position on consecutive polls with
  // zero real movement), so naively recomputing a heading from any nearby
  // fix's position DELTA alone - even a fairly large one - spun the whole
  // map on pure positioning noise instead of real movement. The fix a real
  // nav SDK uses: never re-orient the camera off position deltas alone,
  // corroborate with the fix's own reported SPEED (an independently
  // measured quantity, not inferred from consecutive positions) before
  // trusting any heading change at all - preferring the GPS chip's own
  // reported course (coords.heading, see useRunTracker.js) when speed
  // clears the floor, else only a recomputed bearing once the movement
  // also clearly exceeds both fixes' combined accuracy margin. Easing into
  // any new heading (smoothAngle) instead of snapping straight to it.
  const MIN_BEARING_MOVEMENT_METERS = 8
  const MIN_TRUSTED_SPEED_MPS = 0.5
  const lastBearingFixRef = useRef(null)
  const [playerHeading, setPlayerHeading] = useState(0)
  useEffect(() => {
    if (!playerLocation) return
    const isMoving =
      (playerLocation.speed ?? 0) > MIN_TRUSTED_SPEED_MPS ||
      (lastBearingFixRef.current?.speed ?? 0) > MIN_TRUSTED_SPEED_MPS
    if (!isMoving) {
      lastBearingFixRef.current = playerLocation
      return
    }
    if (
      playerLocation.heading != null &&
      !Number.isNaN(playerLocation.heading)
    ) {
      setPlayerHeading((current) =>
        smoothAngle(current, playerLocation.heading)
      )
      lastBearingFixRef.current = playerLocation
      return
    }
    const prev = lastBearingFixRef.current
    if (prev) {
      const moved = haversineDistance(prev, playerLocation)
      const noiseFloor = (prev.accuracy || 0) + (playerLocation.accuracy || 0)
      if (moved >= Math.max(MIN_BEARING_MOVEMENT_METERS, noiseFloor)) {
        setPlayerHeading((current) =>
          smoothAngle(current, bearingBetween(prev, playerLocation))
        )
      }
    }
    lastBearingFixRef.current = playerLocation
  }, [playerLocation])

  // Drives Blaze's idle vs. running sprite on the map. Uses the fix's own
  // reported speed (same noise reasoning as the heading above) and holds
  // "moving" for a few seconds after the last fast fix, so a single slow
  // or missed GPS reading doesn't flicker him back to idle mid-run.
  const [playerMoving, setPlayerMoving] = useState(false)
  useEffect(() => {
    if ((playerLocation?.speed ?? 0) > MIN_TRUSTED_SPEED_MPS) {
      setPlayerMoving(true)
    }
    const settle = setTimeout(() => setPlayerMoving(false), 4000)
    return () => clearTimeout(settle)
  }, [playerLocation])

  async function refreshProfile() {
    try {
      const [profileData, myParcelsPage] = await Promise.all([
        getTerritoryProfile(),
        findMyParcels(1, 100),
      ])
      setProfile(profileData)
      setMyParcels(myParcelsPage?.content || [])
    } catch {
      // Leave whatever's already loaded in place - a background refresh
      // failing isn't worth surfacing as an error.
    }
  }

  async function refreshNearbyParcels() {
    try {
      const parcels = await findParcelsNear(
        playerLocation.lat,
        playerLocation.lng,
        VIEW_RADIUS_METERS
      )
      setNearbyParcels((parcels || []).map((p) => toDisplayParcel(p, user?.id)))
    } catch {
      // The map just shows no parcels for this view - not fatal.
    }
  }

  // ownedItems drives which avatar shows (equippedHero takes priority over
  // the free Blaze sprite/local avatar pick - see avatarSrc/
  // showBlazeHeroSprite below), not just the Shop tab's own equip/buy UI.
  // It used to only load lazily the first time the player opened Shop,
  // which meant the map/Me avatar could visibly change mid-session - Blaze's
  // sprite showing at first (ownedItems still empty, so no equippedHero to
  // find) and then flipping to a static image the moment Shop's data
  // happened to load. Fetching it upfront here means that decision is
  // correct and stable from the very first render instead of depending on
  // tab-visit order.
  async function refreshOwnedItems() {
    try {
      const owned = await getOwnedStoreItems()
      setOwnedItems(owned || [])
    } catch {
      // Equip state just isn't known yet - avatar picks fall back to the
      // free local avatar/Blaze sprite until this succeeds.
    }
  }

  // Loads once we roughly know where the player is - re-running on every
  // liveLocation tick would hammer the API on every GPS fix.
  useEffect(() => {
    if (locating || !isAuthed) return
    refreshProfile()
    refreshNearbyParcels()
    refreshOwnedItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locating, isAuthed])

  // Background music, looped for as long as the game is open. Browsers block
  // audio.play() before any user gesture on the page, so the first attempt
  // here (on mount) commonly rejects silently — a one-time listener on the
  // document retries it the moment the player taps/clicks anything at all,
  // which is the earliest a real gesture could exist.
  useEffect(() => {
    if (!isAuthed) return
    const audio = musicRef.current
    if (!audio) return
    audio.volume = 0.35
    audio.muted = musicMuted

    function tryPlay() {
      audio.play().catch(() => {})
    }
    tryPlay()

    document.addEventListener('pointerdown', tryPlay, { once: true })
    return () => document.removeEventListener('pointerdown', tryPlay)
  }, [isAuthed, musicMuted])

  function toggleMusicMuted() {
    setMusicMuted((prev) => {
      const next = !prev
      try {
        localStorage.setItem(MUSIC_MUTED_KEY, String(next))
      } catch {
        // Preference just won't persist past reload.
      }
      return next
    })
  }

  // Plays a rising chime every time a tracked run crosses a new 1km
  // multiple — lastMilestoneRef resets to 0 whenever tracking (re)starts so
  // a second run in the same session alerts from km 1 again, not wherever
  // the previous run left off.
  useEffect(() => {
    if (tracker.status !== 'tracking') {
      lastMilestoneRef.current = 0
      return
    }
    const reached = Math.floor(tracker.distance / MILESTONE_METERS)
    if (reached > lastMilestoneRef.current) {
      lastMilestoneRef.current = reached
      playMilestoneChime()
    }
  }, [tracker.status, tracker.distance])

  // Delegated click-to-sound: capture phase so it fires even for buttons
  // that stopPropagation() on their own click handler (e.g. LocateButton),
  // and one listener here covers every button in the page instead of
  // wiring a sound effect into each individual onClick.
  function handleGameClick(e) {
    const btn = e.target.closest('button')
    if (!btn || btn.disabled) return
    if (btn.classList.contains('game-menu-btn')) {
      playMenuSound()
    } else {
      playClickSound()
    }
  }

  async function loadLeaderboard() {
    setLeaderboardError(null)
    try {
      const page = await findIndividualLeaderboard(1, 20)
      setLeaderboard(page?.content || [])
    } catch (err) {
      setLeaderboardError(
        err instanceof ApiError
          ? err.message
          : 'Could not load the leaderboard.'
      )
    }
  }

  async function loadClubLeaderboard() {
    setLeaderboardError(null)
    try {
      const page = await findClubLeaderboard(1, 20)
      setClubLeaderboard(page?.content || [])
    } catch (err) {
      setLeaderboardError(
        err instanceof ApiError
          ? err.message
          : 'Could not load the club leaderboard.'
      )
    }
  }

  function switchLeaderboardMode(mode) {
    setLeaderboardMode(mode)
    if (mode === 'club' && clubLeaderboard.length === 0) loadClubLeaderboard()
    if (mode === 'individual' && leaderboard.length === 0) loadLeaderboard()
  }

  async function loadStore() {
    setStoreError(null)
    try {
      const [catalogPage, owned] = await Promise.all([
        getStoreCatalog(1, 50),
        getOwnedStoreItems(),
      ])
      setStoreCatalog(catalogPage?.content || [])
      setOwnedItems(owned || [])
    } catch (err) {
      setStoreError(
        err instanceof ApiError ? err.message : 'Could not load the shop.'
      )
    }
  }

  function openMenu(tab) {
    switchTab(tab)
    setMenuOpen(true)
    setRadialOpen(false)
  }

  async function loadCoinBundles() {
    setCoinBundlesError(null)
    try {
      const bundles = await getFahhcoinBundles()
      setCoinBundles(bundles || [])
    } catch (err) {
      setCoinBundlesError(
        err instanceof ApiError
          ? err.message
          : 'Could not load Fahhcoin packages.'
      )
    }
  }

  function openCoinShop() {
    setCoinBuyError(null)
    setCoinShopOpen(true)
    if (coinBundles.length === 0) loadCoinBundles()
  }

  async function handleBuyCoins(bundle) {
    setCoinBuyError(null)
    setBuyingBundleAmount(bundle.fahhcoinAmount)
    try {
      const payment = await initiateCoinPurchase(bundle.fahhcoinAmount)
      window.location.href = payment.paymentUrl
    } catch (err) {
      setCoinBuyError(
        err instanceof ApiError ? err.message : 'Could not start payment.'
      )
      setBuyingBundleAmount(null)
    }
  }

  // Territory runs are just runs with no eventId (see attemptSubmit below) —
  // getRuns() returns every run type, so this filters down to the ones this
  // game itself created rather than ones logged against an ENDURANCE event
  // elsewhere in the app (see TrackRunPanel.jsx).
  async function loadMyRuns() {
    try {
      // 30 comfortably covers filtering down to the 5 most recent territory runs even when
      // several of the newest raw records are event-linked runs from elsewhere in the app.
      const page = await getRuns(1, 30)
      const territoryRuns = (page?.content || [])
        .filter((r) => r.eventId == null)
        .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
        .slice(0, 5)
      setMyRuns(territoryRuns)
    } catch {
      // Leave whatever's already loaded in place - same as refreshProfile.
    }
  }

  // Fetches the one field the runs list doesn't carry - points - so the
  // share-card carousel (built for RunDetailPage, reused here as-is) has a
  // route to draw.
  async function handleViewRun(runId) {
    setLoadingRunId(runId)
    try {
      const detail = await getRun(runId)
      setViewingRun(detail)
    } catch {
      // Leave the list as-is; the row just stops showing a loading state.
    } finally {
      setLoadingRunId(null)
    }
  }

  function switchTab(tab) {
    setMenuTab(tab)
    if (tab === 'leaderboard' && leaderboard.length === 0) loadLeaderboard()
    if (tab === 'shop' && storeCatalog.length === 0) loadStore()
    if (tab === 'me' && myRuns.length === 0) loadMyRuns()
  }

  function handleStartRun() {
    setGpsErrorDismissed(false)
    tracker.start(null)
  }

  function handleCancelTracking() {
    tracker.stop()
    tracker.clearPendingRun()
  }

  // The territory info box closes itself after a few seconds (the Close
  // button still works). Each new tap sets a fresh object, restarting the
  // timer, and closing it also clears the map highlight, same as Close.
  useEffect(() => {
    if (!highlightedEntry) return
    const autoClose = setTimeout(() => setHighlightedEntry(null), 4000)
    return () => clearTimeout(autoClose)
  }, [highlightedEntry])

  // Tapping a claimed parcel directly on the map is a stronger signal than
  // tapping a leaderboard row (the player already has it in view), so this
  // skips the "view on map?" confirm dialog and goes straight to the same
  // highlight/focus toast the leaderboard flow produces.
  function handleParcelClick(parcel) {
    setHighlightedEntry({
      userId: parcel.ownerId,
      fullName: parcel.ownerName,
      areaSqMeters: parcel.area,
    })
  }

  // Tapping one of your own parcels in the "Me" tab list — same direct
  // highlight/focus flow as handleParcelClick above (no confirm dialog,
  // since picking a specific row is already an explicit choice), just
  // sourced from the paginated my-parcels list instead of the map.
  function handleViewMyParcel(territory) {
    setHighlightedEntry({
      userId: user?.id,
      fullName: user?.fullName,
      areaSqMeters: territory.area,
      // A merged territory's own id is synthetic (see mergeTouchingParcels)
      // - sourceIds[0] is a real parcel id the map can actually fly to and
      // match against, and since TerritoryMap highlights the whole merged
      // shape that id's parcel now belongs to, the visual result still
      // covers the entire merged territory, not just that one sub-parcel.
      parcelId: territory.sourceIds[0],
    })
    setMenuOpen(false)
  }

  function discardDraft() {
    tracker.clearPendingRun()
  }

  // Exports and saves the map-snapshot share card straight to the device —
  // no picker screen first. Athletes just finished a run and want the file,
  // not another UI to navigate; the other share-card styles (transparent
  // route, brand gradient) still live on the run's detail page for anyone
  // who wants to post it.
  // Distance/pace/time strip shown on every phase of the post-run toast —
  // the run's own stats, independent of whatever the territory-processing
  // phase (still checking / done / timed out) has to say.
  function renderCompletedRunStats() {
    if (!completedRun) return null
    return (
      <p className="game-claim-toast-run-stats">
        {formatDistance(completedRun.distance)} ·{' '}
        {formatPace(completedRun.avgPace)} ·{' '}
        {formatDuration(completedRun.duration)}
      </p>
    )
  }

  async function handleDownloadMap() {
    if (!completedRun) return
    setDownloadingMap(true)
    try {
      const blob = await exportShareCardBlob({
        points: completedRun.points,
        distance: completedRun.distance,
        duration: completedRun.duration,
        pace: completedRun.avgPace,
        variant: SHARE_VARIANTS.MAP,
        mimeType: 'image/jpeg',
        quality: 0.92,
      })
      downloadBlob(blob, `fahhkit-run-${completedRun.id}-map.jpg`)
    } finally {
      setDownloadingMap(false)
    }
  }

  async function attemptSubmit(pendingRun) {
    if (pendingRun.distance < MIN_VALID_RUN_DISTANCE_METERS) {
      setSaveError({
        title: "That's a warm-up, not a run 😅",
        message: `Only ${formatMeters(pendingRun.distance)} covered — runs need at least ${MIN_VALID_RUN_DISTANCE_METERS}m to count. Say fk it and go again.`,
      })
      return
    }
    if (pendingRun.duration < MIN_VALID_RUN_DURATION_SECONDS) {
      setSaveError({
        title: "That's a warm-up, not a run 😅",
        message: `Only ${formatDuration(pendingRun.duration)} on the clock — runs need at least ${MIN_VALID_RUN_DURATION_SECONDS}s to count. Say fk it and go again.`,
      })
      return
    }
    setSaving(true)
    setSaveError(null)
    const submittedAt = new Date()
    try {
      const created = await createRun({
        eventId: null,
        points: pendingRun.points,
        distance: pendingRun.distance,
        duration: pendingRun.duration,
        startedAt: toLocalDateTimeString(pendingRun.startedAt),
        endedAt: toLocalDateTimeString(pendingRun.endedAt),
      })
      setCompletedRun({
        id: created.id,
        points: pendingRun.points,
        distance: pendingRun.distance,
        duration: pendingRun.duration,
        avgPace: created.avgPace,
      })
      discardDraft()
      setSaving(false)
      pollForTerritoryResult(submittedAt)
    } catch (err) {
      // Deliberately not clearing the pending run - it stays saved (see
      // useRunTracker) so "Retry Save" works even after closing the app.
      setSaveError({
        title: "Couldn't save that run",
        message:
          err instanceof ApiError
            ? err.message
            : 'Could not save this run. Please try again.',
      })
      setSaving(false)
    }
  }

  async function pollForTerritoryResult(submittedAt) {
    setRunResult({ phase: 'processing' })
    for (let attempt = 0; attempt < RESULT_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, RESULT_POLL_DELAY_MS))
      try {
        const page = await findMyTerritoryEvents(1, 5)
        // A single run can produce more than one event in the same pass —
        // e.g. capturing a smaller rival parcel AND claiming the remainder
        // of the loop as new ground — so this collects every event from
        // this run, not just the newest one, rather than silently dropping
        // half the result.
        const fresh = (page?.content || []).filter(
          (event) => new Date(event.occurredAt) >= submittedAt
        )
        if (fresh.length > 0) {
          setRunResult({ phase: 'done', events: fresh })
          refreshProfile()
          refreshNearbyParcels()
          return
        }
      } catch {
        // A transient failure here shouldn't cut the wait short - just try again.
      }
    }
    setRunResult({ phase: 'timeout' })
    refreshProfile()
    refreshNearbyParcels()
  }

  async function handlePurchase(item) {
    setStoreActionError(null)
    try {
      await purchaseStoreItem(item.id)
      await loadStore()
      refreshProfile()
      setStoreChoice(null)
    } catch (err) {
      setStoreActionError(
        err instanceof ApiError ? err.message : 'Could not complete purchase.'
      )
    }
  }

  async function handleEquip(item, isEquipped) {
    setStoreActionError(null)
    try {
      if (isEquipped) {
        await unequipStoreItem(item.id)
      } else {
        await equipStoreItem(item.id)
      }
      await loadStore()
    } catch (err) {
      setStoreActionError(
        err instanceof ApiError ? err.message : 'Could not update that item.'
      )
    }
  }

  const isMyEntry = (entry) => entry.userId === user?.id
  const highlightedOwnerId = highlightedEntry?.userId ?? null
  const highlightHasVisibleParcels =
    highlightedEntry &&
    (highlightedEntry.parcelId
      ? nearbyParcels.some((p) => p.id === highlightedEntry.parcelId)
      : nearbyParcels.some((p) => p.ownerId === highlightedEntry.userId))

  const gpsStatusMessage =
    tracker.status === 'permission-denied'
      ? 'Location is turned off for this site — enable it in your browser settings, then try again.'
      : tracker.status === 'unsupported'
        ? 'Your browser doesn’t support GPS tracking.'
        : tracker.status === 'error'
          ? 'Could not get your location right now. Try again in a moment.'
          : null
  const showGpsError = Boolean(gpsStatusMessage) && !gpsErrorDismissed

  const pendingRun = tracker.pendingRun
  const draftArea = pendingRun ? polygonAreaSqMeters(pendingRun.points) : 0
  const draftPerimeter = pendingRun ? loopPerimeterMeters(pendingRun.points) : 0
  const draftLooksThin =
    pendingRun &&
    (pendingRun.points.length < LOOP_MIN_POINTS ||
      draftArea < LOOP_MIN_AREA_SQ_METERS)
  // Mirrors the backend's own closure-gap check (see
  // LOOP_CLOSURE_THRESHOLD_METERS) - a real GPS run only closes itself if the
  // runner physically ends up back near where they started. Flagging a wide
  // gap here immediately, right when the loop is ended, is more actionable
  // than only discovering it after the server silently doesn't count the run
  // as territory.
  const draftLoopOpen =
    pendingRun &&
    pendingRun.points.length >= 2 &&
    haversineDistance(
      pendingRun.points[0],
      pendingRun.points[pendingRun.points.length - 1]
    ) > LOOP_CLOSURE_THRESHOLD_METERS

  const currentAvatar = getAvatarById(avatarId)
  const currentMapStyle = getMapStyleById(mapStyleId)
  const currentAreaEmoji = getAreaEmojiById(areaEmojiId)
  // HERO is the one real Store category that's actually an avatar-shaped
  // image (the others are borders/colors/backgrounds meant to layer onto a
  // profile picture, not stand in for one) — equipping one takes priority
  // over the local placeholder picker below since it's a real, owned item.
  const equippedHero = ownedItems.find(
    (o) => o.equipped && o.storeItem.category === 'HERO'
  )
  const avatarSrc =
    (equippedHero && resolveFileUrl(equippedHero.storeItem.assetUrl)) ||
    currentAvatar?.src ||
    resolveFileUrl(user?.profilePictureUrl) ||
    defaultAvatarImage
  // Blaze is the one hero with an animated run-cycle sprite (HeroSprite)
  // instead of a flat image, whether it's the real equipped Store Hero or
  // just the free local avatars.js pick.
  const showBlazeHeroSprite = isBlazeHero(
    equippedHero ? equippedHero.storeItem.name : currentAvatar?.name
  )
  const equippedProfileBackground = ownedItems.find(
    (o) => o.equipped && o.storeItem.category === 'PROFILE_BACKGROUND'
  )
  const equippedPhrase = ownedItems.find(
    (o) => o.equipped && o.storeItem.category === 'PHRASE'
  )

  // TERRITORY_SHADE/TRAIL_COLOR are buy/equip-able like every other Store
  // category, but only take effect once threaded into TerritoryMap here -
  // falls back to the map's own defaults (PLAYER_COLOR / the hardcoded red
  // trail) when nothing's equipped.
  const equippedShade = ownedItems.find(
    (o) => o.equipped && o.storeItem.category === 'TERRITORY_SHADE'
  )?.storeItem.colorValue
  const equippedTrailColor = ownedItems.find(
    (o) => o.equipped && o.storeItem.category === 'TRAIL_COLOR'
  )?.storeItem.colorValue

  async function handleChooseAvatar(avatar) {
    setAvatarId(avatar.id)
    saveAvatarId(avatar.id)
    setAvatarChoice(null)
    // A free avatar and an equipped Store Hero both feed avatarSrc above,
    // with the Hero always winning - so picking a free avatar while one is
    // equipped would silently do nothing visually unless it's unequipped
    // here too (every account starts with a zero-cost "Default Hero"
    // equipped, so this fires the very first time anyone touches Avatar).
    if (equippedHero) {
      try {
        await unequipStoreItem(equippedHero.storeItem.id)
        await refreshOwnedItems()
      } catch {
        // The local avatar pick above still applies even if this background
        // cleanup call fails - not worth surfacing a separate error for it.
      }
    }
  }

  // Map style and area emoji are purely cosmetic/local, so unlike the avatar
  // picker (which can override a real owned Sticker) there's nothing to
  // confirm - clicking applies immediately.
  function handleChooseMapStyle(style) {
    setMapStyleId(style.id)
    saveMapStyleId(style.id)
  }

  function handleChooseAreaEmoji(areaEmoji) {
    setAreaEmojiId(areaEmoji.id)
    saveAreaEmojiId(areaEmoji.id)
  }

  // Territories, runs, and Fahhcoin are all tied to a real account server-side
  // — nothing here works signed out, so the game itself never renders until
  // login is confirmed. userLoading gates this so a page refresh with a still-
  // valid token doesn't flash the gate before useCurrentUser() resolves.
  if (!userLoading && !isAuthed) {
    return (
      <div className="game-page">
        <div className="game-confirm-overlay" style={{ position: 'fixed' }}>
          <div className="game-confirm-card">
            <p>
              Sign in to play Territory Run — claiming ground, GPS runs, and
              Fahhcoin are for logged-in athletes only.
            </p>
            <div className="game-confirm-actions">
              <Link to="/" className="btn btn-outline">
                Back to Home
              </Link>
              <Link to="/login" className="btn btn-primary">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="game-page"
      style={{ '--sheet-h': `${controlsHeight}px` }}
      onClickCapture={handleGameClick}
    >
      <audio
        ref={musicRef}
        src={`${import.meta.env.BASE_URL}audio/territory-theme.mp3`}
        loop
      />
      {!locating && (
        <TerritoryMap
          center={center}
          playerLocation={playerLocation}
          territories={nearbyParcels}
          livePath={tracker.path}
          currentUserId={user?.id}
          highlightOwnerId={highlightedOwnerId}
          highlightParcelId={highlightedEntry?.parcelId ?? null}
          avatarSrc={avatarSrc}
          playerHeading={playerHeading}
          playerColor={equippedShade}
          trailColor={equippedTrailColor}
          mapStyleUrl={currentMapStyle?.styleUrl}
          ambience={skyLoaded ? mapAmbience : null}
          blazeSprite={showBlazeHeroSprite}
          playerMoving={playerMoving}
          isNavigating={isNavigating}
          onParcelClick={handleParcelClick}
          onMapReady={handleMapReady}
        />
      )}

      {!gameReady && (
        <div className="game-loading-overlay">
          <img
            src={runConquestLogo}
            alt="Run Conquest"
            className="game-loading-logo"
          />
          <div className="game-loading-footer">
            <p className="game-loading-text">
              {locating
                ? 'Finding your location…'
                : !skyLoaded
                  ? 'Checking the sky…'
                  : 'Preparing your run…'}
            </p>
            <div className="game-loading-bar">
              <div
                className="game-loading-bar-fill"
                style={{ width: `${loadPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {profile?.level != null && (
        <button
          type="button"
          className="game-hud-level"
          aria-label={`Level ${profile.level} - view your territories`}
          onClick={() => {
            switchTab('me')
            setMenuOpen(true)
          }}
        >
          <span className="game-hud-level-badge">
            <span className="game-hud-level-num">{profile.level}</span>
          </span>
          <div className="game-hud-level-track">
            {user?.fullName && (
              <span className="game-hud-level-name">
                {user.fullName.split(' ')[0]}
              </span>
            )}
            <div className="game-hud-level-bar">
              <div
                className="game-hud-level-bar-fill"
                style={{
                  width: `${Math.round(levelProgress(profile.level, profile.xp ?? 0).pct * 100)}%`,
                }}
              />
            </div>
          </div>
        </button>
      )}

      <button
        type="button"
        className="game-mute-btn"
        onClick={toggleMusicMuted}
        aria-label={musicMuted ? 'Unmute music' : 'Mute music'}
      >
        {musicMuted ? <BsVolumeMuteFill /> : <BsVolumeUpFill />}
      </button>

      <div className="game-hud">
        <button
          type="button"
          className="game-hud-stat game-hud-stat-bar game-hud-stat-coin game-hud-stat-clickable"
          aria-label="Fahhcoin balance - buy more Fahhcoin"
          onClick={openCoinShop}
        >
          <span className="game-hud-value">
            {formatCoins(profile?.fahhcoinBalance ?? 0)}
          </span>
          <span className="game-hud-icon game-hud-icon-coin" />
        </button>
        <button
          type="button"
          className="game-hud-stat game-hud-stat-bar game-hud-stat-clickable"
          aria-label="Territories held - view your territories"
          onClick={() => {
            switchTab('me')
            setMenuOpen(true)
          }}
        >
          <span className="game-hud-value">
            {formatCoins(myTerritories.length)}
          </span>
          <span className="game-hud-icon game-hud-icon-flag">
            <FaFlag />
          </span>
        </button>
      </div>

      <AnimatePresence>
        {weatherHype && (
          <motion.button
            type="button"
            key="weather-hype"
            className={`game-weather-hype sky-${mapAmbience.sky}`}
            onClick={() => setWeatherHype(null)}
            aria-label={`${weatherHype.title}. ${weatherHype.line} Tap to dismiss.`}
            initial={{ opacity: 0, y: -40, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          >
            <span className="game-weather-hype-emoji" aria-hidden="true">
              {weatherHype.emoji}
            </span>
            <span className="game-weather-hype-body">
              <strong className="game-weather-hype-title">
                {weatherHype.title}
                {mapAmbience.temperature != null &&
                  ` · ${mapAmbience.temperature}°`}
              </strong>
              <span className="game-weather-hype-line">{weatherHype.line}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {territoryEntryBanner && (
          <motion.div
            key={territoryEntryBanner.ownerName}
            className="game-territory-entry-banner"
            initial={{ opacity: 0, y: -40, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          >
            <span className="game-territory-entry-banner-flag">🚩</span>
            <span className="game-territory-entry-banner-text">
              Entering <strong>{territoryEntryBanner.ownerName}</strong>
              &apos;s territory!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {radialOpen && (
        <div
          className="game-radial-scrim"
          onClick={() => setRadialOpen(false)}
        />
      )}

      <div className="game-fab-wrap">
        <AnimatePresence>
          {radialOpen &&
            RADIAL_ITEMS.map((item, i) => (
              <motion.div
                key={item.tab}
                className="game-radial-item"
                initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                animate={{ opacity: 1, scale: 1, x: item.x, y: item.y }}
                exit={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 24,
                  delay: i * 0.035,
                }}
              >
                <button
                  type="button"
                  className={`game-radial-btn radial-${item.tone}`}
                  onClick={() => {
                    if (item.tab === 'conquer') {
                      setRadialOpen(false)
                      handleStartRun()
                      return
                    }
                    openMenu(item.tab)
                  }}
                  aria-label={item.label}
                >
                  <item.Icon />
                </button>
              </motion.div>
            ))}
        </AnimatePresence>

        <button
          type="button"
          className={`game-menu-btn ${radialOpen ? 'is-open' : ''}`}
          onClick={() => setRadialOpen((open) => !open)}
          aria-label={radialOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={radialOpen}
        >
          <FaListUl />
        </button>
      </div>

      <div
        className={`game-controls${
          tracker.status === 'tracking' || pendingRun
            ? ''
            : ' game-controls-empty'
        }`}
        ref={controlsRef}
      >
        {tracker.status === 'tracking' && (
          <>
            <div className="game-controls-stats">
              <span className="game-stat">
                <span className="game-stat-value">
                  {formatMeters(displayedDistance)}
                </span>
                <span className="game-stat-label">Distance</span>
              </span>
              <span className="game-stat">
                <span className="game-stat-value">
                  {formatPace(
                    calculatePaceMinPerKm(
                      tracker.distance,
                      tracker.elapsedSeconds
                    )
                  )}
                </span>
                <span className="game-stat-label">Pace</span>
              </span>
              <span className="game-stat">
                <span className="game-stat-value">
                  {formatDuration(tracker.elapsedSeconds)}
                </span>
                <span className="game-stat-label">Time</span>
              </span>
            </div>
            <div className="game-controls-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => tracker.stop()}
              >
                End
              </button>
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={handleCancelTracking}
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              className="btn btn-outline game-view-toggle"
              onClick={() => setNavViewOn((on) => !on)}
            >
              {navViewOn ? 'Switch to Normal View' : 'Switch to Running View'}
            </button>
          </>
        )}

        {pendingRun && (
          <>
            <div className="game-controls-stats">
              <span>Loop area: {formatArea(draftArea)}</span>
              <span>Perimeter: {formatMeters(draftPerimeter)}</span>
            </div>
            <div className="game-controls-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => attemptSubmit(pendingRun)}
                disabled={saving}
              >
                {saving ? 'Submitting…' : 'Submit Run'}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={discardDraft}
                disabled={saving}
              >
                Discard
              </button>
            </div>
            {draftLoopOpen ? (
              <p className="game-controls-hint game-controls-hint-error">
                This loop isn&apos;t closed — your capture might not be complete
                since you didn&apos;t finish back where you started.
              </p>
            ) : (
              draftLooksThin && (
                <p className="game-controls-hint">
                  This loop looks short or small — the server may not count it
                  as closed territory. Bigger, cleanly closed loops score best.
                </p>
              )
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {saveError && (
          <motion.div
            className="game-claim-toast glass-card"
            initial={{ opacity: 0, x: '-50%', y: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: 20, scale: 0.9 }}
          >
            <h3>{saveError.title}</h3>
            <p>{saveError.message}</p>
            <div className="game-highlight-toast-actions">
              {pendingRun && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => attemptSubmit(pendingRun)}
                  disabled={saving}
                >
                  Retry Save
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setSaveError(null)}
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {runResult && (
          <motion.div
            className="game-claim-toast glass-card"
            initial={{ opacity: 0, x: '-50%', y: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: 20, scale: 0.9 }}
          >
            {runResult.phase === 'processing' && (
              <>
                <h3>Run submitted!</h3>
                {renderCompletedRunStats()}
                <p>Checking your territory…</p>
              </>
            )}
            {runResult.phase === 'done' &&
              (() => {
                const { title, totalArea } = summarizeRunEvents(
                  runResult.events
                )
                return (
                  <>
                    <h3>{title}</h3>
                    {renderCompletedRunStats()}
                    <p>
                      {formatArea(totalArea)} affected across{' '}
                      {runResult.events.length} update
                      {runResult.events.length === 1 ? '' : 's'}
                    </p>
                    <div className="game-claim-toast-actions">
                      {completedRun && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleDownloadMap}
                          disabled={downloadingMap}
                        >
                          {downloadingMap ? 'Preparing...' : 'Download Map'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setRunResult(null)}
                      >
                        Nice
                      </button>
                    </div>
                  </>
                )
              })()}
            {runResult.phase === 'timeout' && (
              <>
                <h3>Run saved!</h3>
                {renderCompletedRunStats()}
                <p>
                  If your loop closed cleanly, territory should show up here
                  shortly — check back in a bit if you don’t see it yet.
                </p>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRunResult(null)}
                >
                  OK
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {highlightedEntry && (
          <motion.div
            className="game-highlight-toast glass-card"
            initial={{ opacity: 0, x: '-50%', y: '-40%', scale: 0.9 }}
            animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: '-40%', scale: 0.9 }}
          >
            <h3>
              {isMyEntry(highlightedEntry)
                ? 'Your territory'
                : `${highlightedEntry.fullName}'s territory`}
            </h3>
            <p>{formatArea(highlightedEntry.areaSqMeters)} held</p>
            {!highlightHasVisibleParcels && (
              <p className="game-controls-hint">
                Nothing of theirs is in view right now — try exploring the map.
              </p>
            )}
            <div className="game-highlight-toast-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setHighlightedEntry(null)}
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="game-menu-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            <button
              type="button"
              className="game-menu-close"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <FaTimes />
            </button>

            <div className="game-menu-tabs">
              <button
                type="button"
                className={`game-menu-tab ${menuTab === 'leaderboard' ? 'active' : ''}`}
                onClick={() => switchTab('leaderboard')}
              >
                <FaTrophy />
                Leaderboard
              </button>
              <button
                type="button"
                className={`game-menu-tab ${menuTab === 'club' ? 'active' : ''}`}
                onClick={() => switchTab('club')}
              >
                <FaUsers />
                Club
              </button>
              <button
                type="button"
                className={`game-menu-tab ${menuTab === 'me' ? 'active' : ''}`}
                onClick={() => switchTab('me')}
              >
                <FaUser />
                Me
              </button>
              <button
                type="button"
                className={`game-menu-tab ${menuTab === 'shop' ? 'active' : ''}`}
                onClick={() => switchTab('shop')}
              >
                <FaStore />
                Shop
              </button>
            </div>

            {menuTab === 'leaderboard' && (
              <div className="game-menu-panel">
                <div className="game-menu-subtabs">
                  <button
                    type="button"
                    className={`game-menu-subtab ${leaderboardMode === 'individual' ? 'active' : ''}`}
                    onClick={() => switchLeaderboardMode('individual')}
                  >
                    Solo
                  </button>
                  <button
                    type="button"
                    className={`game-menu-subtab ${leaderboardMode === 'club' ? 'active' : ''}`}
                    onClick={() => switchLeaderboardMode('club')}
                  >
                    Club
                  </button>
                </div>

                {leaderboardMode === 'individual' ? (
                  leaderboardError ? (
                    <p className="game-menu-empty">{leaderboardError}</p>
                  ) : leaderboard.length === 0 ? (
                    <p className="game-menu-empty">
                      No territory claimed yet — be the first.
                    </p>
                  ) : (
                    <LeaderboardPodium
                      nameLabel="Runner"
                      entries={leaderboard.map((entry) => ({
                        key: entry.userId,
                        rank: entry.rank,
                        name: isMyEntry(entry) ? 'You' : entry.fullName,
                        area: formatArea(entry.areaSqMeters),
                        avatarSrc: isMyEntry(entry)
                          ? resolveFileUrl(user?.profilePictureUrl)
                          : null,
                        isPlayer: isMyEntry(entry),
                        onClick: () => setViewingProfile(entry),
                      }))}
                    />
                  )
                ) : leaderboardError ? (
                  <p className="game-menu-empty">{leaderboardError}</p>
                ) : clubLeaderboard.length === 0 ? (
                  <p className="game-menu-empty">
                    No club has claimed territory yet.
                  </p>
                ) : (
                  <LeaderboardPodium
                    nameLabel="Club"
                    entries={clubLeaderboard.map((entry) => ({
                      key: entry.clubId,
                      rank: entry.rank,
                      name: entry.clubName,
                      area: formatArea(entry.totalAreaSqMeters),
                      isPlayer: entry.clubName === profile?.clubName,
                    }))}
                  />
                )}
              </div>
            )}

            {menuTab === 'club' && (
              <div className="game-menu-panel">
                <ClubPanel
                  hasClub={Boolean(profile?.clubName)}
                  onClubChanged={refreshProfile}
                />
              </div>
            )}

            {menuTab === 'me' && (
              <div
                className="game-menu-panel"
                style={
                  equippedProfileBackground?.storeItem?.assetUrl
                    ? {
                        backgroundImage: `url(${resolveFileUrl(equippedProfileBackground.storeItem.assetUrl)})`,
                      }
                    : undefined
                }
              >
                <div className="game-menu-hero">
                  {showBlazeHeroSprite ? (
                    <HeroSprite size={260} />
                  ) : (
                    <img
                      className="game-menu-hero-img"
                      src={avatarSrc}
                      alt=""
                      onError={(e) => {
                        // avatarSrc can point at a server-hosted asset
                        // (equipped Hero / profile picture) that can fail to
                        // load - fall back to a bundled local image that
                        // can't 404 instead of leaving a broken-image glyph.
                        e.currentTarget.onerror = null
                        e.currentTarget.src =
                          currentAvatar?.src || defaultAvatarImage
                      }}
                    />
                  )}
                </div>
                <img
                  className="game-menu-profile-pic"
                  src={
                    resolveFileUrl(user?.profilePictureUrl) ||
                    defaultAvatarImage
                  }
                  alt=""
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = defaultAvatarImage
                  }}
                />
                {user?.fullName && (
                  <p className="game-menu-player-name">{user.fullName}</p>
                )}
                {equippedPhrase && (
                  <p className="game-menu-phrase">
                    “{equippedPhrase.storeItem.name}”
                  </p>
                )}
                {profile?.level != null &&
                  (() => {
                    const { into, span, pct } = levelProgress(
                      profile.level,
                      profile.xp ?? 0
                    )
                    return (
                      <>
                        <div className="game-level-track">
                          <span className="game-level-badge">
                            {profile.level}
                          </span>
                          <div className="game-xp-bar">
                            <div
                              className="game-xp-bar-fill"
                              style={{ width: `${Math.round(pct * 100)}%` }}
                            >
                              <span className="game-xp-bar-marker" />
                            </div>
                          </div>
                        </div>
                        <span className="game-xp-bar-text">
                          {into} / {span} XP
                        </span>
                      </>
                    )
                  })()}
                <div className="game-menu-summary">
                  <span className="game-menu-summary-value">
                    {formatArea(profile?.totalAreaSqMeters)}
                  </span>
                  <span
                    className="game-menu-parcel-flags"
                    aria-label={`${myTerritories.length} territor${myTerritories.length === 1 ? 'y' : 'ies'} held (each flag = ${PARCELS_PER_FLAG})`}
                    title={`Each flag = ${PARCELS_PER_FLAG} territories`}
                  >
                    {Array.from({
                      length: Math.min(
                        Math.ceil(myTerritories.length / PARCELS_PER_FLAG),
                        8
                      ),
                    }).map((_, i) => (
                      <FaFlag key={i} />
                    ))}
                    {myTerritories.length > 8 * PARCELS_PER_FLAG && (
                      <span className="game-menu-parcel-flags-more">
                        +{myTerritories.length - 8 * PARCELS_PER_FLAG}
                      </span>
                    )}
                  </span>
                  {profile?.clubName && (
                    <span className="game-menu-summary-label">
                      {profile.clubName}
                    </span>
                  )}
                </div>
                <p className="game-menu-section-title">My Territories</p>
                {myTerritories.length === 0 ? (
                  <p className="game-menu-empty">
                    Finish a GPS run that closes a loop to see territory here.
                  </p>
                ) : (
                  <ul className="game-menu-list">
                    {[...myTerritories]
                      .sort((a, b) => b.area - a.area)
                      .map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="game-menu-list-row"
                            onClick={() => handleViewMyParcel(t)}
                          >
                            <span className="game-menu-list-area">
                              {currentAreaEmoji?.emoji} {formatArea(t.area)}
                            </span>
                            <span className="game-menu-list-meta">
                              score {Math.round(t.currentScore || 0)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}

                <p className="game-menu-section-title">History</p>
                {myRuns.length === 0 ? (
                  <p className="game-menu-empty">
                    Finish a GPS run to see its map here.
                  </p>
                ) : (
                  <ul className="game-menu-list">
                    {myRuns.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="game-menu-list-row"
                          onClick={() => handleViewRun(r.id)}
                          disabled={loadingRunId === r.id}
                        >
                          <span className="game-menu-list-area">
                            {formatRunDate(r.startedAt)}
                          </span>
                          <span className="game-menu-list-meta">
                            {loadingRunId === r.id
                              ? 'Loading…'
                              : `${formatDistance(r.distance)} · ${formatDuration(r.duration)}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {menuTab === 'shop' && (
              <div className="game-menu-panel game-menu-shop">
                <p className="game-menu-avatars-title game-menu-avatars-title-centered">
                  Avatar
                </p>
                <div className="game-menu-avatar-grid">
                  {AVATARS.map((avatar) => {
                    // A purchased Store Hero always wins over a free local
                    // avatar pick (see avatarSrc above) - showing this card
                    // as "Equipped" while a real Hero is actually in effect
                    // would disagree with what the map/Me tab actually show.
                    const isSelected = avatar.id === avatarId && !equippedHero
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        className={`game-menu-avatar-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setAvatarChoice(avatar)}
                        disabled={isSelected}
                      >
                        <img src={avatar.src} alt={avatar.name} />
                        <span className="game-menu-avatar-name">
                          {avatar.name}
                        </span>
                        <span className="game-menu-avatar-tag">
                          {isSelected ? (
                            <>
                              <FaCheck /> Equipped
                            </>
                          ) : (
                            'Free'
                          )}
                        </span>
                      </button>
                    )
                  })}
                  {COMING_SOON_AVATARS.map((avatar) => (
                    <div
                      key={avatar.id}
                      className="game-menu-avatar-card is-locked"
                    >
                      <img src={avatar.src} alt={avatar.name} />
                      <span className="game-menu-avatar-name">
                        {avatar.name}
                      </span>
                      <span className="game-menu-avatar-tag">
                        <FaLock /> Coming Soon
                      </span>
                    </div>
                  ))}
                </div>
                <p className="game-menu-avatars-title game-menu-avatars-title-centered">
                  Map
                </p>
                <div className="game-menu-avatar-grid">
                  {MAP_STYLES.map((style) => {
                    const isSelected = style.id === mapStyleId
                    return (
                      <button
                        key={style.id}
                        type="button"
                        className={`game-menu-avatar-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleChooseMapStyle(style)}
                        disabled={isSelected}
                      >
                        <span className="game-menu-avatar-name">
                          {style.name}
                        </span>
                        <span className="game-menu-avatar-tag">
                          {isSelected ? (
                            <>
                              <FaCheck /> Selected
                            </>
                          ) : (
                            'Free'
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <p className="game-menu-avatars-title game-menu-avatars-title-centered">
                  Emoji
                </p>
                <div className="game-menu-avatar-grid">
                  {AREA_EMOJIS.map((emoji) => {
                    const isSelected = emoji.id === areaEmojiId
                    return (
                      <button
                        key={emoji.id}
                        type="button"
                        className={`game-menu-avatar-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleChooseAreaEmoji(emoji)}
                        disabled={isSelected}
                      >
                        <span className="game-menu-emoji-glyph">
                          {emoji.emoji}
                        </span>
                        <span className="game-menu-avatar-name">
                          {emoji.label}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {storeError ? (
                  <p className="game-menu-empty">{storeError}</p>
                ) : storeCatalog.length === 0 ? (
                  <>
                    <FaStore className="game-menu-shop-icon" />
                    <p className="game-menu-shop-title">
                      Nothing in the shop yet
                    </p>
                  </>
                ) : (
                  <ul className="game-menu-list game-store-list">
                    {storeCatalog.map((item) => {
                      const owned = ownedItems.find(
                        (o) => o.storeItem.id === item.id
                      )
                      return (
                        <li key={item.id} className="game-store-item">
                          <span
                            className="game-store-item-swatch"
                            style={
                              item.colorValue
                                ? { background: item.colorValue }
                                : undefined
                            }
                          >
                            {item.assetUrl && (
                              <img
                                src={resolveFileUrl(item.assetUrl)}
                                alt={item.name}
                                onError={(e) => {
                                  // Same broken-asset-URL issue as the Hero
                                  // avatar (see buildPlayerMarkerIcon) - hide
                                  // the swatch image instead of leaving a
                                  // broken-image glyph in the shop list.
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            )}
                          </span>
                          <span className="game-store-item-info">
                            <span className="game-menu-list-area">
                              {item.name}
                            </span>
                            <span className="game-menu-list-meta">
                              {owned
                                ? owned.equipped
                                  ? item.category === 'HERO'
                                    ? 'Equipped · your map avatar'
                                    : 'Equipped'
                                  : 'Owned'
                                : item.priceFahhcoin > 0
                                  ? `${item.priceFahhcoin} Fahhcoin`
                                  : 'Free'}
                            </span>
                          </span>
                          {owned ? (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => handleEquip(item, owned.equipped)}
                            >
                              {owned.equipped ? (
                                'Unequip'
                              ) : (
                                <>
                                  <FaCheck /> Equip
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => setStoreChoice(item)}
                            >
                              Buy
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {storeActionError && (
                  <p className="game-controls-hint game-controls-hint-error">
                    {storeActionError}
                  </p>
                )}
                <p className="game-menu-shop-balance">
                  <FaCoins />
                  {profile?.fahhcoinBalance ?? 0} Fahhcoin
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingProfile && (
          <AthleteTerritoryProfilePanel
            userId={viewingProfile.userId}
            fullName={
              isMyEntry(viewingProfile) ? 'You' : viewingProfile.fullName
            }
            areaEmoji={currentAreaEmoji?.emoji}
            onClose={() => setViewingProfile(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingRun && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewingRun(null)}
          >
            <motion.div
              className="game-run-viewer"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="game-run-viewer-close"
                aria-label="Close"
                onClick={() => setViewingRun(null)}
              >
                <FaTimes />
              </button>
              <ShareRunCarousel run={viewingRun} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGpsError && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGpsErrorDismissed(true)}
          >
            <motion.div
              className="game-confirm-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p>{gpsStatusMessage}</p>
              <div className="game-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setGpsErrorDismissed(true)}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartRun}
                >
                  Try Again
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {coinShopOpen && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCoinShopOpen(false)}
          >
            <motion.div
              className="game-confirm-card game-coin-shop-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="game-run-viewer-close"
                aria-label="Close"
                onClick={() => setCoinShopOpen(false)}
              >
                <FaTimes />
              </button>
              <p className="game-menu-avatars-title">Buy Fahhcoin</p>
              {coinBundlesError ? (
                <p className="game-menu-empty">{coinBundlesError}</p>
              ) : coinBundles.length === 0 ? (
                <p className="game-menu-empty">Loading packages…</p>
              ) : (
                <ul className="game-menu-list game-coin-bundle-list">
                  {coinBundles.map((bundle) => (
                    <li key={bundle.fahhcoinAmount} className="game-store-item">
                      <span className="game-hud-icon game-hud-icon-coin" />
                      <span className="game-store-item-info">
                        <span className="game-menu-list-area">
                          {bundle.fahhcoinAmount} Fahhcoin
                        </span>
                        <span className="game-menu-list-meta">
                          Rs. {bundle.priceNpr}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => handleBuyCoins(bundle)}
                        disabled={buyingBundleAmount === bundle.fahhcoinAmount}
                      >
                        {buyingBundleAmount === bundle.fahhcoinAmount
                          ? 'Redirecting…'
                          : 'Buy'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {coinBuyError && (
                <p className="game-controls-hint game-controls-hint-error">
                  {coinBuyError}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {storeChoice && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setStoreChoice(null)}
          >
            <motion.div
              className="game-confirm-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p>
                {storeChoice.priceFahhcoin > 0
                  ? `Buy ${storeChoice.name} for ${storeChoice.priceFahhcoin} Fahhcoin?`
                  : `Unlock ${storeChoice.name} for free?`}
              </p>
              <div className="game-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setStoreChoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handlePurchase(storeChoice)}
                >
                  Buy
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {avatarChoice && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAvatarChoice(null)}
          >
            <motion.div
              className="game-confirm-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p>Set this avatar?</p>
              <div className="game-avatar-confirm-compare">
                <div className="game-avatar-confirm-option">
                  <img src={currentAvatar?.src || defaultAvatarImage} alt="" />
                  <span>{currentAvatar?.name || 'Current'}</span>
                </div>
                <span className="game-avatar-confirm-arrow">→</span>
                <div className="game-avatar-confirm-option">
                  <img src={avatarChoice.src} alt={avatarChoice.name} />
                  <span>{avatarChoice.name}</span>
                </div>
              </div>
              <div className="game-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAvatarChoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleChooseAvatar(avatarChoice)}
                >
                  Set This Avatar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
