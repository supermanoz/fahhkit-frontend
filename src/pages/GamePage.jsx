import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FaCheck,
  FaChevronDown,
  FaCoins,
  FaEnvelope,
  FaFlag,
  FaListUl,
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
import { useGameSocket } from '../hooks/useGameSocket'
import { useMailbox } from '../hooks/useMailbox'
import { usePvp } from '../hooks/usePvp'
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
import { getMyClub, inviteToClub } from '../api/club'
import { getPvpModeByMeters } from '../api/pvp'
import {
  equipStoreItem,
  findHeroes,
  getHero,
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
import {
  describeHeroAbility,
  isBlazeHero,
  isPlaceholderHero,
} from '../utils/hero'
import HeroSprite from '../components/HeroSprite'
import ClubPanel from '../components/ClubPanel'
import MailPanel from '../components/MailPanel'
import PvpPanel from '../components/PvpPanel'
import HeroGallery from '../components/HeroGallery'
import HeroDetailModal from '../components/HeroDetailModal'
import { GiSpartanHelmet } from 'react-icons/gi'
import { RaceTabIcon } from '../components/CrossedSwordsIcon'
import IdleNudge from '../components/IdleNudge'
import LeaderboardPodium from '../components/LeaderboardPodium'
import defaultAvatarImage from '../assets/images/player-avatar-blaze.png'
import runConquestLogo from '../assets/images/run-conquest-logo.png'
// TEMP: AVATARS / COMING_SOON_AVATARS / loadAvatarId return with the
// Shop's Avatar picker (see avatarId below).
import { getAvatarById, saveAvatarId } from '../constants/avatars'
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

// How the server processed a run (RunScoreBreakdownResponse, pushed over the
// socket - see useGameSocket). SUCCESS still goes through the territory-event
// summary below; these are the "no territory, here's why" cases, which used
// to just look like a silent timeout.
const RUN_REJECTION_COPY = {
  CHEAT_DETECTED: {
    title: 'Whoa there, speedster 🛵',
    message:
      "That pace looked more scooter than sneakers, so this one didn't count for territory.",
  },
  NOT_ENOUGH_POINTS: {
    title: 'GPS lost the plot 📡',
    message:
      'Not enough location fixes came through to draw your loop. Keep the game open while you run and try again.',
  },
  LOOP_NOT_CLOSED: {
    title: 'So close, loop-wise 🔁',
    message:
      'Your route never made it back near the start. Finish where you began to seal the territory.',
  },
  AREA_TOO_SMALL: {
    title: 'Cozy, but tiny 🏠',
    message: `That loop didn't enclose enough ground. Territory needs at least ${LOOP_MIN_AREA_SQ_METERS.toLocaleString()} m² inside it, so go bigger.`,
  },
  INVALID_GEOMETRY_AFTER_REPAIR: {
    title: 'That shape broke geometry 🥨',
    message:
      'Your route crossed itself too many times to make a valid territory. A cleaner loop will do it.',
  },
}

function describeRunRejection(outcome) {
  if (!outcome || outcome.outcome === 'SUCCESS') return null
  const key =
    outcome.outcome === 'CHEAT_DETECTED'
      ? 'CHEAT_DETECTED'
      : outcome.rejectionReason || 'LOOP_NOT_CLOSED'
  return (
    RUN_REJECTION_COPY[key] || {
      title: 'No territory this time',
      message: outcome.message || 'This run did not count as territory.',
    }
  )
}

const PVP_ALERT_COPY = {
  matched: {
    title: 'Rival found! ⚔️',
    line: 'Confirm the race to lock in stakes.',
  },
  received: {
    title: 'You got called out 🫵',
    line: 'Someone nearby wants to race you.',
  },
  started: { title: 'Race is ON 🏁', line: 'Stakes locked. Go run it.' },
  resolved: {
    title: 'Race results are in 🏆',
    line: 'Tap to see who took the pot.',
  },
  expired: {
    title: 'Queue timed out ⌛',
    line: 'Nobody bit this time. Try again?',
  },
}

// Idle nudge: pops Blaze up to egg the player on after this long with no
// taps/keys and no movement on the map; after "Not now" it waits longer
// before trying again so it doesn't nag.
const IDLE_NUDGE_MS = 7 * 1000
const IDLE_NUDGE_SNOOZE_MS = 3 * 60 * 1000

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
  const [heroes, setHeroes] = useState([])
  const [heroesLoading, setHeroesLoading] = useState(false)
  // Id, not the object, so the modal picks up the refreshed hero after an
  // equip reloads the roster.
  const [selectedHeroId, setSelectedHeroId] = useState(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuTab, setMenuTab] = useState('me')
  const [radialOpen, setRadialOpen] = useState(false)
  const [tabPickerOpen, setTabPickerOpen] = useState(false)

  const [highlightedEntry, setHighlightedEntry] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [storeChoice, setStoreChoice] = useState(null)
  // TEMP: Blaze for everyone for now - the Avatar picker is hidden from the
  // Shop (Heroes tab replaces it), so an old saved pick would be stuck with
  // no way to change it. Restore `loadAvatarId() || AVATARS[0].id` when
  // the picker comes back.
  const [avatarId, setAvatarId] = useState(() => getAvatarById('blaze').id)
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

  const mailbox = useMailbox()
  const pvp = usePvp({ userId: isAuthed ? user?.id : null, playerLocation })

  // Run-processing outcomes pushed over the socket, keyed by run id - the
  // push can land before OR after createRun() resolves, so it's parked here
  // and checked from both sides (onRunProcessed and attemptSubmit).
  const runOutcomesRef = useRef({})
  // The run whose result toast is currently showing; once its outcome is
  // known, the territory-event poll for it stops early.
  const watchedRunIdRef = useRef(null)
  const settledRunIdRef = useRef(null)

  function showRunOutcome(outcome) {
    const rejection = describeRunRejection(outcome)
    if (!rejection) return false
    settledRunIdRef.current = outcome.runId
    setRunResult({ phase: 'rejected', ...rejection })
    refreshProfile()
    return true
  }

  useGameSocket(isAuthed ? user?.id : null, {
    onRunProcessed: (outcome) => {
      runOutcomesRef.current[outcome.runId] = outcome
      if (outcome.runId === watchedRunIdRef.current) showRunOutcome(outcome)
    },
    onMail: mailbox.receiveMail,
    onBroadcastMail: mailbox.receiveBroadcast,
    onPvp: (eventName, payload) => {
      pvp.handlePush(eventName, payload)
      // Stakes move on accept, payouts on resolve.
      if (
        eventName === 'pvp-challenge-resolved' ||
        eventName === 'pvp-challenge-reviewed'
      ) {
        refreshProfile()
      }
    },
  })

  useEffect(() => {
    if (!pvp.alert) return
    const hide = setTimeout(pvp.clearAlert, 7000)
    return () => clearTimeout(hide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvp.alert])

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

  // Drives Blaze's idle vs. running sprite on the map. A phone sitting on a
  // table (or being waved around in a hand) still produces GPS fixes that
  // drift a few metres and can report small speeds, so a single fast-ish
  // reading is NOT enough. Blaze only runs when the movement looks like a
  // real run/jog, confirmed two ways at once:
  //   1. the device's own reported speed is at jogging pace on at least two
  //      of the recent fixes (not a one-off spike), and
  //   2. the player has actually covered ground: straight-line distance
  //      over the recent window beats both a minimum AND the fixes' own
  //      accuracy margin, so drift inside the GPS error circle never counts.
  // Fixes with poor accuracy are ignored entirely. Once running, it holds
  // for a few seconds so a missed/slow fix mid-run doesn't flicker him
  // back to idle.
  const RUN_ANIM_MIN_SPEED_MPS = 1.8 // ~9:15 min/km - a slow jog
  const RUN_ANIM_MAX_ACCURACY_M = 25
  const RUN_ANIM_WINDOW_MS = 12000
  const RUN_ANIM_MIN_DISPLACEMENT_M = 8
  const RUN_ANIM_HOLD_MS = 3000
  const recentFixesRef = useRef([])
  const lastRunningAtRef = useRef(0)
  const [playerMoving, setPlayerMoving] = useState(false)
  useEffect(() => {
    const fix = playerLocation
    if (
      !fix ||
      fix.accuracy == null ||
      fix.accuracy > RUN_ANIM_MAX_ACCURACY_M
    ) {
      return
    }
    const now = Date.now()
    const recent = [
      ...recentFixesRef.current.filter((f) => now - f.at <= RUN_ANIM_WINDOW_MS),
      { ...fix, at: now },
    ]
    recentFixesRef.current = recent

    const fastFixes = recent.filter(
      (f) => (f.speed ?? 0) >= RUN_ANIM_MIN_SPEED_MPS
    ).length
    const first = recent[0]
    const covered = recent.length > 1 ? haversineDistance(first, fix) : 0
    const elapsedS = (now - first.at) / 1000
    // The larger of the two error circles, not their sum - summing made a
    // real slow jog on average GPS (±15m) need 30m in one window.
    const noiseFloor = Math.max(first.accuracy || 0, fix.accuracy || 0)
    const coveredRealGround =
      covered >= Math.max(RUN_ANIM_MIN_DISPLACEMENT_M, noiseFloor) &&
      elapsedS > 0 &&
      covered / elapsedS >= RUN_ANIM_MIN_SPEED_MPS * 0.7
    // Some browsers never report speed - then ground covered alone decides.
    const speedReported = recent.some((f) => f.speed != null)
    const running = coveredRealGround && (!speedReported || fastFixes >= 2)

    if (!running) return
    lastRunningAtRef.current = now
    setPlayerMoving(true)
  }, [playerLocation])

  // Drops back to idle once nothing has qualified as running for
  // RUN_ANIM_HOLD_MS - whether fixes stopped arriving or keep arriving slow.
  useEffect(() => {
    if (!playerMoving) return
    const check = setInterval(() => {
      if (Date.now() - lastRunningAtRef.current > RUN_ANIM_HOLD_MS) {
        setPlayerMoving(false)
      }
    }, 500)
    return () => clearInterval(check)
  }, [playerMoving])

  const [idleNudgeOpen, setIdleNudgeOpen] = useState(false)
  const idleDelayRef = useRef(IDLE_NUDGE_MS)
  // Only nag when it makes sense: game on screen, nothing running or
  // waiting to submit, no menu/sheet/toast in the way.
  const canNudge =
    gameReady &&
    tracker.status !== 'tracking' &&
    !tracker.pendingRun &&
    !menuOpen &&
    !radialOpen &&
    !coinShopOpen &&
    !viewingProfile &&
    !runResult &&
    !saveError &&
    !playerMoving
  useEffect(() => {
    if (!canNudge) {
      setIdleNudgeOpen(false)
      return
    }
    if (idleNudgeOpen) return
    let timer
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setIdleNudgeOpen(true), idleDelayRef.current)
    }
    arm()
    const events = ['pointerdown', 'keydown', 'wheel', 'touchmove']
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [canNudge, idleNudgeOpen])

  function dismissIdleNudge() {
    idleDelayRef.current = IDLE_NUDGE_SNOOZE_MS
    setIdleNudgeOpen(false)
  }

  function runFromIdleNudge() {
    idleDelayRef.current = IDLE_NUDGE_MS
    setIdleNudgeOpen(false)
    handleStartRun()
  }

  function battleFromIdleNudge() {
    idleDelayRef.current = IDLE_NUDGE_MS
    setIdleNudgeOpen(false)
    openMenu('race')
  }

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
    mailbox.refresh()
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
    loadHeroes()
  }

  // The roster list has no abilities on it, only the per-hero detail does -
  // fine to fan out since it's a handful of heroes, and a failure just
  // leaves the Heroes tab empty.
  async function loadHeroes() {
    setHeroesLoading(true)
    try {
      const page = await findHeroes(1, 20)
      const roster = (page?.content || []).filter((h) => h.active !== false)
      const details = await Promise.all(
        roster.map((h) => getHero(h.id).catch(() => h))
      )
      setHeroes(details)
    } catch {
      setHeroes([])
    } finally {
      setHeroesLoading(false)
    }
  }

  // Leaders/co-leaders can invite players they find on the leaderboard.
  const canInviteToClub =
    profile?.clubRole === 'LEADER' || profile?.clubRole === 'CO_LEADER'

  async function handleInviteToClub(targetUserId) {
    const club = await getMyClub()
    if (!club) throw new Error("You're not in a club anymore.")
    await inviteToClub(club.id, targetUserId)
  }

  function handleMailClaimed(item) {
    if (item.type === 'STORE_ITEM_GRANT') {
      refreshOwnedItems()
      if (storeCatalog.length > 0) loadStore()
    }
    if (item.type === 'CLUB_INVITE') refreshProfile()
  }

  function handleStartRace(challenge) {
    setMenuOpen(false)
    setGpsErrorDismissed(false)
    tracker.start(null, { challengeId: challenge.id })
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
    // loadStore also loads the heroes, plus owned items for their badges.
    if (tab === 'heroes' && heroes.length === 0) loadStore()
    if (tab === 'me' && myRuns.length === 0) loadMyRuns()
    if (tab === 'mail') mailbox.refresh()
    if (tab === 'race') pvp.refreshChallenges()
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
        challengeId: pendingRun.challengeId || undefined,
      })
      if (pendingRun.challengeId) pvp.refreshChallenges()
      setCompletedRun({
        id: created.id,
        isRace: Boolean(pendingRun.challengeId),
        points: pendingRun.points,
        distance: pendingRun.distance,
        duration: pendingRun.duration,
        avgPace: created.avgPace,
      })
      discardDraft()
      setSaving(false)
      pollForTerritoryResult(submittedAt, created.id)
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

  async function pollForTerritoryResult(submittedAt, runId) {
    watchedRunIdRef.current = runId
    settledRunIdRef.current = null
    setRunResult({ phase: 'processing' })
    const early = runOutcomesRef.current[runId]
    if (early && showRunOutcome(early)) return
    for (let attempt = 0; attempt < RESULT_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, RESULT_POLL_DELAY_MS))
      // The socket already told us it's a no-territory run - stop polling.
      if (settledRunIdRef.current === runId) return
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
    if (settledRunIdRef.current === runId) return
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

  const galleryHeroes = heroes.filter((h) => !isPlaceholderHero(h.name))
  // HERO is the one real Store category that's actually an avatar-shaped
  // image (the others are borders/colors/backgrounds meant to layer onto a
  // profile picture, not stand in for one) — equipping one takes priority
  // over the local placeholder picker below since it's a real, owned item.
  // TEMP: the backend's placeholder "Default Hero" doesn't count - see
  // isPlaceholderHero - so new players land on Blaze.
  // Declared up here (not next to currentAvatar) because activeHeroId reads
  // it — using it any earlier is a TDZ crash that blanks the whole page.
  const equippedHero = ownedItems.find(
    (o) =>
      o.equipped &&
      o.storeItem.category === 'HERO' &&
      !isPlaceholderHero(o.storeItem.name)
  )
  // The hero the player is actually playing as: an equipped Store Hero,
  // else Blaze (the default).
  const activeHeroId = equippedHero
    ? equippedHero.storeItem.heroId
    : heroes.find((h) => isBlazeHero(h.name))?.id
  const selectedHero = selectedHeroId
    ? heroes.find((h) => h.id === selectedHeroId) || null
    : null
  const closeHeroModal = useCallback(() => setSelectedHeroId(null), [])

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

  const menuTabs = [
    { id: 'leaderboard', label: 'Leaderboard', Icon: FaTrophy, tone: 'gold' },
    { id: 'club', label: 'Club', Icon: FaUsers, tone: 'green' },
    {
      id: 'race',
      label: 'Race',
      Icon: RaceTabIcon,
      tone: 'battle',
      badge: pvp.actionCount > 0 ? String(pvp.actionCount) : null,
    },
    {
      id: 'mail',
      label: 'Mail',
      Icon: FaEnvelope,
      tone: 'stone',
      badge:
        mailbox.unreadCount > 0
          ? mailbox.unreadCount > 9
            ? '9+'
            : String(mailbox.unreadCount)
          : null,
    },
    { id: 'me', label: 'Me', Icon: FaUser, tone: 'green' },
    { id: 'heroes', label: 'Heroes', Icon: GiSpartanHelmet, tone: 'red' },
    { id: 'shop', label: 'Shop', Icon: FaStore, tone: 'wood' },
  ]
  const activeMenuTab = menuTabs.find((t) => t.id === menuTab) || menuTabs[0]
  // Collapsed picker shows one dot summing what's waiting on other tabs.
  const otherTabsBadgeCount =
    (menuTab === 'race' ? 0 : pvp.actionCount) +
    (menuTab === 'mail' ? 0 : mailbox.unreadCount)

  // Live PvP race this tracked run counts for, if any.
  const raceChallenge = tracker.challengeId
    ? pvp.challenges.find((c) => c.id === tracker.challengeId) || null
    : null
  const raceProgress = raceChallenge?.distanceMeters
    ? tracker.distance / raceChallenge.distanceMeters
    : 0
  const raceModeLabel = raceChallenge
    ? getPvpModeByMeters(raceChallenge.distanceMeters)?.label ||
      formatMeters(raceChallenge.distanceMeters)
    : ''
  const raceOpponentName = raceChallenge
    ? raceChallenge.challengerId === user?.id
      ? raceChallenge.opponentName
      : raceChallenge.challengerName
    : ''

  const currentAvatar = getAvatarById(avatarId)
  const currentMapStyle = getMapStyleById(mapStyleId)
  const currentAreaEmoji = getAreaEmojiById(areaEmojiId)
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
        <div className="game-loading-overlay">
          <img
            src={runConquestLogo}
            alt="Run Conquest"
            className="game-loading-logo"
          />
          <div className="game-loading-footer game-loading-footer--gate">
            <p className="game-loading-text">
              Sign in to play Territory Run — claiming ground, GPS runs, and
              Fahhcoin are for logged-in athletes only.
            </p>
            <div className="game-confirm-actions">
              <Link to="/" className="btn btn-outline">
                Back to Home
              </Link>
              <Link
                to="/login"
                state={{ from: '/game' }}
                className="btn btn-primary"
              >
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

      {raceChallenge && tracker.status === 'tracking' && (
        <div
          className={`pvp-race-hud ${raceProgress >= 1 ? 'is-done' : ''}`}
          role="status"
        >
          {raceProgress >= 1
            ? `🏁 ${raceModeLabel} done! Hit End and submit your race.`
            : `⚡ Race vs ${raceOpponentName} · ${formatMeters(
                Math.max(0, raceChallenge.distanceMeters - tracker.distance)
              )} to go`}
          <div className="pvp-race-hud-bar">
            <div
              className="pvp-race-hud-fill"
              style={{ width: `${Math.min(100, raceProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {pvp.alert && PVP_ALERT_COPY[pvp.alert.kind] && (
          <motion.button
            type="button"
            key={`pvp-${pvp.alert.kind}-${pvp.alert.challenge?.id || ''}`}
            className="game-weather-hype game-pvp-alert"
            onClick={() => {
              pvp.clearAlert()
              openMenu('race')
            }}
            initial={{ opacity: 0, y: -40, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          >
            <span className="game-weather-hype-emoji" aria-hidden="true">
              ⚔️
            </span>
            <span className="game-weather-hype-body">
              <strong className="game-weather-hype-title">
                {PVP_ALERT_COPY[pvp.alert.kind].title}
              </strong>
              <span className="game-weather-hype-line">
                {PVP_ALERT_COPY[pvp.alert.kind].line}
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {idleNudgeOpen && (
          <IdleNudge
            key="idle-nudge"
            onRun={runFromIdleNudge}
            onBattle={battleFromIdleNudge}
            onDismiss={dismissIdleNudge}
          />
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
                {completedRun?.isRace && (
                  <p className="game-controls-hint">
                    🏁 Race time logged. Results land once your rival runs too.
                    Check the Race tab.
                  </p>
                )}
              </>
            )}
            {runResult.phase === 'rejected' && (
              <>
                <h3>{runResult.title}</h3>
                {renderCompletedRunStats()}
                <p>{runResult.message}</p>
                {completedRun?.isRace && (
                  <p className="game-controls-hint">
                    🏁 Your race time still counts. Check the Race tab.
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRunResult(null)}
                >
                  Got it
                </button>
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
              onClick={() => {
                setMenuOpen(false)
                setTabPickerOpen(false)
              }}
              aria-label="Close menu"
            >
              <FaTimes />
            </button>

            {/* Desktop: one row of tabs. Phones: a single game-style
                picker showing the current tab, which drops down the rest -
                six tabs in a row/grid was too cramped on a narrow screen. */}
            <div className="game-menu-tabs">
              {menuTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`game-menu-tab ${menuTab === tab.id ? 'active' : ''}`}
                  onClick={() => switchTab(tab.id)}
                >
                  <span
                    className={`game-menu-picker-medal game-menu-tab-medal tone-${tab.tone}`}
                  >
                    <tab.Icon />
                  </span>
                  {tab.label}
                  {tab.badge && (
                    <span className="game-menu-tab-badge">{tab.badge}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="game-menu-picker">
              {tabPickerOpen && (
                <div
                  className="game-menu-picker-scrim"
                  onClick={() => setTabPickerOpen(false)}
                />
              )}
              <button
                type="button"
                className="game-menu-picker-current"
                onClick={() => setTabPickerOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={tabPickerOpen}
              >
                <span
                  className={`game-menu-picker-medal tone-${activeMenuTab.tone}`}
                >
                  <activeMenuTab.Icon />
                </span>
                <span className="game-menu-picker-label">
                  {activeMenuTab.label}
                </span>
                {!tabPickerOpen && otherTabsBadgeCount > 0 && (
                  <span className="game-menu-tab-badge game-menu-picker-badge">
                    {otherTabsBadgeCount > 9 ? '9+' : otherTabsBadgeCount}
                  </span>
                )}
                <span
                  className={`game-menu-picker-knob ${tabPickerOpen ? 'is-open' : ''}`}
                >
                  <FaChevronDown />
                </span>
              </button>
              <AnimatePresence>
                {tabPickerOpen && (
                  <motion.ul
                    className="game-menu-picker-list"
                    role="listbox"
                    initial={{ opacity: 0, y: -14, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 460, damping: 26 }}
                  >
                    {menuTabs.map((tab, i) => (
                      <motion.li
                        key={tab.id}
                        initial={{ opacity: 0, x: -18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 520,
                          damping: 24,
                          delay: 0.03 + i * 0.035,
                        }}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={menuTab === tab.id}
                          className={`game-menu-picker-option ${menuTab === tab.id ? 'active' : ''}`}
                          onClick={() => {
                            switchTab(tab.id)
                            setTabPickerOpen(false)
                          }}
                        >
                          <span
                            className={`game-menu-picker-medal tone-${tab.tone}`}
                          >
                            <tab.Icon />
                          </span>
                          <span className="game-menu-picker-label">
                            {tab.label}
                          </span>
                          {tab.badge && (
                            <span className="game-menu-tab-badge game-menu-picker-badge">
                              {tab.badge}
                            </span>
                          )}
                          {menuTab === tab.id && (
                            <span className="game-menu-picker-here">
                              <FaCheck />
                            </span>
                          )}
                        </button>
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
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

            {menuTab === 'race' && (
              <div className="game-menu-panel">
                <PvpPanel
                  pvp={pvp}
                  userId={user?.id}
                  balance={profile?.fahhcoinBalance ?? 0}
                  onStartRace={handleStartRace}
                  racing={tracker.status === 'tracking' || Boolean(pendingRun)}
                />
              </div>
            )}

            {menuTab === 'mail' && (
              <div className="game-menu-panel">
                <MailPanel mailbox={mailbox} onClaimed={handleMailClaimed} />
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

            {menuTab === 'heroes' && (
              <div className="game-menu-panel game-menu-heroes">
                <p className="game-menu-avatars-title game-menu-avatars-title-centered">
                  Choose your hero
                </p>
                <HeroGallery
                  heroes={galleryHeroes}
                  ownedItems={ownedItems}
                  activeHeroId={activeHeroId}
                  loading={heroesLoading}
                  onSelect={(hero) => {
                    setStoreActionError(null)
                    setSelectedHeroId(hero.id)
                  }}
                />
              </div>
            )}

            {menuTab === 'shop' && (
              <div className="game-menu-panel game-menu-shop">
                {/* TEMP: free Avatar picker hidden - it duplicated the Heroes
                    tab. Its images now back the matching heroes instead
                    (see HeroFigure). Restore from git to bring it back. */}
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

                {galleryHeroes.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline game-menu-heroes-link"
                    onClick={() => switchTab('heroes')}
                  >
                    <GiSpartanHelmet /> Meet the Heroes - stats &amp; lore
                  </button>
                )}

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
                            {item.heroId &&
                              heroes.find((h) => h.id === item.heroId)
                                ?.abilities?.length > 0 && (
                                <span className="game-store-item-perk">
                                  ⚡{' '}
                                  {heroes
                                    .find((h) => h.id === item.heroId)
                                    .abilities.map(describeHeroAbility)
                                    .join(' · ')}
                                </span>
                              )}
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
            canInvite={canInviteToClub && !isMyEntry(viewingProfile)}
            onInvite={handleInviteToClub}
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
        {selectedHero && (
          <HeroDetailModal
            key={selectedHero.id}
            hero={selectedHero}
            ownedItems={ownedItems}
            isActive={selectedHero.id === activeHeroId}
            error={storeActionError}
            onClose={closeHeroModal}
            onEquip={handleEquip}
            onBuy={(skin) => {
              setSelectedHeroId(null)
              setStoreChoice(skin)
            }}
          />
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
