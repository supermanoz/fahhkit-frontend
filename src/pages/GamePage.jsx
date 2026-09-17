import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FaArrowLeft,
  FaBars,
  FaCheck,
  FaCoins,
  FaFlag,
  FaLock,
  FaPlay,
  FaStore,
  FaTimes,
  FaTrophy,
  FaUser,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa'
import TerritoryMap from '../components/TerritoryMap'
import ShareRunCarousel from '../components/ShareRunCarousel'
import AthleteTerritoryProfilePanel from '../components/AthleteTerritoryProfilePanel'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useRunTracker } from '../hooks/useRunTracker'
import { ApiError, isAdmin, resolveFileUrl } from '../api/client'
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
  LOOP_MIN_AREA_SQ_METERS,
  LOOP_MIN_POINTS,
  VIEW_RADIUS_METERS,
  formatArea,
  loopPerimeterMeters,
  polygonAreaSqMeters,
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
  toLocalDateTimeString,
} from '../utils/run'
import {
  SHARE_VARIANTS,
  downloadBlob,
  exportShareCardBlob,
} from '../utils/shareCanvas'
import { playClickSound, playMilestoneChime } from '../utils/gameSound'
import { isBlazeHero } from '../utils/hero'
import HeroSprite from '../components/HeroSprite'
import defaultAvatarImage from '../assets/images/player-avatar-blaze.png'
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
  // Last 1km-multiple the player was alerted for during the current tracked
  // run — a ref (not state) since it's read/written from inside an effect
  // and should never itself trigger a re-render.
  const lastMilestoneRef = useRef(0)

  // TEMP: admin-only tap-to-draw, purely for testing without needing a real
  // GPS trace. The backend has no "submit a shape directly" endpoint — this
  // still goes through the same POST /v1/run path a real run does, just with
  // synthetic points spaced far enough apart in time to clear the anti-cheat
  // sustained-speed check rather than a real device's GPS timestamps. Revert
  // by deleting this block and the isAdminUser-gated button below once real
  // device testing covers this instead.
  const [manualMode, setManualMode] = useState(false)
  const [manualPoints, setManualPoints] = useState([])
  const [manualDraft, setManualDraft] = useState(null)
  const isAdminUser = isAdmin(user)

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

  // Loads once we roughly know where the player is - re-running on every
  // liveLocation tick would hammer the API on every GPS fix.
  useEffect(() => {
    if (locating || !isAuthed) return
    refreshProfile()
    refreshNearbyParcels()
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
    if (btn && !btn.disabled) playClickSound()
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

  // TEMP: admin-only manual loop, see the state declaration above.
  function handleStartManual() {
    setManualPoints([])
    setManualMode(true)
  }

  function handleMapTap(point) {
    if (!manualMode) return
    setManualPoints((prev) => [...prev, point])
  }

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
  function handleViewMyParcel(parcel) {
    setHighlightedEntry({
      userId: user?.id,
      fullName: user?.fullName,
      areaSqMeters: parcel.areaSqMeters,
      parcelId: parcel.id,
    })
    setMenuOpen(false)
  }

  function handleCancelManual() {
    setManualMode(false)
    setManualPoints([])
  }

  // A jogging pace, comfortably under the backend's 7 m/s sustained-speed
  // anti-cheat ceiling — spacing points by a FIXED duration regardless of
  // loop size (an earlier version of this) implied a sprint/vehicle pace on
  // any loop bigger than a couple hundred meters and got silently rejected
  // as implausible. Duration has to scale with distance instead.
  const MANUAL_DRAFT_PACE_MPS = 3

  function handleCloseManualLoop() {
    if (manualPoints.length < 2) return
    // A real run closes itself because the runner physically ends up back
    // near where they started - tapped vertices have no such tendency (the
    // last tap of a decagon is just as far from the first as any other
    // vertex), so the server's 25m closure-gap check fails almost every
    // time without this. Appending an explicit duplicate of the first point
    // as the last point guarantees a 0m gap regardless of where the tapping
    // actually stopped.
    const closedPoints = [...manualPoints, manualPoints[0]]
    const distance = loopPerimeterMeters(manualPoints)
    const durationSeconds = Math.max(
      MIN_VALID_RUN_DURATION_SECONDS + 5,
      Math.ceil(distance / MANUAL_DRAFT_PACE_MPS)
    )
    const durationMs = durationSeconds * 1000
    const now = Date.now()
    const spacingMs = durationMs / Math.max(1, closedPoints.length - 1)
    const startedAt = new Date(now - durationMs)
    const endedAt = new Date(now)
    const points = closedPoints.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy: 5,
      speed: null,
      elevation: null,
      timestamp: startedAt.getTime() + i * spacingMs,
    }))
    setManualDraft({
      points,
      distance,
      duration: durationSeconds,
      startedAt,
      endedAt,
    })
    setManualMode(false)
    setManualPoints([])
  }

  function discardDraft() {
    if (manualDraft) {
      setManualDraft(null)
    } else {
      tracker.clearPendingRun()
    }
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

  const pendingRun = tracker.pendingRun || manualDraft
  const draftArea = pendingRun ? polygonAreaSqMeters(pendingRun.points) : 0
  const draftPerimeter = pendingRun ? loopPerimeterMeters(pendingRun.points) : 0
  const draftLooksThin =
    pendingRun &&
    (pendingRun.points.length < LOOP_MIN_POINTS ||
      draftArea < LOOP_MIN_AREA_SQ_METERS)

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

  function handleChooseAvatar(avatar) {
    setAvatarId(avatar.id)
    saveAvatarId(avatar.id)
    setAvatarChoice(null)
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

  const gameReady = !locating && mapReady

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
          livePath={manualMode ? manualPoints : tracker.path}
          currentUserId={user?.id}
          highlightOwnerId={highlightedOwnerId}
          highlightParcelId={highlightedEntry?.parcelId ?? null}
          avatarSrc={avatarSrc}
          playerColor={equippedShade}
          trailColor={equippedTrailColor}
          mapStyleUrl={currentMapStyle?.styleUrl}
          manualMode={manualMode}
          onMapClick={handleMapTap}
          onParcelClick={handleParcelClick}
          onMapReady={handleMapReady}
        />
      )}

      {!gameReady && (
        <div className="game-loading-overlay">
          <div className="game-loading-badge">
            <div className="game-loading-spinner" />
          </div>
          <p className="game-loading-text">
            {locating ? 'Finding your location…' : 'Preparing your run…'}
          </p>
        </div>
      )}

      <Link to="/" className="game-exit-btn" aria-label="Exit to home">
        <FaArrowLeft />
      </Link>

      <button
        type="button"
        className="game-mute-btn"
        onClick={toggleMusicMuted}
        aria-label={musicMuted ? 'Unmute music' : 'Mute music'}
      >
        {musicMuted ? <FaVolumeMute /> : <FaVolumeUp />}
      </button>

      <div className="game-hud">
        <button
          type="button"
          className="game-hud-stat game-hud-stat-clickable"
          aria-label="Fahhcoin balance - buy more Fahhcoin"
          onClick={openCoinShop}
        >
          <span className="game-hud-icon game-hud-icon-coin">
            <FaCoins />
          </span>
          <span className="game-hud-value">
            {profile?.fahhcoinBalance ?? 0}
          </span>
        </button>
        <button
          type="button"
          className="game-hud-stat game-hud-stat-clickable"
          aria-label="Parcels held - view your territories"
          onClick={() => {
            switchTab('me')
            setMenuOpen(true)
          }}
        >
          <span className="game-hud-icon game-hud-icon-flag">
            <FaFlag />
          </span>
          <span className="game-hud-value">{profile?.parcelCount ?? 0}</span>
        </button>
      </div>

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
                <span className="game-radial-label">{item.label}</span>
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
          <FaBars />
        </button>
      </div>

      <div className="game-controls" ref={controlsRef}>
        {tracker.status === 'idle' &&
          !pendingRun &&
          !manualMode &&
          isAdminUser && (
            <div className="game-controls-actions">
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={handleStartManual}
              >
                Tap to Draw Territory
              </button>
            </div>
          )}

        {manualMode && (
          <>
            <div className="game-controls-stats">
              <span>{manualPoints.length} points</span>
              <span>Tap the map to add points</span>
            </div>
            <div className="game-controls-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleCloseManualLoop}
                disabled={manualPoints.length < LOOP_MIN_POINTS}
              >
                Close Loop
              </button>
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={handleCancelManual}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {tracker.status === 'tracking' && (
          <>
            <div className="game-controls-stats">
              <span className="game-stat">
                <span className="game-stat-value">
                  {formatMeters(tracker.distance)}
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
                Close Loop
              </button>
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={handleCancelTracking}
              >
                Cancel
              </button>
            </div>
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
            {draftLooksThin && (
              <p className="game-controls-hint">
                This loop looks short or small — the server may not count it as
                closed territory. Bigger, cleanly closed loops score best.
              </p>
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
            initial={{ opacity: 0, x: '-50%', y: -20, scale: 0.9 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: -20, scale: 0.9 }}
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
                onClick={() => {
                  setHighlightedEntry(null)
                  setMenuTab('leaderboard')
                  setMenuOpen(true)
                }}
              >
                Back to Leaderboard
              </button>
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
                    <ul className="game-menu-leaderboard">
                      {leaderboard.map((entry) => (
                        <li
                          key={entry.userId}
                          className={isMyEntry(entry) ? 'is-player' : ''}
                        >
                          <button
                            type="button"
                            className="game-menu-leaderboard-row"
                            onClick={() => setViewingProfile(entry)}
                          >
                            <span className="game-menu-leaderboard-rank">
                              #{entry.rank}
                            </span>
                            <span className="game-menu-leaderboard-name">
                              {isMyEntry(entry) ? 'You' : entry.fullName}
                            </span>
                            <span className="game-menu-leaderboard-area">
                              {formatArea(entry.areaSqMeters)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : leaderboardError ? (
                  <p className="game-menu-empty">{leaderboardError}</p>
                ) : clubLeaderboard.length === 0 ? (
                  <p className="game-menu-empty">
                    No club has claimed territory yet.
                  </p>
                ) : (
                  <ul className="game-menu-leaderboard">
                    {clubLeaderboard.map((entry) => (
                      <li key={entry.clubId}>
                        <span className="game-menu-leaderboard-rank">
                          #{entry.rank}
                        </span>
                        <span className="game-menu-leaderboard-name">
                          {entry.clubName}
                        </span>
                        <span className="game-menu-leaderboard-area">
                          {formatArea(entry.totalAreaSqMeters)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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
                    />
                  )}
                </div>
                {user?.fullName && (
                  <p className="game-menu-player-name">{user.fullName}</p>
                )}
                {equippedPhrase && (
                  <p className="game-menu-phrase">
                    “{equippedPhrase.storeItem.name}”
                  </p>
                )}
                <div className="game-menu-summary">
                  <span className="game-menu-summary-value">
                    {formatArea(profile?.totalAreaSqMeters)}
                  </span>
                  <span className="game-menu-summary-label">
                    held across {profile?.parcelCount ?? 0} parcel
                    {profile?.parcelCount === 1 ? '' : 's'}
                  </span>
                </div>
                {profile?.level != null && (
                  <p className="game-menu-summary-label">
                    Level {profile.level} · {profile.xp ?? 0} XP
                    {profile.clubName ? ` · ${profile.clubName}` : ''}
                  </p>
                )}
                <p className="game-menu-section-title">My Territories</p>
                {myParcels.length === 0 ? (
                  <p className="game-menu-empty">
                    Finish a GPS run that closes a loop to see territory here.
                  </p>
                ) : (
                  <ul className="game-menu-list">
                    {[...myParcels]
                      .sort((a, b) => b.areaSqMeters - a.areaSqMeters)
                      .map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="game-menu-list-row"
                            onClick={() => handleViewMyParcel(p)}
                          >
                            <span className="game-menu-list-area">
                              {currentAreaEmoji?.emoji}{' '}
                              {formatArea(p.areaSqMeters)}
                            </span>
                            <span className="game-menu-list-meta">
                              score {Math.round(p.currentScore || 0)}
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
                <p className="game-menu-avatars-title">
                  Choose your map avatar
                </p>
                <p className="game-menu-avatars-subtitle">
                  Own a Sticker below? Equip it to use as your map avatar
                  instead of these.
                </p>
                <div className="game-menu-avatar-grid">
                  {AVATARS.map((avatar) => {
                    const isSelected = avatar.id === avatarId
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
                {equippedHero && (
                  <p className="game-menu-avatars-hint">
                    Your equipped Hero ({equippedHero.storeItem.name}) is
                    showing on the map instead — unequip it below to switch back
                    to a free avatar.
                  </p>
                )}

                <p className="game-menu-avatars-title">Map style</p>
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

                <p className="game-menu-avatars-title">Area emoji</p>
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
                                : `${item.priceFahhcoin} Fahhcoin`}
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
                      <span className="game-hud-icon game-hud-icon-coin">
                        <FaCoins />
                      </span>
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
                Buy {storeChoice.name} for {storeChoice.priceFahhcoin} Fahhcoin?
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
