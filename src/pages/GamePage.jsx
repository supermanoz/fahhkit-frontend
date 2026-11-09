import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  IconBell,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCrosshairs,
  IconEnvelope,
  IconExpand,
  IconFlag,
  IconFlagCheckered,
  IconFlagScope,
  IconHelmet,
  IconLogout,
  IconMenuOrb,
  IconMusicNote,
  IconPause,
  IconPlay,
  IconRunning,
  IconSettings,
  IconStore,
  IconSwords,
  IconTrophy,
  IconUser,
  IconUsers,
  IconVolumeMute,
  IconVolumeUp,
} from '../components/GameIcons'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TerritoryMap from '../components/TerritoryMap'
import ShareRunCarousel from '../components/ShareRunCarousel'
import AthleteTerritoryProfilePanel from '../components/AthleteTerritoryProfilePanel'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useRunTracker } from '../hooks/useRunTracker'
import { useAuthFlow } from '../hooks/useAuthFlow'
import { useReminders } from '../hooks/useReminders'
import { useAndroidBackButton } from '../hooks/useAndroidBackButton'
import {
  isRemindersDebugEnabled,
  scheduleTestReminderInOneMinute,
} from '../utils/reminders'
// Dynamically imported (not bundled with the rest of the game) - a logged-
// in player never triggers this import at all, so it doesn't add to the
// bundle they actually download. See the logged-out branch below.
const GameAuthGate = lazy(() => import('../components/game-auth/GameAuthGate'))
import { useGameSocket } from '../hooks/useGameSocket'
import { useMailbox } from '../hooks/useMailbox'
import { mySide, usePvp } from '../hooks/usePvp'
import { useClubWarWatch } from '../hooks/useClubWarWatch'
import { ApiError, resolveFileUrl } from '../api/client'
import { createRun, getRun, getRuns } from '../api/runs'
import {
  findClubLeaderboard,
  findIndividualLeaderboard,
  findMyParcels,
  findMyTerritoryEvents,
  findParcelsNear,
  getTerritoryProfile,
  getTopClubsNational,
  getTopIndividualsLocal,
} from '../api/territory'
import { findClubs, getMyClub, inviteToClub } from '../api/club'
import {
  requestRollout,
  ALREADY_ROLLED_OUT_MESSAGE,
} from '../api/territoryRollout'
import { useRolloutStatus } from '../hooks/useRolloutStatus'
import RolloutRequestModal from '../components/RolloutRequestModal'
import {
  resolveEmoteAsset,
  resolveEquippedEmoteItem,
  warnMissingEmoteAssets,
} from '../utils/emotes'
import EmoteGlyph from '../components/EmoteGlyph'
import { ToastProvider, useToast } from '../game/ui/Toast'
import Avatar from '../game/ui/Avatar'
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
  createRoute,
  findMyRoutes,
  getRoute,
  toggleRouteVisibility,
} from '../api/routes'
import { snapSegment } from '../utils/routeSnapping'
import {
  DEFAULT_CENTER,
  LOOP_CLOSURE_THRESHOLD_METERS,
  LOOP_MIN_AREA_SQ_METERS,
  LOOP_MIN_POINTS,
  VIEW_RADIUS_METERS,
  PLAYER_COLOR,
  bearingBetween,
  formatArea,
  formatAreaStat,
  generateTerritoryLoopRoute,
  loopPerimeterMeters,
  mergeTouchingParcels,
  pointInPolygon,
  polygonAreaSqMeters,
  smoothAngle,
  toDisplayParcel,
} from '../utils/territoryGame'
import {
  MIN_DISTANCE_FOR_PACE_METERS,
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
  isSfxMuted,
  playSfx,
  setSfxMuted as persistSfxMuted,
} from '../utils/gameSound'
import { isCometHero, isPlaceholderHero } from '../utils/hero'
import { hasHero as hasHeroManifest } from '../utils/heroManifest'
import HeroSprite from '../components/HeroSprite'
import HeroStage from '../components/HeroStage'
import LevelBar from '../components/LevelBar'
import ClubPanel from '../components/ClubPanel'
import MailPanel from '../components/MailPanel'
import PvpPanel from '../components/PvpPanel'
import HeroGallery from '../components/HeroGallery'
import ShadeFlag from '../components/ShadeFlag'
import TrailPreview from '../components/TrailPreview'
import ColorShelf from '../components/ColorShelf'
import EmoteShowcase from '../components/EmoteShowcase'
import MedalGrid from '../components/MedalGrid'
import ChallengePrompt from '../components/ChallengePrompt'
import BroadcastPrompt from '../components/BroadcastPrompt'
import { useAnnouncementNotices } from '../hooks/useAnnouncementNotices'
import RunRewardAnimation from '../components/RunRewardAnimation'
import RunScoreCard from '../components/RunScoreCard'
import ClubBadge from '../components/ClubBadge'
import ClubTrophyIcon from '../components/ClubTrophyIcon'
import NicknameCard from '../components/NicknameCard'
import { playerName, playerNameOf } from '../utils/playerName'
import { formatCoins } from '../utils/format'
import HeroDetailModal from '../components/HeroDetailModal'
import IdleNudge from '../components/IdleNudge'
import GameIntroGlobe from '../components/GameIntroGlobe'
import GameLoadingBackdrop from '../components/GameLoadingBackdrop'
import MailBadgeIcon from '../components/MailBadgeIcon'
import MapStylePicker from '../components/MapStylePicker'
import LeaderboardPodium, {
  LeaderboardSkeleton,
} from '../components/LeaderboardPodium'
import SponsorBannerCarousel from '../components/SponsorBannerCarousel'
import RouteTurnIndicator from '../components/RouteTurnIndicator'
import { getRouteGuidance } from '../utils/routeNav'
import defaultAvatarImage from '../assets/avatars/blaze.png'
import runConquestLogo from '../assets/images/run-conquest-logo.png'
import globeScopeIcon from '../assets/ui/globe-scope.png'
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
import '../game/styles/tokens.css'
import './GamePage.css'
import '../components/GameCards.css'

function formatMeters(meters) {
  if (!meters) return '0 m'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

// Pokémon GO-style menu: tapping the FAB (which turns into a close X) lays
// these out above it - five big buttons in an X (two up top, the red Play
// button dead center, two below), with Mail and Settings as small icons on
// either side of the FAB. x/y are each button's center offset from the
// FAB's, so the layout itself is the point here, not incidental styling.
// Icon-only - the name only surfaces via aria-label/title, no text label.
// The red Play button opens PLAY_OPTIONS instead of a menu tab.
const RADIAL_ITEMS = [
  { tab: 'me', label: 'Me', Icon: IconUser, tone: 'green', x: -112, y: -300 },
  {
    tab: 'club',
    label: 'Club',
    Icon: IconUsers,
    tone: 'green',
    x: 112,
    y: -300,
  },
  { tab: 'play', label: 'Play', Icon: IconPlay, tone: 'red', x: 0, y: -200 },
  {
    tab: 'leaderboard',
    label: 'Leaderboard',
    Icon: IconTrophy,
    tone: 'gold',
    x: -112,
    y: -100,
  },
  {
    tab: 'shop',
    label: 'Shop',
    Icon: IconStore,
    tone: 'wood',
    x: 112,
    y: -100,
  },
  {
    tab: 'mail',
    label: 'Mail',
    Icon: IconEnvelope,
    tone: 'mini',
    x: -100,
    y: 0,
  },
  {
    tab: 'settings',
    label: 'Settings',
    Icon: IconSettings,
    tone: 'mini',
    x: 100,
    y: 0,
  },
]

// What the red Play button opens into: the original start-a-run ("Conquer"
// territory), a PvP race, or Training - a choice between modes, shown in
// place of the main layout.
const PLAY_OPTIONS = [
  {
    tab: 'conquer',
    label: 'Conquer',
    Icon: IconFlag,
    tone: 'green',
    x: -120,
    y: -170,
  },
  {
    tab: 'race',
    label: 'PvP',
    Icon: IconSwords,
    tone: 'red',
    x: 0,
    y: -170,
  },
  {
    tab: 'training',
    label: 'Training',
    Icon: IconRunning,
    tone: 'gold',
    x: 120,
    y: -170,
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
  if (
    !outcome ||
    outcome.outcome === 'SUCCESS' ||
    outcome.outcome === 'SUCCESS_NO_CAPTURE'
  ) {
    return null
  }
  // No loop was ever attempted here - same as a Club War/Boss Fight run,
  // scored on pace + base effort alone - but unlike that case, the player
  // can ask for it (see handleRequestRollout below). Surfaced via its own
  // flag rather than RUN_REJECTION_COPY since the result toast needs to
  // render a live Request Rollout button here, not just static copy.
  if (outcome.outcome === 'TERRITORY_NOT_ROLLED_OUT') {
    return {
      title: 'Not live here yet 🚧',
      message:
        "Territory capture isn't rolled out in your area yet, so this run scored on pace and effort alone, same as a Club War. PvP and Club Wars work everywhere - and you can ask for your area below.",
      isRolloutRejection: true,
    }
  }
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

// Shop sub-sections (tab row under the wallet). Map style used to live
// here too - it's a Settings row now (see MapStylePicker), not tied to
// the Shop's owned/equip model at all (it's free and local-only).
const SHOP_SECTIONS = [
  { id: 'heroes', label: 'Heroes', Icon: IconHelmet },
  { id: 'territory', label: 'Territory', Icon: IconFlag },
  { id: 'trail', label: 'Trail', Icon: IconRunning },
]

const PVP_ALERT_COPY = {
  matched: {
    title: 'Rival found! ⚔️',
    line: 'Confirm the race to lock in stakes.',
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
const ROUTES_PAGE_SIZE = 5
const MY_RUNS_PAGE_SIZE = 5
// Minimum time the loading screen stays up, even on a fast load.
const LOADING_MIN_MS = 4500

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

// Wrapped below so ToastProvider is an ancestor of this component (and so
// its own useToast() call below resolves) - the equip error toast is the
// first thing in /game to need it.
// Shared by both of GamePageInner's returns (logged-in and the GameAuthGate
// early return below) - the hardware Back button can ask to exit from
// either one, see useAndroidBackButton.
/* eslint-disable react/prop-types -- no prop-types dependency in this project */
function ExitConfirmOverlay({ backButton }) {
  return (
    <AnimatePresence>
      {backButton.exitConfirmOpen && (
        <motion.div
          className="game-confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={backButton.cancelExit}
        >
          <motion.div
            className="game-confirm-card"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p>Exit Run Conquest?</p>
            <div className="game-confirm-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={backButton.cancelExit}
              >
                Stay
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={backButton.confirmExit}
              >
                Exit
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
/* eslint-enable react/prop-types */

/* eslint-disable react/prop-types -- no prop-types dependency in this project */
// Mail's own tab icon is the real mail_icon.png/.webp badge asset (see
// MailBadgeIcon), shown plain - no .game-menu-picker-medal circle/border
// behind it (it's already got its own round frame), unlike every other
// tab here. Used for all three places that render a tab's icon (desktop
// row, header "current" trigger, dropdown list) so none of them need
// their own mail special-case.
function TabMedal({ tab, medalClassName = '' }) {
  if (tab.tone === 'mail') {
    return <tab.Icon />
  }
  return (
    <span
      className={`game-menu-picker-medal ${medalClassName} tone-${tab.tone}`}
    >
      <tab.Icon />
    </span>
  )
}
/* eslint-enable react/prop-types */

function GamePageInner() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user, isAuthed, loading: userLoading, replaceUser } = useCurrentUser()
  const auth = useAuthFlow()
  const reminders = useReminders()
  const [remindersDebug] = useState(isRemindersDebugEnabled)
  const tracker = useRunTracker()
  // A full reload (not just clearing the token + re-rendering) is
  // deliberate here - this page holds dozens of pieces of React state tied
  // to the signed-in player (hero, territory, run tracker, club, etc.) that
  // have no single "reset to signed-out" path; reloading guarantees none of
  // it leaks into whatever the next GameAuthGate session does, at the cost
  // of a logout being the one action in the game that isn't instant.
  function handleLogout() {
    auth.signOut()
    window.location.reload()
  }
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
  // Google Maps' own run-mode location control - the locate FAB toggles
  // 'free' (map doesn't follow) <-> 'follow' (centers on the player, north
  // always stays up - the map never rotates or tilts; see TerritoryMap.jsx).
  // Defaults to 'follow' the instant any run starts tracking (Conquer, PvP,
  // Club War or a guided route alike - see the tracker.status effect below)
  // and back to 'free' once it stops; a manual pinch/drag drops straight to
  // 'free' too (Google Maps' own "free look" behavior) - see handleUserPan
  // and the locate FAB below.
  const [mapMode, setMapMode] = useState('free')
  const handleUserPan = useCallback(() => setMapMode('free'), [])
  useEffect(() => {
    setMapMode(tracker.status === 'tracking' ? 'follow' : 'free')
  }, [tracker.status])
  function toggleFollow() {
    setMapMode((current) => (current === 'follow' ? 'free' : 'follow'))
  }
  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [locating, setLocating] = useState(true)
  const [liveLocation, setLiveLocation] = useState(null)
  // liveLocation only ever holds a real GPS fix (never the DEFAULT_CENTER
  // fallback the map itself falls back to) - exactly what the rollout
  // check needs, since a denied/unavailable location should fail the check
  // open (nothing shown), not silently check Kathmandu's rollout status.
  // See hooks/useRolloutStatus.js.
  const rolloutStatus = useRolloutStatus(liveLocation)
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
  const [myRunsPage, setMyRunsPage] = useState(1)
  const [myRunsTotalPages, setMyRunsTotalPages] = useState(1)
  const [myRunsLoading, setMyRunsLoading] = useState(false)
  const [myRunsError, setMyRunsError] = useState(null)
  // Session-only page cache (page number -> { runs, totalPages }) so
  // Prev/Next and reopening the tab on a page already seen this session
  // don't re-fetch, and so a prefetched next page is just sitting there
  // ready. Cleared whenever the list could have shifted (a new run saved).
  const myRunsCacheRef = useRef(new Map())
  const myRunsListRef = useRef(null)
  const [viewingRun, setViewingRun] = useState(null)
  const [loadingRunId, setLoadingRunId] = useState(null)
  const [nearbyParcels, setNearbyParcels] = useState([])

  // "My Territories" only shows 3 at a time (largest first), with arrow
  // buttons paging through the rest instead of dumping a long list.
  const TERRITORIES_PAGE_SIZE = 3
  const [myTerritoriesPage, setMyTerritoriesPage] = useState(1)
  const sortedMyTerritories = useMemo(
    () => [...myTerritories].sort((a, b) => b.area - a.area),
    [myTerritories]
  )
  const myTerritoriesTotalPages = Math.max(
    1,
    Math.ceil(sortedMyTerritories.length / TERRITORIES_PAGE_SIZE)
  )
  useEffect(() => {
    setMyTerritoriesPage((p) => Math.min(p, myTerritoriesTotalPages))
  }, [myTerritoriesTotalPages])
  const visibleMyTerritories = sortedMyTerritories.slice(
    (myTerritoriesPage - 1) * TERRITORIES_PAGE_SIZE,
    myTerritoriesPage * TERRITORIES_PAGE_SIZE
  )

  // --- Saved routes (draw a route, name it, keep it private or share to
  // your club - see src/api/routes.js) ---
  const [myRoutes, setMyRoutes] = useState([])
  const [myRoutesLoaded, setMyRoutesLoaded] = useState(false)
  const [myRoutesPage, setMyRoutesPage] = useState(1)
  const [myRoutesTotalPages, setMyRoutesTotalPages] = useState(1)
  const [myRoutesError, setMyRoutesError] = useState(null)
  const [routeVisibilityBusyId, setRouteVisibilityBusyId] = useState(null)
  // Every route the player owns, drawn on the map at all times (not just
  // while explicitly "viewing" one) - [{ id, points }]. Loaded once on
  // game load alongside the other bootstrap data, and kept in sync
  // locally (no refetch) when a route is created.
  const [myRouteOverlays, setMyRouteOverlays] = useState([])
  // A route currently drawn on the map read-only (tapped from My Routes or
  // Club > Shared Routes) - { id, name, visibility, distanceMeters, points }.
  const [viewingRoute, setViewingRoute] = useState(null)
  const [loadingRouteId, setLoadingRouteId] = useState(null)
  // True while actively running the route in viewingRoute (see
  // handleRunViewedRoute) - swaps the route's info/share toast for the
  // cartoon turn-by-turn HUD (RouteTurnIndicator) until the run ends.
  const [followingRoute, setFollowingRoute] = useState(false)
  // Whether the map camera is auto-centering on the player right now (the
  // Follow or Chase location-button state) - every run type gets this
  // the moment it starts tracking (see the mapMode effect above), same as
  // Google Maps' own "start riding" nav view.
  const isFollowing = tracker.status === 'tracking' && mapMode !== 'free'
  // Drawing a new route: raw taps + the OSRM-snapped geometry for each
  // segment between them (kept separate per segment so Undo can pop
  // exactly one tap's worth of geometry instead of guessing where in a
  // flat point list it ended).
  const [routeDraftMode, setRouteDraftMode] = useState(false)
  const [routeDraftWaypoints, setRouteDraftWaypoints] = useState([])
  const [routeDraftSegments, setRouteDraftSegments] = useState([])
  const [routeSnapBusy, setRouteSnapBusy] = useState(false)
  const [routeDraftError, setRouteDraftError] = useState(null)
  const [routeNamePromptOpen, setRouteNamePromptOpen] = useState(false)
  const [routeNameInput, setRouteNameInput] = useState('')
  const [routeConfirmCancel, setRouteConfirmCancel] = useState(false)
  const [savingRoute, setSavingRoute] = useState(false)
  const [saveRouteError, setSaveRouteError] = useState(null)
  // Flattened for rendering/distance - every segment's points back to back.
  const routeDraftPoints = routeDraftSegments.flat()
  const routeDraftDistance = routeDraftSegments.reduce((sum, segment) => {
    let segSum = 0
    for (let i = 1; i < segment.length; i++) {
      segSum += haversineDistance(segment[i - 1], segment[i])
    }
    return sum + segSum
  }, 0)
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardMode, setLeaderboardMode] = useState('individual')
  // Solo: ranked worldwide, or just within the city the backend resolves
  // from your last-known GPS fix. Club: worldwide, or just within your
  // country (every city in it pooled together) - see loadLeaderboard/
  // loadClubLeaderboard below.
  const [individualScope, setIndividualScope] = useState('global')
  const [clubScope, setClubScope] = useState('global')
  const [clubLeaderboard, setClubLeaderboard] = useState([])
  const [leaderboardError, setLeaderboardError] = useState(null)
  // True while a leaderboard request is in flight - without this, the
  // panel briefly showed its "No territory claimed yet"/"No club..." empty
  // state on every first load (leaderboard.length is 0 before the request
  // even lands), reading as "there's nothing here" instead of "loading."
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  // Set when a club leaderboard row is tapped - the Club tab jumps straight
  // to that club's info instead of wherever it was left.
  const [openClubId, setOpenClubId] = useState(null)
  const [storeCatalog, setStoreCatalog] = useState([])
  const [shopSection, setShopSection] = useState('heroes')
  // Buy confirm pop-up: request in flight / its own error line.
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState(null)
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
  // 'main' shows RADIAL_ITEMS; 'play' swaps them for PLAY_OPTIONS.
  const [radialMode, setRadialMode] = useState('main')
  // The club war the current tracked run is for (HUD label only - the id
  // itself travels with the run in useRunTracker).
  const [activeWarRun, setActiveWarRun] = useState(null)
  const [radialOpen, setRadialOpen] = useState(false)
  // Closing the fan always resets it to the main arc for next time.
  useEffect(() => {
    if (!radialOpen) setRadialMode('main')
  }, [radialOpen])
  const [tabPickerOpen, setTabPickerOpen] = useState(false)
  // Esc closes the tab picker if it's open (same as tapping outside it),
  // otherwise the whole menu sheet (same as its own X).
  useEffect(() => {
    if (!menuOpen) return
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return
      if (tabPickerOpen) setTabPickerOpen(false)
      else setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen, tabPickerOpen])

  const [highlightedEntry, setHighlightedEntry] = useState(null)
  // Size/distance warning shown inline on the territory popup before
  // actually starting a generated "Run/Defend this territory" loop (see
  // handleRunTerritory) - null the rest of the time. A string, not a
  // boolean: the message itself names which threshold tripped.
  const [territoryRunWarning, setTerritoryRunWarning] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  // A profile popup can open straight from the Leaderboard tab (which never
  // itself needs storeCatalog) before the Shop/Club/Me tabs have lazily
  // loaded it - same pattern as switchTab's own lazy loads below, so
  // resolveAthleteProfileHero's heroId backfill (athleteProfileHero.js) has
  // something to look up instead of falling back to its last-resort,
  // no-heroId-filter match.
  useEffect(() => {
    if (viewingProfile && storeCatalog.length === 0) loadStore()
  }, [viewingProfile, storeCatalog])
  // Hardware Back button (native app only) - closes whichever of these is
  // open, topmost first; with nothing open it asks before exiting, and
  // never exits (or does anything at all) mid-run. See
  // useAndroidBackButton's own comment for why `blocked` matters here.
  // Set by GameAuthGate (via onBackStateChange below) while logged out -
  // null at its WELCOME screen, otherwise a function that steps it back one
  // screen. A ref, not state: GameAuthGate updates it on its own render
  // cycle, and the back-button layer below reads it fresh on every actual
  // button press rather than whatever it was at GamePage's last render.
  const authBackRef = useRef(null)
  const backButton = useAndroidBackButton({
    layers: [
      { isOpen: () => reminders.showPrompt, close: reminders.declinePrompt },
      {
        isOpen: () => Boolean(authBackRef.current),
        close: () => authBackRef.current?.(),
      },
      { isOpen: () => Boolean(viewingRun), close: () => setViewingRun(null) },
      { isOpen: () => Boolean(viewingRoute), close: handleCloseViewingRoute },
      {
        isOpen: () => routeNamePromptOpen,
        close: () => setRouteNamePromptOpen(false),
      },
      {
        isOpen: () => Boolean(viewingProfile),
        close: () => setViewingProfile(null),
      },
      { isOpen: () => menuOpen, close: () => setMenuOpen(false) },
    ],
    blocked: tracker.status === 'tracking',
  })
  const [storeChoice, setStoreChoice] = useState(null)
  // TEMP: Comet for everyone for now (the default hero) - the Avatar picker
  // is hidden from the Shop (Heroes tab replaces it), so an old saved pick
  // would be stuck with no way to change it. Restore
  // `loadAvatarId() || AVATARS[0].id` when the picker comes back.
  const [avatarId, setAvatarId] = useState(() => getAvatarById('comet').id)
  const [avatarChoice, setAvatarChoice] = useState(null)
  const [mapStyleId, setMapStyleId] = useState(
    () => loadMapStyleId() || MAP_STYLES[0].id
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
  // The score breakdown the backend already pushes over the socket for
  // every scored run (RunScoreBreakdownResponse, see onRunProcessed below)
  // - previously only read to pick a rejection message, never to show the
  // actual numbers (see RunScoreCard.jsx). null for a cheat-flagged run
  // (never scored at all) or a PvP race (scored entirely separately, no
  // push at all for that mode - see TerritoryProcessingServiceImpl).
  const [runScoreBreakdown, setRunScoreBreakdown] = useState(null)

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
  // Sound effects mute (the Settings row below Music) - independent of
  // musicMuted above, same "remembered across sessions" reasoning. Default
  // unmuted (isSfxMuted() reads gameSound.js's own module-level flag,
  // itself already synced from localStorage at import time - see that
  // file's own comment on why that has to happen before any component
  // mounts, not inside this initializer). React state only exists here so
  // toggling the Settings row re-renders; gameSound.js's playSfx is what
  // actually checks the flag on every play.
  const [sfxMuted, setSfxMutedState] = useState(() => isSfxMuted())
  // The game starts itself (globe dive, then music - see the music effect
  // further down) the instant gameReady flips true - no "tap anywhere to
  // begin" gesture to wait on.
  const [introStarted, setIntroStarted] = useState(false)

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
  // tracking vs. draft-run-with-stats, collapsed vs. expanded, Running vs.
  // Paused) and with the device's own safe-area inset - measuring it
  // directly instead of guessing a fixed pixel offset is what lets the
  // floating locate button sit exactly N px above it on every device and
  // every run mode (Conquer, Club War, PvP, Training, route-guided all
  // share this one sheet/run-card), rather than needing hand-tuned
  // breakpoint values that were consistently wrong on real phones.
  // controlsEl is state, not a plain useRef, so the ResizeObserver effect
  // below re-runs the moment the node actually appears - a plain ref
  // wouldn't: this component can first mount on the signed-out gate (see
  // the early `!isAuthed` return further down), which never renders
  // .game-controls at all, so a `useEffect(..., [])` reading a plain ref
  // would see a null .current forever and never attach an observer, which
  // is what let the locate button drift onto the run card in the first
  // place - it was stuck at the 90px fallback below instead of the run
  // card's real height.
  const [controlsEl, setControlsEl] = useState(null)
  const [controlsHeight, setControlsHeight] = useState(90)
  // Collapsed by default while tracking - just distance/pace/time, with the
  // handle arrow revealing End/Cancel underneath. Reset to collapsed every
  // time a new run starts (see handleStartRun/handleStartRace).
  const [statsOnly, setStatsOnly] = useState(true)
  // One extra tap before End/Cancel/Discard actually fire - null | 'end' |
  // 'cancel' | 'discard'. Mirrors the two-tap confirm already used for
  // TrackRunPanel's Stop Run and PvpPanel's Forfeit, just inline in the
  // button row instead of a separate state var per button.
  const [confirmAction, setConfirmAction] = useState(null)
  // Esc closes the end-run confirm modal the same as tapping the backdrop
  // or "Keep Running" - only for 'end'/'cancel' (the pendingRun 'discard'
  // and route-drawing confirms stay inline-in-sheet, not a modal, so Esc
  // has nothing to do there).
  useEffect(() => {
    if (confirmAction !== 'end' && confirmAction !== 'cancel') return
    function handleKeyDown(e) {
      if (e.key === 'Escape') setConfirmAction(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmAction])
  // Shows the "loop not closed" popup once right after a run ends open -
  // dismissible so it doesn't nag while the athlete decides whether to
  // submit anyway or go back out and close it. Reset to false every time
  // End is confirmed (see the end-confirm button below), so a fresh draft
  // always gets its own first look at the warning.
  const [loopWarningDismissed, setLoopWarningDismissed] = useState(false)
  // Guards the auto-finish-on-target-distance effect below so it fires at
  // most once per race, keyed by challenge id (effects can re-run before
  // tracker.status actually flips to 'idle').
  const autoFinishedRaceIdRef = useRef(null)

  // "3 2 1 GO" pre-run countdown (plain territory draws, PvP races and
  // guided route runs alike) - null when idle, else a number counting down
  // or the literal 'GO' flash right before the actual tracker.start() call
  // fires (held in pendingStartRef, since the start function needed
  // differs per run type). Club War runs (handleStartWarRun) still skip
  // it - a war entry has its own battle-start framing already.
  const [startCountdown, setStartCountdown] = useState(null)
  const pendingStartRef = useRef(null)

  function resetForRunStart() {
    setGpsErrorDismissed(false)
    setStatsOnly(true)
    setConfirmAction(null)
    setMapMode('follow')
  }

  function beginCountdownThenStart(startFn) {
    resetForRunStart()
    pendingStartRef.current = startFn
    setStartCountdown(3)
  }

  useEffect(() => {
    if (startCountdown == null) return
    if (startCountdown === 'GO') {
      const timeout = setTimeout(() => {
        setStartCountdown(null)
        const startFn = pendingStartRef.current
        pendingStartRef.current = null
        if (startFn) startFn()
      }, 500)
      return () => clearTimeout(timeout)
    }
    const timeout = setTimeout(() => {
      setStartCountdown((count) => (count === 1 ? 'GO' : count - 1))
    }, 800)
    return () => clearTimeout(timeout)
  }, [startCountdown])

  useEffect(() => {
    if (!controlsEl) return
    // Sync immediately on attach rather than waiting for the first resize
    // - the node can already be at its real (non-90px-fallback) height the
    // moment this runs, and ResizeObserver only reports *changes* from
    // here on.
    setControlsHeight(controlsEl.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setControlsHeight(controlsEl.offsetHeight)
    })
    observer.observe(controlsEl)
    return () => observer.disconnect()
  }, [controlsEl])

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

  // Territory-capture rollout request (see api/territoryRollout.js) - the
  // backend has NO passive "is my area rolled out" check, only this
  // mutating request call, so there's no reliable way to lock the Conquer
  // button or show an arrival notice in advance - see its own file-level
  // comment for why this is never called from a background
  // location-watching effect. Two triggers instead:
  //   1. Reactive: a plain territory run actually comes back
  //      TERRITORY_NOT_ROLLED_OUT (see RUN_REJECTION_COPY/
  //      describeRunRejection above) - the result toast gets its own
  //      "Request Rollout" button right there.
  //   2. A standing "Request Territory Capture For My Area" row in
  //      Settings, always available regardless of known status - tapping
  //      it either requests (area isn't rolled out yet) or comes back
  //      ALREADY_ROLLED_OUT (area already works - told as good news, not
  //      an error).
  // Same busy/error/done state machine serves both triggers.
  const [rolloutRequestBusy, setRolloutRequestBusy] = useState(false)
  const [rolloutRequestError, setRolloutRequestError] = useState(null)
  const [rolloutRequestResult, setRolloutRequestResult] = useState(null)

  async function handleRequestRollout() {
    const loc = liveLocation || center
    if (!loc) return
    setRolloutRequestBusy(true)
    setRolloutRequestError(null)
    setRolloutRequestResult(null)
    try {
      const result = await requestRollout(loc.lat, loc.lng)
      setRolloutRequestResult({ ...result, alreadyRolledOut: false })
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.message === ALREADY_ROLLED_OUT_MESSAGE
      ) {
        setRolloutRequestResult({ alreadyRolledOut: true })
      } else {
        setRolloutRequestError(
          err instanceof ApiError
            ? err.message
            : 'Could not send that request - try again in a bit.'
        )
      }
    } finally {
      setRolloutRequestBusy(false)
    }
  }

  const playerLocation =
    tracker.status === 'tracking' && tracker.path.length > 0
      ? tracker.path[tracker.path.length - 1]
      : liveLocation || center

  const mailbox = useMailbox()
  // IMPORTANT_NOTICE broadcasts, popped up front and center the moment the
  // game opens instead of waiting for the player to find them in the Mail
  // tab - see BroadcastPrompt below. Backed by the server
  // (BroadcastMailReadState.noticeShownAt, per user), not a client-side
  // guess: once dismissed, GET /v1/mail/broadcast/notices/pending simply
  // never returns it again, on any device, even after logout/login. A
  // genuinely new one still shows once. See hooks/useAnnouncementNotices.js.
  const announcementNotices = useAnnouncementNotices(isAuthed ? user?.id : null)
  // Whether the player is actually looking at the PvP tab right now - the
  // recurring challenge/discoverable-ping polls only run while this is
  // true (see usePvp); the incoming-challenge pop-up itself still works
  // everywhere via the socket push, which needs no polling.
  const pvpOpen = menuOpen && menuTab === 'race'
  const pvp = usePvp({
    userId: isAuthed ? user?.id : null,
    playerLocation,
    pvpOpen,
  })

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
    // Still worth checking for XP - a rejected loop (didn't close, or a
    // rival contested it) still earns the run's effort-based distance XP;
    // only CHEAT_DETECTED skips XP entirely, which this naturally shows as
    // a zero diff (see refreshProfileAfterRun).
    refreshProfileAfterRun()
    return true
  }

  useGameSocket(isAuthed ? user?.id : null, {
    onRunProcessed: (outcome) => {
      runOutcomesRef.current[outcome.runId] = outcome
      if (outcome.runId !== watchedRunIdRef.current) return
      // Captured for every outcome, not just a rejection - a successful
      // (or Club War/Boss Fight) run's score numbers live on this same
      // payload, just previously never read (see RunScoreCard.jsx).
      setRunScoreBreakdown(outcome)
      showRunOutcome(outcome)
    },
    onMail: mailbox.receiveMail,
    onBroadcastMail: (broadcast) => {
      mailbox.receiveBroadcast(broadcast)
      announcementNotices.receive(broadcast)
    },
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

  // Race the PvP tab should open on (a challenge accepted from the pop-up,
  // a race that just went live, a queue match).
  const [pvpFocusId, setPvpFocusId] = useState(null)

  // A race of mine just went live (the rival accepted my challenge) or the
  // queue found me a rival → take me straight to that race screen, whether
  // it came by socket push or by usePvp's polling. Not while I'm mid-run -
  // the callout pill still shows then.
  useEffect(() => {
    const a = pvp.alert
    if (!a?.challenge?.id) return
    if (a.kind !== 'started' && a.kind !== 'matched') return
    if (tracker.status === 'tracking') return
    // Already watching the search in the PvP tab - the panel shows
    // "Rival found!" and opens the race itself.
    if (a.kind === 'matched' && menuOpen && menuTab === 'race') return
    setPvpFocusId(a.challenge.id)
    openMenu('race')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvp.alert])

  // Club war phase flips / result, announced over the map (no socket push
  // for wars - see useClubWarWatch).
  const { warAlert, clearWarAlert } = useClubWarWatch(
    isAuthed && Boolean(profile?.clubName)
  )
  useEffect(() => {
    if (!warAlert) return
    navigator.vibrate?.([120, 60, 120])
    playSfx('chime')
    refreshProfile()
    const hide = setTimeout(clearWarAlert, 9000)
    return () => clearTimeout(hide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warAlert])
  const warAlertCopy = (() => {
    if (!warAlert) return null
    const w = warAlert.war
    const mineIsA = w.clubAName === profile?.clubName
    const rival = mineIsA ? w.clubBName : w.clubAName
    if (warAlert.kind === 'battle')
      return {
        emoji: '⚔️',
        title: 'Battle has begun!',
        line: `Club war vs ${rival} is live - get your run in.`,
      }
    const myId = mineIsA ? w.clubAId : w.clubBId
    if (!w.winnerClubId)
      return {
        emoji: '🤝',
        title: 'Club war: draw',
        line: `Dead even with ${rival}.`,
      }
    return w.winnerClubId === myId
      ? {
          emoji: '🏆',
          title: 'Victory!',
          line: `Your club beat ${rival}. Tap for the results.`,
        }
      : {
          emoji: '💀',
          title: 'Defeat',
          line: `${rival} took this one. Tap for the results.`,
        }
  })()

  // Incoming race challenge prompt: the newest PENDING challenge someone
  // else sent me that I haven't answered. "Decide later" hides that one for
  // this session (it's still in the Race tab).
  const [laterChallengeIds, setLaterChallengeIds] = useState(() => new Set())
  const [challengeBusy, setChallengeBusy] = useState(null)
  const incomingChallenge = user?.id
    ? pvp.challenges.find(
        (c) =>
          c.status === 'PENDING' &&
          c.challengerId !== user.id &&
          !mySide(c, user.id).confirmed &&
          !laterChallengeIds.has(c.id)
      )
    : null

  // Ping the player the first time each challenge shows up: a buzz + chime,
  // and a system notification when the app is in the background (if they
  // allowed notifications - asked when they turn on Visibility).
  const notifiedChallengeIdsRef = useRef(new Set())
  useEffect(() => {
    const c = incomingChallenge
    if (!c || notifiedChallengeIdsRef.current.has(c.id)) return
    notifiedChallengeIdsRef.current.add(c.id)
    navigator.vibrate?.([120, 60, 120])
    playSfx('chime')
    if (
      document.hidden &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        const n = new Notification('Race challenge! ⚔️', {
          body: `${playerName(null, c.challengerName) || 'A runner'} wants to race you for ${c.stakeAmount} Fahhcoin.`,
          tag: `pvp-challenge-${c.id}`,
        })
        n.onclick = () => {
          window.focus()
          n.close()
        }
      } catch {
        // Some mobile browsers only allow notifications from a service
        // worker - the in-app prompt still shows when they come back.
      }
    }
  }, [incomingChallenge])

  async function answerChallenge(accept) {
    if (!incomingChallenge) return
    setChallengeBusy(accept ? 'accept' : 'decline')
    const updated = await pvp.review(incomingChallenge, accept)
    setChallengeBusy(null)
    if (updated) {
      refreshProfile()
      if (accept) {
        setPvpFocusId(updated.id)
        openMenu('race')
      }
    }
  }

  function putOffChallenge() {
    if (!incomingChallenge) return
    setLaterChallengeIds((prev) => new Set(prev).add(incomingChallenge.id))
  }

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
  // Plays the globe rotate-and-dive reveal (GameIntroGlobe) once gameReady
  // flips true, right before the loading overlay lifts - see the overlay's
  // render below.
  const [introPlaying, setIntroPlaying] = useState(true)

  // Starts the dive the moment loading finishes, instead of waiting for a
  // "tap anywhere" - see the overlay's render below. Music itself starts
  // from its own effect further down (keyed on gameReady, not this), so
  // there's exactly one place trying to play it.
  useEffect(() => {
    if (!gameReady || introStarted) return
    setIntroStarted(true)
  }, [gameReady, introStarted])

  useEffect(() => {
    if (!gameReady || introPlaying || weatherHypeShownRef.current) return
    // Marked shown inside the timeout, not before it - StrictMode's dev-only
    // effect double-run would otherwise clear the timer and never show it.
    const show = setTimeout(() => {
      weatherHypeShownRef.current = true
      setWeatherHype(pickWeatherHype(mapAmbience))
    }, 600)
    return () => clearTimeout(show)
    // Only the moment the intro reveal finishes matters, not later sky
    // refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady, introPlaying])
  useEffect(() => {
    if (!weatherHype) return
    // Matches .game-weather-toast-progress's own 5s CSS animation exactly -
    // change one, change the other.
    const hide = setTimeout(() => setWeatherHype(null), 5000)
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
        ownerName: playerName(null, standingIn.ownerName) || 'a rival',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerLocation, nearbyParcels])

  useEffect(() => {
    if (!territoryEntryBanner) return
    const timeout = setTimeout(() => setTerritoryEntryBanner(null), 3200)
    return () => clearTimeout(timeout)
  }, [territoryEntryBanner])

  // The player character's facing direction (see animatedMarkerHero's
  // rotating marker in TerritoryMap.jsx) - GPS movement ONLY, never the
  // device compass. Real GPS/WiFi fixes jitter by meters even standing
  // still (MAX_ACCEPTABLE_ACCURACY_METERS admits up to 20m-accuracy points,
  // and network/WiFi positioning can report a meaningfully different "best
  // guess" position on consecutive polls with zero real movement), so
  // naively recomputing a heading from any nearby fix's position DELTA
  // alone - even a fairly large one - would spin the character on pure
  // positioning noise instead of real movement. The fix a real nav SDK
  // uses: never re-orient off position deltas alone, corroborate with the
  // fix's own reported SPEED (an independently measured quantity, not
  // inferred from consecutive positions) before trusting any heading
  // change at all - preferring the GPS chip's own reported course
  // (coords.heading, see useRunTracker.js - still a GPS-derived value, not
  // a magnetometer/compass reading) when speed clears the floor, else only
  // a recomputed bearing between the last accepted point and the new one
  // once the movement also clearly exceeds both fixes' combined accuracy
  // margin (MIN_BEARING_MOVEMENT_METERS - the "minimum movement threshold"
  // tunable). Easing into any new heading (smoothAngle) instead of
  // snapping straight to it - the marker itself eases this further still
  // (see TerritoryMap.jsx's ROTATION_EASE_MS/useSmoothMarkerHeading).
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

  // Turn-by-turn cue for RouteTurnIndicator, live while actually running a
  // viewed route (see handleRunViewedRoute) - null the rest of the time so
  // nothing is computed (or rendered) on every GPS fix otherwise.
  const routeGuidance =
    followingRoute && tracker.status === 'tracking' && playerLocation
      ? getRouteGuidance(viewingRoute?.points, playerLocation, playerHeading)
      : null

  // The full remaining path to the route's destination, not just a short
  // stretch ahead - Google Maps' own "line to destination" while driving.
  // Re-derived fresh on every GPS fix, so the covered ground drops off the
  // front of this line as the runner progresses instead of the line
  // staying the fixed length it started at.
  const routeGuidanceLine =
    routeGuidance && !routeGuidance.arrived
      ? routeGuidance.remainingPoints
      : null

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
    !introPlaying &&
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
      return profileData
    } catch {
      // Leave whatever's already loaded in place - a background refresh
      // failing isn't worth surfacing as an error.
      return null
    }
  }

  // Snapshot of level/xp taken right before a run is submitted (see
  // attemptSubmit) - compared against the fresh profile once the server has
  // actually finished processing that run (territory outcome known, or a
  // race/war run just logged) to drive the XP reward popup. Cleared after
  // use, and on a failed submit, so it never pairs with some later run.
  const runXpBeforeRef = useRef(null)
  const [xpReward, setXpReward] = useState(null)
  async function refreshProfileAfterRun() {
    const before = runXpBeforeRef.current
    runXpBeforeRef.current = null
    const after = await refreshProfile()
    if (!before || !after) return
    if (after.xp > before.xp || after.level > before.level) {
      setXpReward({
        beforeLevel: before.level,
        beforeXp: before.xp,
        afterLevel: after.level,
        afterXp: after.xp,
      })
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
  // the free Comet sprite/local avatar pick - see avatarSrc/
  // animatedMarkerHero below), not just the Shop tab's own equip/buy UI.
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
    loadMyRouteOverlays()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locating, isAuthed])

  // Background music, looped for as long as the game is open - starts the
  // instant loading finishes (gameReady), not on first user input, and
  // never while the loading screen is still up (that's what gameReady,
  // not isAuthed, gates on - isAuthed alone can be true well before the
  // map/sky finish loading). The native app shells don't need any of the
  // fallback below - Android's WebView has media-gesture blocking turned
  // off in MainActivity.onCreate, and Capacitor's iOS bridge already ships
  // with mediaTypesRequiringUserActionForPlayback = [] by default (checked
  // node_modules/@capacitor/ios/.../CAPBridgeViewController.swift directly
  // - nothing to configure there for this Capacitor version) - so the
  // first play() below just succeeds in both. A plain browser tab (or a
  // WebView that still blocks it) rejects that first call with
  // NotAllowedError instead; the retry listeners below are what catch it
  // the moment a real gesture exists, with no popup/prompt of any kind -
  // the track just starts whenever the browser lets it.
  useEffect(() => {
    if (!gameReady) return
    const audio = musicRef.current
    if (!audio) return
    audio.volume = 0.35

    // Actually paused when muted (not just audio.muted = true) - a muted-
    // but-still-playing element doesn't make sound either way, but the
    // brief this was built against specifically wants the track stopped,
    // not silently running in the background.
    if (musicMuted) {
      audio.pause()
      return undefined
    }

    let retrying = false

    function tryPlay() {
      audio
        .play()
        .then(() => {
          if (retrying) removeRetryListeners()
        })
        .catch(() => {
          if (!retrying) {
            retrying = true
            addRetryListeners()
          }
        })
    }

    // once: true so each only ever fires once - tryPlay removes the other
    // two itself on success, same as it would on its own. Calling play()
    // again here is harmless even if it's already playing (a no-op
    // resolved promise), so there's no "did this already fire" state to
    // track beyond that.
    function addRetryListeners() {
      document.addEventListener('pointerdown', tryPlay, { once: true })
      document.addEventListener('touchstart', tryPlay, { once: true })
      document.addEventListener('keydown', tryPlay, { once: true })
    }
    function removeRetryListeners() {
      document.removeEventListener('pointerdown', tryPlay)
      document.removeEventListener('touchstart', tryPlay)
      document.removeEventListener('keydown', tryPlay)
    }

    // Backgrounding the tab/app pauses it outright (not just silenced) -
    // coming back tries again the same way the initial mount did, which
    // just works without a fresh gesture once the very first play() this
    // session has already succeeded (same browser-side "unlocked" state
    // a click would grant, it doesn't reset on backgrounding).
    function handleVisibility() {
      if (document.hidden) {
        audio.pause()
      } else {
        tryPlay()
      }
    }

    tryPlay()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      removeRetryListeners()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [gameReady, musicMuted])

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

  // Same shape as toggleMusicMuted above, just delegating the actual
  // persistence (and cutting off any effect mid-play) to gameSound.js's
  // setSfxMuted, which is also what playSfx itself reads - this is purely
  // the React side of that one shared flag.
  function toggleSfxMuted() {
    setSfxMutedState((prev) => {
      const next = !prev
      persistSfxMuted(next)
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
      playSfx('chime')
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
      playSfx('menu')
    } else {
      playSfx('tap')
    }
  }

  async function loadLeaderboard(scope = individualScope) {
    setLeaderboardError(null)
    setLeaderboardLoading(true)
    try {
      if (scope === 'city') {
        const list = await getTopIndividualsLocal(20)
        setLeaderboard(list || [])
      } else {
        const page = await findIndividualLeaderboard(1, 20)
        setLeaderboard(page?.content || [])
      }
    } catch (err) {
      setLeaderboardError(
        err instanceof ApiError
          ? err.message
          : scope === 'city'
            ? "Could not load your city's leaderboard."
            : 'Could not load the leaderboard.'
      )
    } finally {
      setLeaderboardLoading(false)
    }
  }

  async function loadClubLeaderboard(scope = clubScope) {
    setLeaderboardError(null)
    setLeaderboardLoading(true)
    try {
      if (scope === 'national') {
        const list = await getTopClubsNational(20)
        setClubLeaderboard(list || [])
      } else {
        const page = await findClubLeaderboard(1, 20)
        setClubLeaderboard(page?.content || [])
      }
    } catch (err) {
      setLeaderboardError(
        err instanceof ApiError
          ? err.message
          : scope === 'national'
            ? "Could not load your country's club leaderboard."
            : 'Could not load the club leaderboard.'
      )
    } finally {
      setLeaderboardLoading(false)
    }
  }

  function switchLeaderboardMode(mode) {
    setLeaderboardMode(mode)
    if (mode === 'club' && clubLeaderboard.length === 0) loadClubLeaderboard()
    if (mode === 'individual' && leaderboard.length === 0) loadLeaderboard()
  }

  function switchIndividualScope(scope) {
    if (scope === individualScope) return
    setIndividualScope(scope)
    loadLeaderboard(scope)
  }

  function switchClubScope(scope) {
    if (scope === clubScope) return
    setClubScope(scope)
    loadClubLeaderboard(scope)
  }

  async function loadStore() {
    setStoreError(null)
    try {
      // 200, not 50 - same page size MailToolsPanel.jsx/EmoteAdminPanel.jsx
      // already use. The catalog grew past 50 active items once every
      // hero's numbered emote set was seeded (63 EMOTE rows alone), so a
      // 50-record single page silently dropped whole categories instead of
      // erroring - Territory/Trail (older rows, UUID-ordered with no
      // explicit sort from this call) just happened to land past the cut.
      const [catalogPage, owned] = await Promise.all([
        getStoreCatalog(1, 200),
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

  // A profile panel only knows the club's name (TerritoryProfileResponse has
  // no clubId), so this resolves it via the same exact-name search the
  // leaderboard's club rows skip past (they already have clubId) before
  // reusing the same openClubId/switchTab('club') flow.
  async function handleViewClubByName(clubName) {
    if (!clubName) return
    try {
      const page = await findClubs(1, 5, clubName)
      const match =
        (page?.content || []).find((c) => c.name === clubName) ||
        page?.content?.[0]
      if (!match) return
      setViewingProfile(null)
      setOpenClubId(match.id)
      switchTab('club')
    } catch {
      // Silent - worst case the badge just doesn't navigate this time.
    }
  }

  function handleMailClaimed(item) {
    if (item.type === 'STORE_ITEM_GRANT') {
      refreshOwnedItems()
      if (storeCatalog.length > 0) loadStore()
    }
    if (item.type === 'CLUB_INVITE') refreshProfile()
  }

  // Club war entry run - createRun sends clubWarId, and the server checks
  // the war is in BATTLE and the locked-in hero is equipped.
  function handleStartWarRun(war, { ourName, theirName } = {}) {
    setMenuOpen(false)
    setGpsErrorDismissed(false)
    setActiveWarRun({ id: war.id, ourName, theirName })
    tracker.start(null, { clubWarId: war.id })
  }

  // Equips the hero a player locked in for a club war (their war run is
  // rejected otherwise). Throws so ClubWarPanel can show the error.
  async function handleEquipWarHero(storeItem) {
    await equipStoreItem(storeItem.id)
    await loadStore()
  }

  function handleStartRace(challenge) {
    setMenuOpen(false)
    autoFinishedRaceIdRef.current = null
    beginCountdownThenStart(() =>
      tracker.start(null, { challengeId: challenge.id })
    )
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

  // History list, 5 per page, straight off the backend's own pagination
  // (POST /v1/run/find - already supports pageNumber/noOfRecords and
  // returns totalPages, confirmed by reading RunController/DataPagination
  // server-side rather than guessing) - sorted newest-first server-side
  // too (RunServiceImpl orders by startedAt descending by default), so no
  // client-side sort is needed any more.
  //
  // Territory runs are just runs with no eventId (see attemptSubmit below)
  // - getRuns() returns every run type, so this still filters per page
  // rather than trusting every row back is one this game itself created,
  // not one logged against an ENDURANCE event elsewhere in the app (see
  // TrackRunPanel.jsx). In practice that path isn't athlete-facing yet
  // (still admin/moderator-only - see SESSION_NOTES.md), so every real
  // player's pages come back untouched by this; it's just a safety net,
  // not the normal case. The backend has no way to filter eventId=null
  // itself (its generic search DTO has no IS-NULL operator), so a mixed
  // page in the rare case it ever matters can come back with fewer than 5
  // rows rather than silently wrong pagination math.
  //
  // silent: true fetches straight into the cache without touching visible
  // state - used for prefetching the next page in the background.
  const loadMyRunsPage = useCallback(async (pageNumber, { silent } = {}) => {
    const cached = myRunsCacheRef.current.get(pageNumber)
    if (cached) {
      if (!silent) {
        setMyRuns(cached.runs)
        setMyRunsPage(pageNumber)
        setMyRunsTotalPages(cached.totalPages)
        setMyRunsError(null)
      }
      return cached
    }
    if (!silent) {
      setMyRunsLoading(true)
      setMyRunsError(null)
    }
    try {
      const page = await getRuns(pageNumber, MY_RUNS_PAGE_SIZE)
      const entry = {
        runs: (page?.content || []).filter((r) => r.eventId == null),
        totalPages: Math.max(1, page?.totalPages || 1),
      }
      myRunsCacheRef.current.set(pageNumber, entry)
      if (!silent) {
        setMyRuns(entry.runs)
        setMyRunsPage(pageNumber)
        setMyRunsTotalPages(entry.totalPages)
      }
      return entry
    } catch (err) {
      if (!silent) {
        setMyRunsError(
          err instanceof ApiError ? err.message : 'Could not load your runs.'
        )
      }
      return null
    } finally {
      if (!silent) setMyRunsLoading(false)
    }
  }, [])

  // User-facing page change (Prev/Next/jump, or the tab reopening on page
  // 1) - scrolls the list into view and prefetches the page after this one
  // so a forward Next tap almost never has to wait.
  async function goToMyRunsPage(pageNumber) {
    const result = await loadMyRunsPage(pageNumber)
    myRunsListRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    if (result && pageNumber < result.totalPages) {
      loadMyRunsPage(pageNumber + 1, { silent: true })
    }
  }

  // A new run shifts every page's contents by one - the whole cache is
  // stale, not just page 1.
  function resetMyRunsPagination() {
    myRunsCacheRef.current.clear()
    setMyRuns([])
    setMyRunsPage(1)
    setMyRunsTotalPages(1)
    setMyRunsError(null)
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

  async function loadMyRoutes(pageNumber = 1) {
    try {
      const page = await findMyRoutes(pageNumber, ROUTES_PAGE_SIZE)
      setMyRoutes(page?.content || [])
      setMyRoutesPage(pageNumber)
      setMyRoutesTotalPages(Math.max(1, page?.totalPages || 1))
    } catch {
      // Leave whatever's already loaded in place.
    } finally {
      setMyRoutesLoaded(true)
    }
  }

  // Always-on map layer (not gated by the Me tab or tapping a row) - every
  // route the player owns, so a route they drew keeps showing up on every
  // visit, not just right after they draw it. Capped at the 20 most recent
  // so a player with a long history doesn't trigger dozens of requests.
  async function loadMyRouteOverlays() {
    try {
      const page = await findMyRoutes(1, 20)
      const summaries = page?.content || []
      const details = await Promise.all(
        summaries.map((r) => getRoute(r.id).catch(() => null))
      )
      setMyRouteOverlays(
        details
          .filter((d) => d && d.points?.length > 0)
          .map((d) => ({ id: d.id, points: d.points }))
      )
    } catch {
      // Leave whatever's already loaded in place.
    }
  }

  // Shared by the My Routes list rows and the map-viewer toast, so flipping
  // visibility from either place keeps both in sync. Only updates state on
  // a confirmed server response - never flips the shown label optimistically.
  async function handleToggleRouteVisibility(route) {
    const nextVisibility = route.visibility === 'CLUB' ? 'PRIVATE' : 'CLUB'
    setRouteVisibilityBusyId(route.id)
    setMyRoutesError(null)
    try {
      const updated = await toggleRouteVisibility(route.id)
      const resolvedVisibility = updated?.visibility ?? nextVisibility
      setMyRoutes((prev) =>
        prev.map((r) =>
          r.id === route.id ? { ...r, visibility: resolvedVisibility } : r
        )
      )
      setViewingRoute((prev) =>
        prev && prev.id === route.id
          ? { ...prev, visibility: resolvedVisibility }
          : prev
      )
    } catch (err) {
      setMyRoutesError(
        err instanceof ApiError ? err.message : 'Could not update that route.'
      )
    } finally {
      setRouteVisibilityBusyId(null)
    }
  }

  // Shared by Me > My Routes and Club > Shared Routes - only getRoute()
  // carries the full point list the other two list endpoints don't.
  async function handleViewRoute(routeId) {
    setLoadingRouteId(routeId)
    try {
      const detail = await getRoute(routeId)
      setViewingRoute(detail)
      setMenuOpen(false)
    } catch {
      // Leave the list as-is; the row just stops showing a loading state.
    } finally {
      setLoadingRouteId(null)
    }
  }

  function handleCloseViewingRoute() {
    setViewingRoute(null)
  }

  function handleStartDrawRoute() {
    setMenuOpen(false)
    setRadialOpen(false)
    setViewingRoute(null)
    setRouteDraftWaypoints([])
    setRouteDraftSegments([])
    setRouteDraftError(null)
    setSaveRouteError(null)
    setRouteConfirmCancel(false)
    setRouteDraftMode(true)
  }

  // First tap just plants the start - every tap after that snaps the new
  // stretch to a road via OSRM (see utils/routeSnapping.js) before it's
  // added, so the saved route is a real path, not a straight line through
  // buildings.
  async function handleDrawMapClick(point) {
    if (routeSnapBusy) return
    setRouteDraftError(null)
    if (routeDraftWaypoints.length === 0) {
      setRouteDraftWaypoints([point])
      setRouteDraftSegments([[point]])
      return
    }
    const previous = routeDraftWaypoints[routeDraftWaypoints.length - 1]
    setRouteSnapBusy(true)
    try {
      const { points, snapped } = await snapSegment(previous, point)
      setRouteDraftWaypoints((prev) => [...prev, point])
      setRouteDraftSegments((prev) => [...prev, points])
      if (!snapped) {
        setRouteDraftError(
          "Couldn't snap that stretch to a road — drew a straight line instead."
        )
      }
    } finally {
      setRouteSnapBusy(false)
    }
  }

  function handleUndoRoutePoint() {
    if (routeDraftWaypoints.length === 0) return
    setRouteDraftWaypoints((prev) => prev.slice(0, -1))
    setRouteDraftSegments((prev) => prev.slice(0, -1))
    setRouteDraftError(null)
  }

  function handleRequestCancelDrawing() {
    setRouteConfirmCancel(true)
  }

  function handleConfirmCancelDrawing() {
    setRouteConfirmCancel(false)
    setRouteDraftMode(false)
    setRouteDraftWaypoints([])
    setRouteDraftSegments([])
    setRouteDraftError(null)
  }

  function handleFinishDrawing() {
    if (routeDraftWaypoints.length < 2) {
      setRouteDraftError('Tap at least two points before finishing.')
      return
    }
    setRouteNameInput('')
    setSaveRouteError(null)
    setRouteNamePromptOpen(true)
  }

  async function handleSaveRoute({ name, visibility }) {
    setSavingRoute(true)
    setSaveRouteError(null)
    try {
      const created = await createRoute({
        name,
        visibility,
        points: routeDraftPoints,
      })
      setRouteNamePromptOpen(false)
      setRouteDraftMode(false)
      setRouteDraftWaypoints([])
      setRouteDraftSegments([])
      // Keeps the just-drawn route on the map instead of it vanishing the
      // moment it's saved - the points are already in hand (what was just
      // sent to create it), so no need to re-fetch them.
      setViewingRoute({ ...created, points: routeDraftPoints })
      setMyRouteOverlays((prev) => [
        { id: created.id, points: routeDraftPoints },
        ...prev,
      ])
      setMyRoutesLoaded(false)
      loadMyRoutes()
    } catch (err) {
      setSaveRouteError(
        err instanceof ApiError ? err.message : 'Could not save that route.'
      )
    } finally {
      setSavingRoute(false)
    }
  }

  function switchTab(nextTab) {
    // Heroes now live inside the Shop tab.
    const tab = nextTab === 'heroes' ? 'shop' : nextTab
    setMenuTab(tab)
    if (tab === 'leaderboard' && leaderboard.length === 0) loadLeaderboard()
    // loadStore also loads the heroes, plus owned items for their badges.
    if (tab === 'shop' && storeCatalog.length === 0) loadStore()
    // Club Wars' hero lock-in needs owned heroes + the catalog for names.
    if (tab === 'club' && storeCatalog.length === 0) loadStore()
    // Me tab's Medals grid needs the MEDAL catalog + owned items too.
    if (tab === 'me' && storeCatalog.length === 0) loadStore()
    // Always back to page 1 on reopening the tab - cheap when it's
    // already cached (no fetch, no flash), a real fetch otherwise.
    if (tab === 'me') goToMyRunsPage(1)
    if (tab === 'me' && !myRoutesLoaded) loadMyRoutes()
    if (tab === 'mail') mailbox.refresh()
    if (tab === 'race') pvp.refreshChallenges()
  }

  // Plain territory draw - same "3 2 1 GO" pre-run countdown as PvP races
  // and guided route runs (see beginCountdownThenStart).
  function handleStartRun() {
    beginCountdownThenStart(() => tracker.start(null))
  }

  // Training - the exact same plain territory draw as Start Run (same
  // submit path, same exp/territory/leaderboard outcome - see
  // useRunTracker's isTraining comment), just entered from its own menu
  // screen and with Pause/Resume available on the run panel. Closes the
  // menu first, same as handleStartRace, so the countdown/run take over the
  // full screen instead of playing out behind it.
  function handleStartTraining() {
    setMenuOpen(false)
    beginCountdownThenStart(() => tracker.start(null, { isTraining: true }))
  }

  // "Run This Route" on the viewingRoute toast - same plain loop run as
  // Start Run, just with followingRoute on so the turn-by-turn HUD guides
  // the runner along viewingRoute.points instead of leaving them to eyeball
  // the blue line. Ending the run (Submit/Discard) is the same existing
  // flow every other run uses - a closed loop is still what gets saved as
  // territory, the route is only ever a guide, never submitted itself.
  function handleRunViewedRoute() {
    setFollowingRoute(true)
    beginCountdownThenStart(() => tracker.start(null))
  }

  function handleCancelTracking() {
    tracker.stop()
    tracker.clearPendingRun()
  }

  // The run stops (End, or GPS/motion kicks it back to idle) -> nothing
  // left for the turn HUD to guide, and the route's own info toast would
  // just overlap the pendingRun save card that takes over the bottom sheet
  // next, so both clear together instead of reappearing stale.
  // tracker.status reads 'idle' both BEFORE the run has actually started
  // (the 3-2-1-GO countdown runs with followingRoute already true, since
  // handleRunViewedRoute sets it before the countdown even begins) and
  // AFTER it ends - this ref is what tells those two apart, so the guide
  // line doesn't get wiped out before the run ever gets going.
  const routeRunStartedRef = useRef(false)
  useEffect(() => {
    if (!followingRoute) {
      routeRunStartedRef.current = false
      return
    }
    if (tracker.status === 'tracking') {
      routeRunStartedRef.current = true
      return
    }
    if (routeRunStartedRef.current) {
      routeRunStartedRef.current = false
      setFollowingRoute(false)
      setViewingRoute(null)
    }
  }, [tracker.status, followingRoute])

  // The territory info box closes itself after a few seconds (the Close
  // button still works). Each new tap sets a fresh object, restarting the
  // timer, and closing it also clears the map highlight, same as Close.
  // Suppressed while a run-this-territory size/distance warning is up -
  // that's an active decision (Continue anyway / Cancel), not something
  // that should get yanked away mid-read. Longer when a Run/Defend button
  // is actually showing (a real decision to make, not just a glance) than
  // the plain read-only case.
  useEffect(() => {
    if (!highlightedEntry || territoryRunWarning) return
    const canRun = (highlightedEntry.points?.length || 0) >= 3
    const autoClose = setTimeout(
      () => setHighlightedEntry(null),
      canRun ? 8000 : 4000
    )
    return () => clearTimeout(autoClose)
  }, [highlightedEntry, territoryRunWarning])

  // Tapping a claimed parcel directly on the map is a stronger signal than
  // tapping a leaderboard row (the player already has it in view), so this
  // skips the "view on map?" confirm dialog and goes straight to the same
  // highlight/focus toast the leaderboard flow produces.
  function handleParcelClick(parcel) {
    // A territory polygon's own click bubbles up to the map's click too
    // (it isn't stopped - see DrawClickCatcher), so while drawing a route
    // this still also plants a point under the tap, same as anywhere
    // else on the map - routes aren't claims, so there's nothing stopping
    // one from crossing someone else's territory. Only the "whose ground
    // is this" popup is suppressed, since it has nothing to do with
    // drawing and would just get in the way.
    if (routeDraftMode) return
    const isMine = Boolean(user?.id) && parcel.ownerId === user.id
    // Avatar: the owner's own real uploaded profile picture, never a
    // cosmetic (equipped Hero skin, map marker art, etc.) - only ever shown
    // for the player's own tapped territory (`user.profilePictureUrl`).
    // TEMP: other players' real photos are hidden here for now - this
    // popup falls back to their colored initial instead.
    // Run score: TerritoryParcel.currentScore, summed across exactly the
    // parcels that make up this tapped (merged) shape - see
    // toDisplayParcel's own comment on why this isn't a player-wide total.
    const runScore = (parcel.sourceIds || [])
      .map((id) => nearbyParcels.find((p) => p.id === id))
      .filter(Boolean)
      .reduce((sum, p) => sum + (p.currentScore || 0), 0)
    setTerritoryRunWarning(null)
    setHighlightedEntry({
      userId: parcel.ownerId,
      fullName: parcel.ownerName,
      areaSqMeters: parcel.area,
      avatarSrc: isMine
        ? resolveFileUrl(user?.profilePictureUrl) || null
        : null,
      // The territory's own display color (gold for mine, hashed/shade for
      // anyone else - see toDisplayParcel) - the avatar's ring color.
      color: parcel.color,
      runScore,
      // The full boundary ring, for "Run/Defend this territory" to walk as
      // a guide loop (see handleRunTerritory) - never submitted itself,
      // only ever a guide the same way a saved route is.
      points: parcel.points,
    })
  }

  // A loop longer than this is a long run to commit to by accident - the
  // spec's own "over 10 km" example.
  const TERRITORY_RUN_WARN_MAX_METERS = 10000
  // A loop this short isn't really worth a turn-by-turn guide (likely a
  // sliver/edge case parcel) - warn rather than silently guide something
  // this trivial.
  const TERRITORY_RUN_WARN_MIN_METERS = 40
  // Past this far from the generated loop's own start point, flag it in
  // the confirm toast (not a separate "navigate there first" mode - the
  // guide's own off-route steering, see routeNav.js, already points the
  // runner at the nearest point on the loop the moment the run begins,
  // starting point included).
  const TERRITORY_RUN_FAR_START_METERS = 150

  // Builds the boundary-loop guide route for `entry` (a highlightedEntry -
  // see handleParcelClick) and starts running it through the exact same
  // viewingRoute/followingRoute flow a saved "Run This Route" already uses
  // (see handleRunViewedRoute) - nothing here duplicates that guidance
  // logic, it only ever produces the point list that feeds it. `force`
  // skips the size warning below, used by the warning toast's own
  // "Continue anyway" button.
  function handleRunTerritory(entry, { force = false } = {}) {
    if (!entry?.points || entry.points.length < 3) return
    if (tracker.status !== 'idle' || pendingRun) return
    if (!playerLocation) {
      setTerritoryRunWarning(
        'Enable location to generate a route for this territory.'
      )
      return
    }
    const route = generateTerritoryLoopRoute(entry.points, playerLocation)
    if (!route) return
    if (!force) {
      if (route.distanceMeters > TERRITORY_RUN_WARN_MAX_METERS) {
        setTerritoryRunWarning(
          `This loop is ${formatMeters(route.distanceMeters)} around — that's a long run. Continue anyway?`
        )
        return
      }
      if (route.distanceMeters < TERRITORY_RUN_WARN_MIN_METERS) {
        setTerritoryRunWarning(
          `This loop is only ${formatMeters(route.distanceMeters)} around — barely worth guiding. Continue anyway?`
        )
        return
      }
    }
    setTerritoryRunWarning(null)
    setHighlightedEntry(null)
    setViewingRoute({
      id: null,
      name: isMyEntry(entry)
        ? 'Defend Your Territory'
        : `${playerNameOf(entry)}'s Territory`,
      points: route.points,
      distanceMeters: route.distanceMeters,
      // Never a saved route - no visibility/ownerId, so the "Share with
      // Club"/"Make Private" controls (gated on ownerId === user?.id, see
      // the viewingRoute toast below) never show for a generated one.
      visibility: null,
      ownerId: null,
    })
    handleRunViewedRoute()
  }

  // Tapping one of your own parcels in the "Me" tab list — same direct
  // highlight/focus flow as handleParcelClick above (no confirm dialog,
  // since picking a specific row is already an explicit choice), just
  // sourced from the paginated my-parcels list instead of the map.
  function handleViewMyParcel(territory) {
    setTerritoryRunWarning(null)
    setHighlightedEntry({
      userId: user?.id,
      fullName: user?.fullName,
      areaSqMeters: territory.area,
      // The player's own real uploaded profile picture, not a cosmetic -
      // see handleParcelClick's own comment on this.
      avatarSrc: resolveFileUrl(user?.profilePictureUrl) || null,
      // Always PLAYER_COLOR here (never territory.color - myTerritories'
      // own merge drops it, see mergeTouchingParcels) since this handler
      // only ever runs for the logged-in player's own territory.
      color: PLAYER_COLOR,
      // myTerritories' own currentScore (see its useMemo) - the real
      // total for this whole merged cluster, not the nearby-parcels
      // approximation handleParcelClick falls back to for other owners.
      runScore: territory.currentScore,
      points: territory.points,
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
    // Keyed on runId so RunScoreCard remounts fresh per run (its own
    // "new best" check runs once per mount - see RunScoreCard.jsx) instead
    // of reusing a stale instance across two different runs' results.
    const scoreMode = completedRun.isWar
      ? 'club_war'
      : completedRun.isRace
        ? 'pvp'
        : 'territory'
    return (
      <>
        <div className="game-controls-stats game-claim-toast-stats">
          <span className="game-stat">
            <span className="game-stat-value">
              {formatDistance(completedRun.distance)}
            </span>
            <span className="game-stat-label">Distance</span>
          </span>
          <span className="game-stat">
            <span className="game-stat-value">
              {formatPace(completedRun.avgPace)}
            </span>
            <span className="game-stat-label">Pace</span>
          </span>
          <span className="game-stat">
            <span className="game-stat-value">
              {formatDuration(completedRun.duration)}
            </span>
            <span className="game-stat-label">Time</span>
          </span>
        </div>
        <RunScoreCard
          key={completedRun.id}
          breakdown={runScoreBreakdown}
          mode={scoreMode}
        />
      </>
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
        message: `Only ${formatMeters(pendingRun.distance)} covered — runs need at least ${MIN_VALID_RUN_DISTANCE_METERS}m to count. Shake it off and go again.`,
      })
      return
    }
    if (pendingRun.duration < MIN_VALID_RUN_DURATION_SECONDS) {
      setSaveError({
        title: "That's a warm-up, not a run 😅",
        message: `Only ${formatDuration(pendingRun.duration)} on the clock — runs need at least ${MIN_VALID_RUN_DURATION_SECONDS}s to count. Shake it off and go again.`,
      })
      return
    }
    setSaving(true)
    setSaveError(null)
    setRunScoreBreakdown(null)
    const submittedAt = new Date()
    runXpBeforeRef.current = profile
      ? { level: profile.level, xp: profile.xp }
      : null
    try {
      const created = await createRun({
        eventId: null,
        points: pendingRun.points,
        distance: pendingRun.distance,
        duration: pendingRun.duration,
        startedAt: toLocalDateTimeString(pendingRun.startedAt),
        endedAt: toLocalDateTimeString(pendingRun.endedAt),
        challengeId: pendingRun.challengeId || undefined,
        clubWarId: pendingRun.clubWarId || undefined,
      })
      reminders.notifyRunSaved()
      // The History list's every page shifts by one with a new run saved -
      // next time the Me tab is open, it re-fetches from page 1 instead of
      // showing the now-stale cache.
      resetMyRunsPagination()
      if (pendingRun.challengeId) pvp.refreshChallenges()
      const isRace = Boolean(pendingRun.challengeId)
      const isWar = Boolean(pendingRun.clubWarId)
      // Watched from here, not just inside pollForTerritoryResult below -
      // a Club War/Boss Fight run also gets a score push (just never a
      // territory-event poll), so this needs to be set for every mode, not
      // only the territory-capture one.
      watchedRunIdRef.current = created.id
      settledRunIdRef.current = null
      setCompletedRun({
        id: created.id,
        isRace,
        isWar,
        points: pendingRun.points,
        distance: pendingRun.distance,
        duration: pendingRun.duration,
        avgPace: created.avgPace,
      })
      discardDraft()
      setSaving(false)
      // Territory is only ever closed off a plain draw run - a PvP race or
      // Club War entry logs the run for its own scoring and has nothing to
      // do with claiming ground, so it skips the territory check/poll
      // entirely instead of showing "Checking your territory…" for a check
      // that was never going to happen.
      if (isRace || isWar) {
        setRunResult({ phase: 'submitted' })
        // Club War/Boss Fight runs DO get a score push (pace + base effort
        // only, no territory - see TerritoryProcessingServiceImpl); a PvP
        // race never does (scored entirely separately), so this just finds
        // nothing and runScoreBreakdown stays null for that mode, same as
        // ever - RunScoreCard already renders nothing in that case.
        const early = runOutcomesRef.current[created.id]
        if (early) setRunScoreBreakdown(early)
        // A race/war run's XP is awarded by the same async processing a
        // conquer run's territory check waits on, but there's no
        // poll/socket signal for these modes to know when it's landed - a
        // short delay gives it a reasonable chance without building a full
        // poll loop for it. If it's not there yet, the reward just quietly
        // doesn't show (same as today) rather than showing a wrong number.
        setTimeout(refreshProfileAfterRun, 3000)
      } else {
        pollForTerritoryResult(submittedAt, created.id)
      }
    } catch (err) {
      runXpBeforeRef.current = null
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
    if (early) {
      setRunScoreBreakdown(early)
      if (showRunOutcome(early)) return
    }
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
          refreshProfileAfterRun()
          refreshNearbyParcels()
          return
        }
      } catch {
        // A transient failure here shouldn't cut the wait short - just try again.
      }
    }
    if (settledRunIdRef.current === runId) return
    setRunResult({ phase: 'timeout' })
    refreshProfileAfterRun()
    refreshNearbyParcels()
  }

  async function handlePurchase(item) {
    setStoreActionError(null)
    setPurchaseError(null)
    setPurchasing(true)
    try {
      await purchaseStoreItem(item.id)
      await loadStore()
      refreshProfile()
      setStoreChoice(null)
    } catch (err) {
      // Shown inside the confirm pop-up - the Shop's own error line sits
      // behind it (and behind the hero modal), where nobody sees it.
      setPurchaseError(
        err instanceof ApiError ? err.message : 'Could not complete purchase.'
      )
    } finally {
      setPurchasing(false)
    }
  }

  function closeStoreChoice() {
    setStoreChoice(null)
    setPurchaseError(null)
  }

  // Esc closes the buy/showcase popup, same as clicking the X or outside it.
  useEffect(() => {
    if (!storeChoice) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeStoreChoice()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [storeChoice])

  // Esc closes the athlete profile overlay, same as its own X or backdrop.
  useEffect(() => {
    if (!viewingProfile) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') setViewingProfile(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewingProfile])

  // useCallback (empty deps - every function this touches, including
  // loadStore/loadHeroes, only closes over stable setState setters and
  // imported API calls, never per-render state, so there's nothing to go
  // stale) so ColorShelf below can actually be React.memo'd - passing a
  // plain function here would hand it a new prop identity every render
  // and defeat that memo regardless of how stable its other props are.
  const handleEquip = useCallback(async (item, isEquipped) => {
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
      toast.push(
        isEquipped
          ? "Couldn't unequip, try again."
          : "Couldn't equip, try again.",
        { type: 'error' }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Memoized (not just filtered inline) because GamePage re-renders every
  // few seconds from the standing GPS watch above (liveLocation) whether
  // or not the Shop is even open - without this, every one of those ticks
  // handed ColorShelf a brand-new array, which not only re-ran this filter
  // for nothing but also defeated any attempt to skip its own re-render
  // (see that component's own React.memo), since a changed array
  // reference looks like changed data even when none of the items
  // actually did.
  const galleryHeroes = useMemo(
    () => heroes.filter((h) => !isPlaceholderHero(h.name)),
    [heroes]
  )
  // Shop shelves: heroes live in the hero gallery; the two colour
  // categories get their own preview shelves (ColorShelf). The old
  // catch-all Items list is gone - other categories (borders, profile
  // backgrounds, phrases…) aren't sold in the Shop for now. Seeded default
  // colours stay: they're real colours the player owns and can switch back
  // to. Emotes don't have a Shop shelf of their own either - they're
  // browsed from inside each hero's own HeroDetailModal now (see
  // HeroEmoteStage there) - but EMOTE StoreItems are still read straight
  // off storeCatalog for that, no separate memo needed here. Skins removed
  // (TEMP - see constants/avatars.js-era notes for the pattern this
  // followed); the backend may still return SKIN items, they're just never
  // requested/rendered here any more.
  const shadeItems = useMemo(
    () => storeCatalog.filter((i) => i.category === 'TERRITORY_SHADE'),
    [storeCatalog]
  )
  const trailItems = useMemo(
    () => storeCatalog.filter((i) => i.category === 'TRAIL_COLOR'),
    [storeCatalog]
  )
  // One-time dev-tools check that every real backend EMOTE row has a local
  // asset mapped for it (see utils/emotes.js) - a silent gap would
  // otherwise just look like a locked card with no clue why.
  useEffect(() => {
    warnMissingEmoteAssets(
      storeCatalog.filter((i) => i.category === 'EMOTE'),
      heroes
    )
  }, [storeCatalog, heroes])
  // HERO is the one real Store category that's actually an avatar-shaped
  // image (the others are borders/colors/backgrounds meant to layer onto a
  // profile picture, not stand in for one) — equipping one takes priority
  // over the local placeholder picker below since it's a real, owned item.
  // TEMP: the backend's placeholder "Default Hero" doesn't count - see
  // isPlaceholderHero - so new players land on Comet (the default hero
  // for now).
  // Declared up here (not next to currentAvatar) because activeHeroId reads
  // it — using it any earlier is a TDZ crash that blanks the whole page.
  const equippedHero = ownedItems.find(
    (o) =>
      o.equipped &&
      o.storeItem.category === 'HERO' &&
      !isPlaceholderHero(o.storeItem.name)
  )
  // The hero the player is actually playing as: an equipped Store Hero,
  // else Comet (the default for now).
  const activeHeroId = equippedHero
    ? equippedHero.storeItem.heroId
    : heroes.find((h) => isCometHero(h.name))?.id
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
    { id: 'leaderboard', label: 'Leaderboard', Icon: IconTrophy, tone: 'gold' },
    { id: 'club', label: 'Club', Icon: IconUsers, tone: 'green' },
    {
      id: 'race',
      label: 'PvP',
      Icon: IconSwords,
      tone: 'battle',
      badge: pvp.actionCount > 0 ? String(pvp.actionCount) : null,
    },
    {
      id: 'mail',
      label: 'Mail',
      Icon: MailBadgeIcon,
      // 'mail' tone now just marks "render bare, no medal circle" for
      // TabMedal below - the real mail_icon.png/.webp badge asset already
      // has its own circle built in, so there's nothing left for a badge to
      // add.
      tone: 'mail',
      badge:
        mailbox.unreadCount > 0
          ? mailbox.unreadCount > 9
            ? '9+'
            : String(mailbox.unreadCount)
          : null,
    },
    { id: 'me', label: 'Me', Icon: IconUser, tone: 'green' },
    { id: 'shop', label: 'Shop', Icon: IconStore, tone: 'wood' },
    { id: 'training', label: 'Training', Icon: IconRunning, tone: 'green' },
    { id: 'settings', label: 'Settings', Icon: IconSettings, tone: 'stone' },
  ]
  const activeMenuTab = menuTabs.find((t) => t.id === menuTab) || menuTabs[0]
  // Training is reached from the Play menu now, not this switcher - it
  // stays in menuTabs (above) so activeMenuTab still resolves its
  // icon/label/tone while its panel is open, it just isn't offered here.
  const switcherTabs = menuTabs.filter((tab) => tab.id !== 'training')
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
    ? playerName(
        null,
        raceChallenge.challengerId === user?.id
          ? raceChallenge.opponentName
          : raceChallenge.challengerName
      )
    : ''

  // Once the race's target distance is covered, the run ends and submits
  // itself - no more "hit End, then hit Submit". Guarded by a ref keyed on
  // the race id so it only fires once even though this effect re-runs on
  // every GPS fix while raceProgress keeps climbing.
  useEffect(() => {
    if (!raceChallenge) return
    if (tracker.status !== 'tracking') return
    if (raceProgress < 1) return
    if (autoFinishedRaceIdRef.current === raceChallenge.id) return
    autoFinishedRaceIdRef.current = raceChallenge.id
    const result = tracker.stop()
    attemptSubmit(result)
    // tracker.stop/attemptSubmit are stable enough across a run's lifetime
    // that re-running this on their identity isn't needed - only the race
    // progress actually crossing the finish line should retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceProgress, raceChallenge, tracker.status])

  const currentAvatar = getAvatarById(avatarId)
  const currentMapStyle = getMapStyleById(mapStyleId)
  const avatarSrc =
    (equippedHero && resolveFileUrl(equippedHero.storeItem.assetUrl)) ||
    currentAvatar?.src ||
    resolveFileUrl(user?.profilePictureUrl) ||
    defaultAvatarImage
  const activeHeroName = equippedHero
    ? equippedHero.storeItem.name
    : currentAvatar?.name
  // Any hero with a real bundled manifest (src/assets/heroes/<hero>/ - see
  // heroManifest.js) gets a full animated run-cycle sprite on the map
  // marker (TerritoryMap.jsx's getHero(...).map) instead of the flat
  // avatar photo; any other hero has no sheet built, so their marker stays
  // the flat image (see buildPlayerMarkerIcon there). Used to be a
  // hardcoded Blaze/Comet/Bolt-only ternary - heroManifest.js's own
  // hasHero() already auto-discovers every hero folder, so a new one (as
  // of the 2026-11-02 asset refresh: Cyclone/Nova/Phantom/Pulse) just
  // works here too without another line added.
  const animatedMarkerHero = hasHeroManifest(activeHeroName)
    ? activeHeroName.trim().toLowerCase()
    : null
  // Any hero with a real manifest also gets an animated turntable
  // (HeroSprite) instead of a flat image on the Me tab, whether it's the
  // real equipped Store Hero or just the free local avatars.js pick - any
  // other hero still falls back to Blaze's turntable (see HeroSprite.jsx).
  const showHeroTurntable = animatedMarkerHero != null
  const equippedProfileBackground = ownedItems.find(
    (o) => o.equipped && o.storeItem.category === 'PROFILE_BACKGROUND'
  )
  const equippedPhrase = ownedItems.find(
    (o) => o.equipped && o.storeItem.category === 'PHRASE'
  )
  // The Me tab's character display plays this (instead of the idle
  // turntable) when one's equipped - see the game-menu-hero render below.
  // resolveEquippedEmoteItem is the one shared selector every "which emote
  // is equipped" screen uses (also HeroDetailModal.jsx's HeroEmoteStage and
  // AthleteTerritoryProfilePanel.jsx), so there's exactly one definition of
  // "equipped" instead of three separate .find()s that could drift. Scoped
  // to the active hero's own heroId - equip is per-hero server-side, so a
  // player could have a different emote equipped for a hero they aren't
  // currently playing as; this is specifically the one that'll actually
  // play right now. Memoized so
  // GamePage's frequent unrelated re-renders (the standing GPS watch ticks
  // every few seconds) don't hand EmoteGlyph a new object identity and
  // force it to re-evaluate despite being memo()'d itself.
  const equippedEmoteItem = useMemo(
    () =>
      // ignoreHidden: true - this drives the Me tab's own hero display and
      // (via selfEmoteName below) AthleteTerritoryProfilePanel's isSelf
      // branch, both ALREADY-equipped displays, not a pick list - a hidden
      // emote (see emotes.js's HIDDEN_EMOTES) that's genuinely equipped
      // should still show here, same as it should for another player's
      // profile.
      resolveEquippedEmoteItem(
        ownedItems.filter((o) => o.equipped).map((o) => o.storeItem),
        activeHeroId,
        activeHeroName,
        { ignoreHidden: true }
      ),
    [ownedItems, activeHeroId, activeHeroName]
  )
  const equippedEmoteAsset = equippedEmoteItem
    ? resolveEmoteAsset(activeHeroName, equippedEmoteItem.name)
    : null
  // Falls back to idle (see game-menu-hero below) rather than a broken/
  // blank image if an equipped emote has no local art mapped - same gap
  // warnMissingEmoteAssets already catches for the Shop catalog generally,
  // this just also catches it live for whichever one is actually equipped.
  useEffect(() => {
    if (equippedEmoteItem && !equippedEmoteAsset) {
      console.warn(
        `[Me tab] equipped emote "${equippedEmoteItem.name}" has no local art for ${activeHeroName} - falling back to idle`
      )
    }
  }, [equippedEmoteItem, equippedEmoteAsset, activeHeroName])

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

  // Map style is purely cosmetic/local, so unlike the avatar
  // picker (which can override a real owned Sticker) there's nothing to
  // confirm - clicking applies immediately.
  function handleChooseMapStyle(style) {
    setMapStyleId(style.id)
    saveMapStyleId(style.id)
  }

  // Territories, runs, and Fahhcoin are all tied to a real account server-side
  // — nothing here works signed out, so the game itself never renders until
  // login is confirmed. userLoading gates this so a page refresh with a still-
  // valid token doesn't flash the gate before useCurrentUser() resolves.
  // GameAuthGate owns the welcome/sign-in/sign-up/forgot/set-password screens
  // (see src/components/game-auth/) - once any of them succeeds it calls
  // replaceUser(user), which updates useCurrentUser's cache and re-renders
  // this component with isAuthed now true, so the gate just stops rendering
  // rather than navigating anywhere (the player never leaves /game).
  if (!userLoading && !isAuthed) {
    return (
      <div className="game-page game-root">
        <Suspense
          fallback={
            <div className="game-loading-overlay">
              <GameLoadingBackdrop />
              <img
                src={runConquestLogo}
                alt="Run Conquest"
                className="game-loading-logo"
              />
            </div>
          }
        >
          <GameAuthGate
            onAuthenticated={(nextUser) => {
              replaceUser(nextUser)
              reminders.notifyLoggedIn()
            }}
            onBackStateChange={(fn) => {
              authBackRef.current = fn
            }}
          />
        </Suspense>
        <ExitConfirmOverlay backButton={backButton} />
      </div>
    )
  }

  return (
    <div
      className="game-page game-root"
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
          animatedMarkerHero={animatedMarkerHero}
          playerMoving={playerMoving}
          isFollowing={isFollowing}
          isTracking={tracker.status === 'tracking'}
          onUserPan={handleUserPan}
          isLoopRun={!tracker.challengeId && !tracker.clubWarId}
          drawActive={routeDraftMode}
          onDrawPoint={handleDrawMapClick}
          drawPoints={routeDraftPoints}
          viewRoutePoints={routeGuidanceLine ? null : viewingRoute?.points}
          ownRoutesOverlay={myRouteOverlays}
          onRouteClick={handleViewRoute}
          routeGuidanceLine={routeGuidanceLine}
          routeOffCourse={Boolean(routeGuidance?.offRoute)}
          // Every route here is a closed loop (territory claims require
          // one), so start and finish are the same point - shown whenever
          // a route is being previewed or actually run, not just while
          // drawing one.
          routeAnchorPoint={viewingRoute?.points?.[0] || null}
          onParcelClick={handleParcelClick}
          onMapReady={handleMapReady}
        />
      )}

      <AnimatePresence>
        {(!gameReady || introPlaying) && (
          <motion.div
            key="game-loading-overlay"
            className="game-loading-overlay"
            initial={false}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
          >
            {/* Hero artwork is only for the progress-bar phase - the globe
                phase (GameIntroGlobe below) reveals the loading overlay's
                own plain background instead (see .game-loading-overlay in
                GamePage.css), never the artwork. This exit fade is what
                makes that swap a 300ms crossfade instead of a hard cut -
                AnimatePresence unmounts the backdrop only once its exit
                animation finishes, so there's no frame where the globe
                phase starts with the artwork still (even briefly)
                showing behind it. */}
            <AnimatePresence>
              {!(gameReady && introStarted && introPlaying) && (
                <motion.div
                  key="game-loading-backdrop"
                  className="game-loading-backdrop-wrap"
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <GameLoadingBackdrop />
                </motion.div>
              )}
            </AnimatePresence>
            {gameReady && introStarted && introPlaying ? (
              <GameIntroGlobe
                center={center}
                styleUrl={currentMapStyle?.styleUrl}
                onDone={() => setIntroPlaying(false)}
              />
            ) : (
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
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {startCountdown != null && (
          <motion.div
            className="game-countdown-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={startCountdown}
                className={`game-countdown-value${
                  startCountdown === 'GO' ? ' is-go' : ''
                }`}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.4, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {startCountdown}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {gameReady && !introPlaying && rolloutStatus.showModal && (
        <RolloutRequestModal
          cityName={rolloutStatus.state.cityName}
          countryName={rolloutStatus.state.countryName}
          requestCount={rolloutStatus.state.requestCount}
          submitting={rolloutStatus.state.submitting}
          submitError={rolloutStatus.state.submitError}
          justRequested={rolloutStatus.state.justRequested}
          onRequest={rolloutStatus.request}
          onDismiss={rolloutStatus.dismiss}
        />
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
          <LevelBar
            level={profile.level}
            xp={profile.xp}
            name={playerNameOf(user)}
          />
        </button>
      )}

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
      </div>

      {/* Its own class (not .game-weather-hype, which the PvP/war alert
          banners further below still use as-is) so this redesign - circular
          emoji badge, temp pill, close button, auto-dismiss progress bar -
          can't change anything about how those two look or behave. */}
      <AnimatePresence>
        {weatherHype && (
          <motion.div
            key="weather-hype"
            className={`game-weather-toast key-${weatherHype.key}`}
            role="status"
            aria-label={`${weatherHype.title}. ${weatherHype.line}`}
            initial={{ opacity: 0, y: -28, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <span className="game-weather-toast-emoji-wrap" aria-hidden="true">
              <span className="game-weather-toast-emoji">
                {weatherHype.emoji}
              </span>
            </span>
            <span className="game-weather-toast-body">
              <span className="game-weather-toast-title-row">
                <strong className="game-weather-toast-title">
                  {weatherHype.title}
                </strong>
                {weatherHype.temp != null && (
                  <span className="game-weather-toast-temp">
                    {Math.round(weatherHype.temp)}°
                  </span>
                )}
              </span>
              <span className="game-weather-toast-line">
                {weatherHype.line}
              </span>
            </span>
            <button
              type="button"
              className="game-close-btn game-weather-toast-close"
              aria-label="Dismiss"
              onClick={() => setWeatherHype(null)}
            >
              <IconClose />
            </button>
            <span className="game-weather-toast-progress" aria-hidden="true" />
          </motion.div>
        )}
      </AnimatePresence>

      <RouteTurnIndicator
        guidance={routeGuidance}
        totalDistanceMeters={viewingRoute?.distanceMeters}
        onFinish={() => tracker.stop()}
      />

      {tracker.clubWarId && tracker.status === 'tracking' && (
        <div className="pvp-race-hud" role="status">
          ⚔️ Club war run
          {activeWarRun?.id === tracker.clubWarId && activeWarRun.theirName
            ? ` · ${activeWarRun.ourName} vs ${activeWarRun.theirName}`
            : ''}{' '}
          · every meter scores for the squad
        </div>
      )}

      {raceChallenge && tracker.status === 'tracking' && (
        <div
          className={`pvp-race-hud ${raceProgress >= 1 ? 'is-done' : ''}`}
          role="status"
        >
          {raceProgress >= 1
            ? `🏁 ${raceModeLabel} done! Submitting your race…`
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
        {warAlertCopy && (
          <motion.button
            type="button"
            key={`war-${warAlert.kind}-${warAlert.war.id}`}
            className={`game-weather-hype game-pvp-alert game-war-alert ${warAlert.kind === 'ended' ? 'is-ended' : ''}`}
            onClick={() => {
              clearWarAlert()
              openMenu('club')
            }}
            initial={{ opacity: 0, y: -40, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          >
            <span className="game-weather-hype-emoji" aria-hidden="true">
              {warAlertCopy.emoji}
            </span>
            <span className="game-weather-hype-body">
              <strong className="game-weather-hype-title">
                {warAlertCopy.title}
              </strong>
              <span className="game-weather-hype-line">
                {warAlertCopy.line}
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

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
        {announcementNotices.current && (
          <BroadcastPrompt
            key={announcementNotices.current.id}
            broadcast={announcementNotices.current}
            hasMore={announcementNotices.hasMore}
            onDismiss={announcementNotices.dismiss}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {incomingChallenge && (
          <ChallengePrompt
            key={incomingChallenge.id}
            challenge={incomingChallenge}
            busy={challengeBusy}
            error={challengeBusy ? null : pvp.error}
            onAccept={() => answerChallenge(true)}
            onDecline={() => answerChallenge(false)}
            onLater={putOffChallenge}
          />
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

      {tracker.status !== 'tracking' && radialOpen && (
        <div
          className="game-radial-scrim"
          onClick={() => setRadialOpen(false)}
        />
      )}

      {tracker.status !== 'tracking' && (
        <div className="game-fab-wrap">
          <AnimatePresence>
            {radialOpen &&
              (radialMode === 'play' ? PLAY_OPTIONS : RADIAL_ITEMS).map(
                (item, i) => {
                  const badge =
                    item.tab === 'mail'
                      ? mailbox.unreadCount
                      : item.tab === 'race'
                        ? pvp.actionCount
                        : 0
                  return (
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
                          if (item.tab === 'play') {
                            setRadialMode('play')
                            return
                          }
                          if (item.tab === 'conquer') {
                            setRadialOpen(false)
                            handleStartRun()
                            return
                          }
                          openMenu(item.tab)
                        }}
                        aria-label={item.label}
                        title={item.label}
                      >
                        <item.Icon />
                        {badge > 0 && (
                          <span className="game-menu-tab-badge game-radial-badge">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </button>
                    </motion.div>
                  )
                }
              )}
          </AnimatePresence>

          <button
            type="button"
            className={`game-menu-btn ${radialOpen ? 'is-open' : ''}`}
            onClick={() => setRadialOpen((open) => !open)}
            aria-label={radialOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={radialOpen}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={radialOpen ? 'close' : 'open'}
                className="game-menu-btn-icon"
                initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                {radialOpen ? (
                  <IconClose strokeWidth={4.5} />
                ) : (
                  <IconMenuOrb strokeWidth={4.5} />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      )}

      {/* Google Maps' own run-mode location control, shown as soon as the
          run starts tracking - toggles Free/Follow (see toggleFollow),
          sitting where the menu FAB would be since that's hidden while
          tracking anyway. North always stays up either way - the map never
          rotates (see TerritoryMap.jsx). */}
      {tracker.status === 'tracking' && (
        <button
          type="button"
          className="game-locate-btn"
          aria-label={
            mapMode === 'follow' ? 'Switch to free look' : 'Follow your run'
          }
          onClick={toggleFollow}
        >
          <IconCrosshairs />
        </button>
      )}

      <div
        className={`game-controls${
          tracker.status === 'tracking' || pendingRun || routeDraftMode
            ? ''
            : ' game-controls-empty'
        }`}
        ref={setControlsEl}
      >
        {tracker.status === 'tracking' && (
          <>
            {/* Status/stats card - a header strip (Running/Paused + the
                expand/collapse toggle, replacing the old separate chevron
                pill) over a white Time/Pace/Distance row, with a purely
                decorative drag-handle grip at the card's own bottom edge.
                "Paused" only ever shows for a Training run (see
                useRunTracker's pause()) - every other mode stays "Running"
                the whole time it's tracking. Pace is the hero here now (the
                number most runners actually glance at mid-run), not Time.
                Pace/Time both read off movingSeconds, not elapsedSeconds -
                identical for any run that never pauses, but keeps a
                Training run's pace honest instead of counting paused time
                as covered ground. Same tracker fields/formatters as before,
                just reflowed - no tracking logic changed here. */}
            <div
              className={`game-run-card${tracker.paused ? ' is-paused' : ''}`}
            >
              <button
                type="button"
                className="game-run-card-header"
                aria-label={
                  statsOnly ? 'Show run controls' : 'Hide run controls'
                }
                aria-expanded={!statsOnly}
                onClick={() => setStatsOnly((collapsed) => !collapsed)}
              >
                <span className="game-run-card-status">
                  {tracker.paused ? 'Paused' : 'Running'}
                </span>
                <IconExpand className="game-run-card-expand-icon" />
              </button>
              <div className="game-run-card-stats">
                <span className="game-stat">
                  <span className="game-stat-value">
                    {formatDuration(tracker.movingSeconds)}
                  </span>
                  <span className="game-stat-label">Time</span>
                </span>
                <span className="game-stat game-stat-hero">
                  <span className="game-stat-value">
                    {formatPace(
                      tracker.movingSeconds < 30 ||
                        tracker.distance < MIN_DISTANCE_FOR_PACE_METERS
                        ? null
                        : calculatePaceMinPerKm(
                            tracker.distance,
                            tracker.movingSeconds
                          )
                    ).replace(' /km', '')}
                  </span>
                  <span className="game-stat-label">Avg. pace (/km)</span>
                </span>
                <span className="game-stat">
                  <span className="game-stat-value">
                    {formatDistance(displayedDistance).replace(' km', '')}
                  </span>
                  <span className="game-stat-label">Distance (km)</span>
                </span>
              </div>
              <span className="game-run-card-handle" aria-hidden="true" />
            </div>
            <AnimatePresence initial={false}>
              {!statsOnly && (
                <motion.div
                  key="run-actions"
                  className="game-controls-expand"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                >
                  {/* Discard is deliberately quieter than End (smaller,
                      muted, no fat drop-shadow) so a thumb reaching for End
                      doesn't land on it by accident - the actual
                      "are you sure" step is the modal below, triggered by
                      either one. Pause/Resume only ever renders for a
                      Training run (tracker.isTraining) - every other mode
                      (Conquer, PvP, Club War) keeps exactly the two buttons
                      it always had. */}
                  <div className="game-controls-actions game-run-actions">
                    {tracker.isTraining &&
                      (tracker.paused ? (
                        <button
                          type="button"
                          className="game-run-btn game-run-btn-resume"
                          onClick={tracker.resume}
                        >
                          <IconPlay /> Resume
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="game-run-btn game-run-btn-pause"
                          onClick={tracker.pause}
                        >
                          <IconPause /> Pause
                        </button>
                      ))}
                    <button
                      type="button"
                      className="game-run-btn game-run-btn-end"
                      onClick={() => setConfirmAction('end')}
                    >
                      <IconFlagCheckered /> End
                    </button>
                    <button
                      type="button"
                      className="game-run-btn game-run-btn-discard"
                      onClick={() => setConfirmAction('cancel')}
                    >
                      <IconClose /> Discard
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {pendingRun && (
          <>
            <div className="game-controls-stats">
              <span className="game-stat">
                <span className="game-stat-value">{formatArea(draftArea)}</span>
                <span className="game-stat-label">Loop Area</span>
              </span>
              <span className="game-stat">
                <span className="game-stat-value">
                  {formatMeters(draftPerimeter)}
                </span>
                <span className="game-stat-label">Perimeter</span>
              </span>
            </div>
            {confirmAction === 'discard' ? (
              <div className="game-controls-confirm">
                <p className="game-controls-confirm-text">
                  Discard this run? It won&apos;t be saved.
                </p>
                <div className="game-controls-actions">
                  <button
                    type="button"
                    className="game-btn game-btn-wood"
                    onClick={() => setConfirmAction(null)}
                  >
                    Keep It
                  </button>
                  <button
                    type="button"
                    className="game-btn game-btn-red"
                    onClick={() => {
                      setConfirmAction(null)
                      discardDraft()
                    }}
                  >
                    Yes, Discard
                  </button>
                </div>
              </div>
            ) : (
              <div className="game-controls-actions">
                <button
                  type="button"
                  className="game-btn game-btn-green game-btn-lg"
                  onClick={() => attemptSubmit(pendingRun)}
                  disabled={saving}
                >
                  {saving ? 'Submitting…' : 'Submit Run'}
                </button>
                <button
                  type="button"
                  className="game-btn game-btn-red game-btn-lg"
                  onClick={() => setConfirmAction('discard')}
                  disabled={saving}
                >
                  Discard
                </button>
              </div>
            )}
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

        {routeDraftMode && (
          <>
            <div className="game-controls-stats">
              <span className="game-stat">
                <span className="game-stat-value">
                  {formatMeters(routeDraftDistance)}
                </span>
                <span className="game-stat-label">Distance</span>
              </span>
              <span className="game-stat">
                <span className="game-stat-value">
                  {routeDraftWaypoints.length}
                </span>
                <span className="game-stat-label">Points</span>
              </span>
            </div>
            {routeConfirmCancel ? (
              <div className="game-controls-confirm">
                <p className="game-controls-confirm-text">
                  Discard this route? Nothing will be saved.
                </p>
                <div className="game-controls-actions">
                  <button
                    type="button"
                    className="game-btn game-btn-wood"
                    onClick={() => setRouteConfirmCancel(false)}
                  >
                    Keep Drawing
                  </button>
                  <button
                    type="button"
                    className="game-btn game-btn-red"
                    onClick={handleConfirmCancelDrawing}
                  >
                    Yes, Discard
                  </button>
                </div>
              </div>
            ) : (
              <div className="game-controls-actions">
                <button
                  type="button"
                  className="game-btn game-btn-wood"
                  onClick={handleUndoRoutePoint}
                  disabled={routeDraftWaypoints.length === 0 || routeSnapBusy}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="game-btn game-btn-green"
                  onClick={handleFinishDrawing}
                  disabled={routeSnapBusy}
                >
                  Finish
                </button>
                <button
                  type="button"
                  className="game-btn game-btn-red"
                  onClick={handleRequestCancelDrawing}
                >
                  Cancel
                </button>
              </div>
            )}
            <p className="game-controls-hint">
              {routeSnapBusy
                ? 'Snapping to the road…'
                : routeDraftError ||
                  'Tap the map to add a point. Tap near a road for the best path.'}
            </p>
          </>
        )}
      </div>

      {/* End-run confirmation - a real modal (Esc/backdrop close like any
          other confirm in this app), unlike the pendingRun/route-drawing
          confirms above, which stay inline-in-sheet (the already-established
          pattern elsewhere - see TrackRunPanel/PvpPanel). This one gets the
          heavier treatment since ending/discarding an in-progress run is a
          bigger, easier-to-fat-finger decision than those. */}
      <AnimatePresence>
        {(confirmAction === 'end' || confirmAction === 'cancel') && (
          <motion.div
            className="game-confirm-overlay game-end-run-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              className="game-confirm-card game-end-run-card"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="game-end-run-title">
                {confirmAction === 'end'
                  ? 'End this run?'
                  : 'Discard this run?'}
              </h3>
              <p className="game-end-run-summary">
                {formatMeters(displayedDistance)} ·{' '}
                {formatDuration(tracker.elapsedSeconds)}
                {confirmAction === 'end' ? ' will be saved' : ' will be lost'}
              </p>
              {confirmAction === 'end' &&
                tracker.distance < MIN_VALID_RUN_DISTANCE_METERS && (
                  <p className="game-controls-hint game-controls-hint-error">
                    This run is very short and may not count.
                  </p>
                )}
              <div className="game-end-run-actions">
                <button
                  type="button"
                  className="game-btn game-btn-wood"
                  onClick={() => setConfirmAction(null)}
                >
                  Keep Running
                </button>
                <button
                  type="button"
                  className={`game-btn ${
                    confirmAction === 'end' ? 'game-btn-green' : 'game-btn-red'
                  }`}
                  onClick={() => {
                    setConfirmAction(null)
                    if (confirmAction === 'end') {
                      setLoopWarningDismissed(false)
                      tracker.stop()
                    } else handleCancelTracking()
                  }}
                >
                  {confirmAction === 'end' ? 'Yes, End' : 'Yes, Discard'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  className="game-btn game-btn-green"
                  onClick={() => attemptSubmit(pendingRun)}
                  disabled={saving}
                >
                  Retry Save
                </button>
              )}
              <button
                type="button"
                className="game-btn game-btn-wood"
                onClick={() => setSaveError(null)}
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tracker.invalidMotion && (
          <motion.div
            className="game-claim-toast glass-card"
            initial={{ opacity: 0, x: '-50%', y: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: 20, scale: 0.9 }}
          >
            <h3>Whoa there, speedster 🛵</h3>
            <p>
              {tracker.invalidMotion.reason === 'no-gait'
                ? "You're covering ground fast with no running stride detected. Keep this up and the whole run will come back invalid — stop here and restart once you're back on foot."
                : "This pace is faster than running allows. Keep this up and the whole run will come back invalid — stop here and restart once you're back on foot."}
            </p>
            <div className="game-highlight-toast-actions">
              <button
                type="button"
                className="game-btn game-btn-green"
                onClick={() => tracker.stop()}
              >
                Stop Run
              </button>
              <button
                type="button"
                className="game-btn game-btn-wood"
                onClick={tracker.dismissInvalidMotion}
              >
                Keep Going
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {runResult && (
          <motion.div
            className="game-claim-toast game-claim-toast-center glass-card"
            initial={{ opacity: 0, x: '-50%', y: '-40%', scale: 0.9 }}
            animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: '-40%', scale: 0.9 }}
          >
            {/* By the time any phase below renders, attemptSubmit() has
                already created the run server-side - whatever the
                territory outcome turns out to be, the run itself is
                already safely in the athlete's history. */}
            {/* A PvP race or Club War entry never checks territory - it's
                logged for its own scoring and done, so this is a single
                terminal phase instead of a processing/done pair. */}
            {runResult.phase === 'submitted' && (
              <>
                <h3>Run submitted!</h3>
                {renderCompletedRunStats()}
                {completedRun?.isRace && (
                  <p className="game-controls-hint">
                    🏁 Race time logged. Check the PvP tab once your rival runs
                    too.
                  </p>
                )}
                {completedRun?.isWar && (
                  <p className="game-controls-hint">
                    ⚔️ War run logged. Check Club Wars once the battle ends.
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRunResult(null)}
                >
                  Nice
                </button>
              </>
            )}
            {runResult.phase === 'processing' && (
              <>
                <h3>Run submitted!</h3>
                {renderCompletedRunStats()}
                <p>Checking your territory…</p>
              </>
            )}
            {runResult.phase === 'rejected' && (
              <>
                <h3>{runResult.title}</h3>
                {renderCompletedRunStats()}
                <p>{runResult.message}</p>
                {runResult.isRolloutRejection && (
                  <>
                    {rolloutRequestResult?.alreadyRolledOut && (
                      <p className="game-settings-row-requested">
                        Looks like it&apos;s already live here - try your next
                        run!
                      </p>
                    )}
                    {rolloutRequestResult &&
                      !rolloutRequestResult.alreadyRolledOut && (
                        <p className="game-settings-row-requested">
                          Requested - thanks for letting us know!
                        </p>
                      )}
                    {rolloutRequestError && (
                      <p className="game-controls-hint game-controls-hint-error">
                        {rolloutRequestError}
                      </p>
                    )}
                    {!rolloutRequestResult && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={rolloutRequestBusy}
                        onClick={handleRequestRollout}
                      >
                        {rolloutRequestBusy ? 'Sending…' : 'Request Rollout'}
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setRunResult(null)
                    setRolloutRequestResult(null)
                    setRolloutRequestError(null)
                  }}
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
                <h3>Still checking your territory…</h3>
                {renderCompletedRunStats()}
                <p>
                  Taking a bit longer than usual to confirm whether your loop
                  closed — check back in a bit if it doesn’t show up here.
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
        {/* Shown right after the run-result toast above is dismissed, never
            layered on top of it - a run's XP is a separate "reward" beat
            from the territory outcome itself. */}
        {!runResult && xpReward && (
          <RunRewardAnimation
            key={`${xpReward.beforeXp}-${xpReward.afterXp}`}
            {...xpReward}
            onDismiss={() => setXpReward(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {highlightedEntry &&
          (() => {
            const isMine = isMyEntry(highlightedEntry)
            // Only computed for display (start distance/eligibility hint) -
            // handleRunTerritory builds its own copy fresh off the live
            // playerLocation at the moment the button is actually pressed,
            // so a stale preview here never feeds the real run.
            const previewRoute =
              highlightedEntry.points?.length >= 3 && playerLocation
                ? generateTerritoryLoopRoute(
                    highlightedEntry.points,
                    playerLocation
                  )
                : null
            const canRun =
              (highlightedEntry.points?.length || 0) >= 3 &&
              tracker.status === 'idle' &&
              !pendingRun
            return (
              <motion.div
                className="game-highlight-toast glass-card game-territory-popup"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                {/* --- Header: avatar + owner name + close --- */}
                <div className="game-highlight-toast-header">
                  <Avatar
                    src={highlightedEntry.avatarSrc}
                    name={playerNameOf(highlightedEntry)}
                    ring={highlightedEntry.color || 'var(--game-gold)'}
                    size={60}
                    className="game-highlight-toast-avatar"
                  />
                  <div className="game-highlight-toast-owner">
                    <p className="game-highlight-toast-owner-label">
                      Territory owner
                    </p>
                    <h3>{isMine ? 'You' : playerNameOf(highlightedEntry)}</h3>
                  </div>
                  <button
                    type="button"
                    className="game-close-btn game-highlight-toast-close"
                    aria-label="Close"
                    onClick={() => {
                      setHighlightedEntry(null)
                      setTerritoryRunWarning(null)
                    }}
                  >
                    <IconClose />
                  </button>
                </div>

                {/* --- Stats row: the two numbers that actually matter --- */}
                <div className="game-territory-stats">
                  <div className="game-territory-stat">
                    <span className="game-territory-stat-value">
                      {formatAreaStat(highlightedEntry.areaSqMeters)}
                    </span>
                    <span className="game-territory-stat-label">Held</span>
                  </div>
                  <div className="game-territory-stat">
                    <span className="game-territory-stat-value">
                      <IconTrophy />
                      {Math.round(
                        highlightedEntry.runScore || 0
                      ).toLocaleString()}
                    </span>
                    <span className="game-territory-stat-label">Run score</span>
                  </div>
                </div>

                {!highlightHasVisibleParcels && (
                  <p className="game-controls-hint">
                    Nothing of theirs is in view right now — try exploring the
                    map.
                  </p>
                )}
                {territoryRunWarning && (
                  <>
                    <p className="game-controls-hint game-controls-hint-error">
                      {territoryRunWarning}
                    </p>
                    <div className="game-highlight-toast-actions">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setTerritoryRunWarning(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() =>
                          handleRunTerritory(highlightedEntry, { force: true })
                        }
                      >
                        Continue anyway
                      </button>
                    </div>
                  </>
                )}
                {!territoryRunWarning && canRun && (
                  <>
                    {/* --- Secondary info line: distance to the route's
                        start point, with the "guide will steer you there"
                        detail kept as a smaller caption underneath rather
                        than a hover-only tooltip (this is a touch-first
                        game, nothing here is hoverable on mobile). --- */}
                    {previewRoute?.startDistanceMeters >
                      TERRITORY_RUN_FAR_START_METERS && (
                      <p className="game-territory-distance">
                        <IconCrosshairs />
                        <span>
                          Start point is{' '}
                          {formatMeters(previewRoute.startDistanceMeters)} away
                          <span className="game-territory-distance-caption">
                            The guide will steer you there first.
                          </span>
                        </span>
                      </p>
                    )}
                    <div className="game-highlight-toast-actions">
                      <button
                        type="button"
                        className="game-route-run-btn"
                        onClick={() => handleRunTerritory(highlightedEntry)}
                      >
                        🏃{' '}
                        {isMine
                          ? 'Defend This Territory'
                          : 'Run This Territory'}
                      </button>
                    </div>
                  </>
                )}
                {!territoryRunWarning && (
                  <div className="game-highlight-toast-actions is-secondary">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setViewingProfile(highlightedEntry)
                        setHighlightedEntry(null)
                      }}
                    >
                      View Profile
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })()}
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
              className="game-close-btn game-menu-close"
              onClick={() => {
                setMenuOpen(false)
                setTabPickerOpen(false)
              }}
              aria-label="Close menu"
            >
              <IconClose />
            </button>

            {/* Desktop: one row of tabs. Phones: a single game-style
                picker showing the current tab, which drops down the rest -
                six tabs in a row/grid was too cramped on a narrow screen. */}
            <div className="game-menu-tabs">
              {switcherTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`game-menu-tab ${menuTab === tab.id ? 'active' : ''}`}
                  onClick={() => switchTab(tab.id)}
                >
                  <TabMedal tab={tab} medalClassName="game-menu-tab-medal" />
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
                <TabMedal tab={activeMenuTab} />
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
                  <IconChevronDown />
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
                    {switcherTabs.map((tab, i) => (
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
                          <TabMedal tab={tab} />
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
                              <IconCheck />
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
              <div className="game-menu-panel game-cards">
                <SponsorBannerCarousel />
                <section className="game-card game-card-dark">
                  <div
                    className="game-menu-subtabs game-shop-tabs game-leaderboard-mode"
                    role="tablist"
                    aria-label="Leaderboard"
                  >
                    {/* IconUser/IconUsers reused exactly as-is from the Me/
                        Club nav tabs and radial menu buttons (RADIAL_ITEMS
                        above) rather than inventing a separate icon
                        language just for this tab row. IconTrophy (this
                        tab's old icon) stays dropped for Players
                        specifically - it already means "score/rank"
                        elsewhere on this same screen (the podium medals,
                        the stat chips), so reusing it here too for "this
                        is the Players section" reads as the wrong concept.
                        Label text is back next to the icon (short "Players"/
                        "Clubs" swapped in under 360px via CSS, see
                        .game-leaderboard-mode .game-menu-subtab-label in
                        GamePage.css) - game-shop-tabs' icon-only squircle
                        sizing is overridden just for this row there too, so
                        Shop's section tabs stay icon-only.
                        game-leaderboard-mode only still exists to keep this
                        row's active state slate instead of the shop's
                        green, see GamePage.css. */}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={leaderboardMode === 'individual'}
                      aria-label="Top Players"
                      title="Top Players"
                      className={`game-menu-subtab ${leaderboardMode === 'individual' ? 'active' : ''}`}
                      onClick={() => switchLeaderboardMode('individual')}
                    >
                      <IconUser />
                      <span className="game-menu-subtab-label">
                        <span className="label-full">Top Players</span>
                        <span className="label-short">Players</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={leaderboardMode === 'club'}
                      aria-label="Top Clubs"
                      title="Top Clubs"
                      className={`game-menu-subtab ${leaderboardMode === 'club' ? 'active' : ''}`}
                      onClick={() => switchLeaderboardMode('club')}
                    >
                      <IconUsers />
                      <span className="game-menu-subtab-label">
                        <span className="label-full">Top Clubs</span>
                        <span className="label-short">Clubs</span>
                      </span>
                    </button>
                  </div>

                  {leaderboardMode === 'individual' ? (
                    <div
                      className="game-menu-subtabs game-menu-subtabs-scope"
                      role="tablist"
                      aria-label="Scope"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={individualScope === 'global'}
                        className={`game-menu-subtab ${individualScope === 'global' ? 'active' : ''}`}
                        onClick={() => switchIndividualScope('global')}
                      >
                        <img
                          src={globeScopeIcon}
                          alt=""
                          className="game-menu-subtab-scope-icon"
                        />
                        <span className="game-menu-subtab-scope-label">
                          Global
                        </span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={individualScope === 'city'}
                        className={`game-menu-subtab ${individualScope === 'city' ? 'active' : ''}`}
                        onClick={() => switchIndividualScope('city')}
                      >
                        <IconFlagScope className="game-menu-subtab-scope-icon" />
                        <span className="game-menu-subtab-scope-label">
                          {(individualScope === 'city' &&
                            leaderboard[0]?.cityName) ||
                            'District'}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div
                      className="game-menu-subtabs game-menu-subtabs-scope"
                      role="tablist"
                      aria-label="Scope"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={clubScope === 'global'}
                        className={`game-menu-subtab ${clubScope === 'global' ? 'active' : ''}`}
                        onClick={() => switchClubScope('global')}
                      >
                        <img
                          src={globeScopeIcon}
                          alt=""
                          className="game-menu-subtab-scope-icon"
                        />
                        <span className="game-menu-subtab-scope-label">
                          Global
                        </span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={clubScope === 'national'}
                        className={`game-menu-subtab ${clubScope === 'national' ? 'active' : ''}`}
                        onClick={() => switchClubScope('national')}
                      >
                        <IconFlagScope className="game-menu-subtab-scope-icon" />
                        <span className="game-menu-subtab-scope-label">
                          {(clubScope === 'national' &&
                            clubLeaderboard[0]?.countryName) ||
                            'Country'}
                        </span>
                      </button>
                    </div>
                  )}

                  {leaderboardMode === 'individual' &&
                    individualScope === 'city' && (
                      <p className="game-leaderboard-notice">
                        Showing conquered area in{' '}
                        {leaderboard[0]?.cityName || 'your district'} only.
                      </p>
                    )}
                  {leaderboardMode === 'club' && clubScope === 'national' && (
                    <p className="game-leaderboard-notice">
                      Showing clubs in{' '}
                      {clubLeaderboard[0]?.countryName || 'your country'} only.
                    </p>
                  )}

                  {leaderboardMode === 'individual' ? (
                    leaderboardError ? (
                      <p className="game-menu-empty">{leaderboardError}</p>
                    ) : leaderboardLoading && leaderboard.length === 0 ? (
                      <LeaderboardSkeleton />
                    ) : leaderboard.length === 0 ? (
                      <p className="game-menu-empty">
                        {individualScope === 'city'
                          ? 'Nothing here yet — district rankings only refresh about once an hour, so a run from the last little while (or from a different district than you expect) may not show up here yet.'
                          : 'No territory claimed yet — be the first.'}
                      </p>
                    ) : (
                      <LeaderboardPodium
                        nameLabel="Runner"
                        entries={leaderboard.map((entry) => ({
                          key: entry.userId,
                          rank: entry.rank,
                          name: playerNameOf(entry),
                          // Same "icon + stat" treatment as the Club board's
                          // trophy count below - territory is this board's
                          // equivalent score.
                          area: (
                            <span className="lb-trophy-stat">
                              <IconFlag />
                              {formatArea(entry.areaSqMeters)}
                            </span>
                          ),
                          // Same default (colored initials) as everyone
                          // else - the leaderboard API has no profile
                          // pictures for anyone yet (see
                          // resolveFileUrl(entry.profilePictureUrl) below,
                          // always null today), and the player's own row
                          // used to special-case in their real equipped-
                          // hero avatarSrc here, which made it visually
                          // stand out as a different, bigger "card" rather
                          // than reading as the same row as everyone
                          // else's - a small "You" tag (see
                          // LeaderboardPodium.jsx's isPlayer handling)
                          // marks it instead.
                          avatarSrc: resolveFileUrl(entry.profilePictureUrl),
                          isPlayer: isMyEntry(entry),
                          onClick: () => setViewingProfile(entry),
                        }))}
                      />
                    )
                  ) : leaderboardError ? (
                    <p className="game-menu-empty">{leaderboardError}</p>
                  ) : leaderboardLoading && clubLeaderboard.length === 0 ? (
                    <LeaderboardSkeleton />
                  ) : clubLeaderboard.length === 0 ? (
                    <p className="game-menu-empty">
                      {clubScope === 'national'
                        ? 'No club has claimed territory in your country yet.'
                        : 'No club has claimed territory yet.'}
                    </p>
                  ) : (
                    <LeaderboardPodium
                      nameLabel="Club"
                      statLabel="Trophies"
                      entries={clubLeaderboard.map((entry) => ({
                        key: entry.clubId,
                        rank: entry.rank,
                        name: entry.clubName,
                        badge: <ClubBadge name={entry.clubName} size={40} />,
                        area: (
                          <span className="lb-trophy-stat">
                            <ClubTrophyIcon size={26} />
                            {formatCoins(entry.trophies ?? 0)}
                          </span>
                        ),
                        isPlayer: entry.clubName === profile?.clubName,
                        onClick: () => {
                          setOpenClubId(entry.clubId)
                          switchTab('club')
                        },
                      }))}
                    />
                  )}
                </section>
              </div>
            )}

            {menuTab === 'club' && (
              <div className="game-menu-panel">
                <ClubPanel
                  hasClub={Boolean(profile?.clubName)}
                  userId={user?.id}
                  balance={profile?.fahhcoinBalance ?? 0}
                  onClubChanged={refreshProfile}
                  onViewProfile={setViewingProfile}
                  ownedItems={ownedItems}
                  storeCatalog={storeCatalog}
                  onEquipHero={handleEquipWarHero}
                  onStartWarRun={handleStartWarRun}
                  racing={tracker.status === 'tracking' || Boolean(pendingRun)}
                  openClubId={openClubId}
                  onOpenClubHandled={() => setOpenClubId(null)}
                  onViewRoute={handleViewRoute}
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
                  onForfeited={() => refreshProfile()}
                  racing={tracker.status === 'tracking' || Boolean(pendingRun)}
                  focusRaceId={pvpFocusId}
                  onFocusHandled={() => setPvpFocusId(null)}
                />
              </div>
            )}

            {menuTab === 'mail' && (
              <div className="game-menu-panel">
                <MailPanel mailbox={mailbox} onClaimed={handleMailClaimed} />
              </div>
            )}

            {menuTab === 'training' && (
              <div className="game-menu-panel">
                <div className="training-intro">
                  <span className="training-intro-icon" aria-hidden="true">
                    <IconRunning />
                  </span>
                  <h2 className="training-intro-title">Training</h2>
                  {tracker.isTraining && tracker.paused ? (
                    <>
                      <p className="training-intro-text">
                        You&apos;ve got a paused run waiting -{' '}
                        {formatMeters(tracker.distance)} so far. Pick up right
                        where you left off (needs a quick tap to re-arm GPS).
                      </p>
                      <button
                        type="button"
                        className="game-btn game-btn-green game-btn-lg"
                        onClick={tracker.resume}
                      >
                        <IconPlay /> Resume unfinished run
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="training-intro-text">
                        A free run with no pressure - pause whenever you need to
                        and pick up right where you left off. Counts the same as
                        any run otherwise: exp, territory, the works.
                      </p>
                      <button
                        type="button"
                        className="game-btn game-btn-green game-btn-lg"
                        onClick={handleStartTraining}
                        disabled={
                          (tracker.status === 'tracking' &&
                            !tracker.isTraining) ||
                          Boolean(pendingRun)
                        }
                      >
                        <IconPlay /> Start
                      </button>
                    </>
                  )}
                </div>
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
                  {showHeroTurntable ? (
                    // Plays the equipped emote in place of the idle
                    // turntable when one's equipped and its art actually
                    // resolves (see equippedEmoteItem/equippedEmoteAsset
                    // above) - same spot, same size, just a different
                    // sprite/pace (EmoteGlyph's own 20fps, tuned for emote
                    // content, not HeroSprite's slower idle pace). Falls
                    // back to the idle turntable otherwise, same as before.
                    // No stage behind the flat avatar-picture fallback below
                    // - that's not a hero playing anything, just a profile
                    // photo/local avatar icon.
                    <HeroStage
                      hero={activeHeroName}
                      className="game-menu-hero-stage"
                    >
                      {(h) =>
                        equippedEmoteItem && equippedEmoteAsset ? (
                          <EmoteGlyph
                            heroName={activeHeroName}
                            emoteName={equippedEmoteItem.name}
                            size={h || 260}
                            active
                          />
                        ) : (
                          <HeroSprite size={h || 260} hero={activeHeroName} />
                        )
                      }
                    </HeroStage>
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
                {playerNameOf(user) && (
                  <p className="game-menu-player-name">{playerNameOf(user)}</p>
                )}
                {user && !user.nickname?.trim() && (
                  <NicknameCard onSaved={replaceUser} />
                )}
                {equippedPhrase && (
                  <p className="game-menu-phrase">
                    “{equippedPhrase.storeItem.name}”
                  </p>
                )}
                {profile?.level != null && (
                  <div className="game-level-hud">
                    <LevelBar level={profile.level} xp={profile.xp} showXp />
                  </div>
                )}
                <div className="game-menu-summary">
                  <span className="game-menu-summary-value">
                    {formatArea(profile?.totalAreaSqMeters)}
                  </span>
                  {profile?.clubName && (
                    <span className="game-menu-summary-label game-menu-summary-club">
                      <ClubBadge name={profile.clubName} size={24} />
                      {profile.clubName}
                    </span>
                  )}
                </div>
                <div className="game-cards">
                  <MedalGrid
                    catalog={storeCatalog}
                    ownedItems={ownedItems}
                    seasonMedals={profile?.medals}
                    loading={storeCatalog.length === 0 && !storeError}
                  />
                  <section className="game-me-section">
                    <p className="game-menu-section-title">My Territories</p>
                    {myTerritories.length === 0 ? (
                      <p className="game-menu-empty">
                        Finish a GPS run that closes a loop to see territory
                        here.
                      </p>
                    ) : (
                      <>
                        <ul className="game-menu-list">
                          {visibleMyTerritories.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                className="game-menu-list-row"
                                onClick={() => handleViewMyParcel(t)}
                              >
                                <span className="game-menu-list-area">
                                  {formatArea(t.area)}
                                </span>
                                <span className="game-menu-list-meta">
                                  score {Math.round(t.currentScore || 0)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {myTerritoriesTotalPages > 1 && (
                          <div className="game-route-pager">
                            <button
                              type="button"
                              className="game-btn game-btn-wood game-btn-sm"
                              aria-label="Show previous territories"
                              disabled={myTerritoriesPage <= 1}
                              onClick={() => setMyTerritoriesPage((p) => p - 1)}
                            >
                              ◀
                            </button>
                            <span className="game-route-pager-label">
                              Page {myTerritoriesPage} of{' '}
                              {myTerritoriesTotalPages}
                            </span>
                            <button
                              type="button"
                              className="game-btn game-btn-wood game-btn-sm"
                              aria-label="Show more territories"
                              disabled={
                                myTerritoriesPage >= myTerritoriesTotalPages
                              }
                              onClick={() => setMyTerritoriesPage((p) => p + 1)}
                            >
                              ▶
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className="game-me-section">
                    <p className="game-menu-section-title">My Routes</p>
                    <button
                      type="button"
                      className="game-btn game-btn-green game-btn-sm game-me-draw-route-btn"
                      onClick={handleStartDrawRoute}
                    >
                      + Draw New Route
                    </button>
                    {myRoutesError && (
                      <p className="game-controls-hint game-controls-hint-error">
                        {myRoutesError}
                      </p>
                    )}
                    {myRoutes.length === 0 ? (
                      <p className="game-menu-empty">
                        Draw a route on the map to see it here.
                      </p>
                    ) : (
                      <>
                        <ul className="game-menu-list">
                          {myRoutes.map((r) => (
                            <li key={r.id} className="game-route-list-item">
                              <button
                                type="button"
                                className="game-menu-list-row game-route-view-btn"
                                onClick={() => handleViewRoute(r.id)}
                                disabled={loadingRouteId === r.id}
                              >
                                <span className="game-menu-list-area">
                                  {r.name}
                                </span>
                                <span className="game-menu-list-meta">
                                  {loadingRouteId === r.id
                                    ? 'Loading…'
                                    : formatDistance(r.distanceMeters)}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`game-route-visibility-btn ${
                                  r.visibility === 'CLUB' ? 'is-shared' : ''
                                }`}
                                disabled={
                                  routeVisibilityBusyId === r.id ||
                                  (r.visibility !== 'CLUB' &&
                                    !profile?.clubName)
                                }
                                title={
                                  r.visibility !== 'CLUB' && !profile?.clubName
                                    ? 'Join a club to share routes with it'
                                    : undefined
                                }
                                onClick={() => handleToggleRouteVisibility(r)}
                              >
                                {routeVisibilityBusyId === r.id
                                  ? '…'
                                  : r.visibility === 'CLUB'
                                    ? 'Shared with Club'
                                    : 'Private'}
                              </button>
                            </li>
                          ))}
                        </ul>
                        {myRoutesTotalPages > 1 && (
                          <div className="game-route-pager">
                            <button
                              type="button"
                              className="game-btn game-btn-wood game-btn-sm"
                              disabled={myRoutesPage <= 1}
                              onClick={() => loadMyRoutes(myRoutesPage - 1)}
                            >
                              Prev
                            </button>
                            <span className="game-route-pager-label">
                              Page {myRoutesPage} of {myRoutesTotalPages}
                            </span>
                            <button
                              type="button"
                              className="game-btn game-btn-wood game-btn-sm"
                              disabled={myRoutesPage >= myRoutesTotalPages}
                              onClick={() => loadMyRoutes(myRoutesPage + 1)}
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className="game-me-section" ref={myRunsListRef}>
                    <p className="game-menu-section-title">History</p>
                    {myRunsError ? (
                      <div className="game-me-history-error">
                        <p className="game-controls-hint game-controls-hint-error">
                          {myRunsError}
                        </p>
                        <button
                          type="button"
                          className="game-btn game-btn-wood game-btn-sm"
                          onClick={() => loadMyRunsPage(myRunsPage)}
                        >
                          Retry
                        </button>
                      </div>
                    ) : myRunsLoading && myRuns.length === 0 ? (
                      <ul className="game-me-history-list" aria-hidden="true">
                        {Array.from({ length: MY_RUNS_PAGE_SIZE }).map(
                          (_, i) => (
                            <li
                              key={i}
                              className="game-me-history-row game-me-history-skeleton"
                            />
                          )
                        )}
                      </ul>
                    ) : myRuns.length === 0 ? (
                      <p className="game-menu-empty">
                        Finish a GPS run to see its map here.
                      </p>
                    ) : (
                      <>
                        <ul
                          className="game-me-history-list"
                          aria-busy={myRunsLoading}
                        >
                          {myRuns.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                className="game-me-history-row"
                                onClick={() => handleViewRun(r.id)}
                                disabled={loadingRunId === r.id}
                              >
                                <span className="game-me-history-area">
                                  {formatDistance(r.distance)} ·{' '}
                                  {formatDuration(r.duration)}
                                </span>
                                <span className="game-me-history-meta">
                                  {loadingRunId === r.id
                                    ? 'Loading…'
                                    : formatRunDate(r.startedAt)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {myRunsTotalPages > 1 && (
                          <div className="game-me-history-pager">
                            <button
                              type="button"
                              className="game-me-history-pager-btn"
                              aria-label="Previous page"
                              disabled={myRunsPage <= 1 || myRunsLoading}
                              onClick={() => goToMyRunsPage(myRunsPage - 1)}
                            >
                              Prev
                            </button>
                            <span className="game-me-history-pager-label">
                              Page {myRunsPage} of {myRunsTotalPages}
                            </span>
                            <button
                              type="button"
                              className="game-me-history-pager-btn"
                              aria-label="Next page"
                              disabled={
                                myRunsPage >= myRunsTotalPages || myRunsLoading
                              }
                              onClick={() => goToMyRunsPage(myRunsPage + 1)}
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </div>
              </div>
            )}

            {menuTab === 'settings' && (
              <div className="game-menu-panel game-menu-settings game-cards">
                {/* TEMP: free Avatar picker hidden - it duplicated the Heroes
                    (now in the Shop tab). Its images back the matching heroes
                    instead (see HeroFigure). Restore from git to bring it
                    back. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={!musicMuted}
                  className="game-settings-row"
                  onClick={toggleMusicMuted}
                >
                  <span className="game-settings-row-label">
                    <span className="game-settings-row-icon">
                      <span
                        className="game-settings-row-icon-badge"
                        aria-hidden="true"
                      >
                        <IconMusicNote />
                      </span>
                    </span>
                    <span className="game-settings-row-text">
                      Music
                      <span className="game-settings-row-sub">
                        {musicMuted
                          ? 'Background music off'
                          : 'Background music on'}
                      </span>
                    </span>
                  </span>
                  <span
                    className={`game-switch ${musicMuted ? '' : 'is-on'}`}
                    aria-hidden="true"
                  >
                    <span className="game-switch-knob" />
                  </span>
                </button>

                {/* Sound effects - independent of Music above (own state,
                    own localStorage key, see gameSound.js). Every tap/
                    menu-pop/milestone-chime effect routes through that
                    file's playSfx(), which is what actually checks this
                    setting before playing - toggling it here is just
                    gameSound.js's setSfxMuted plus this row's own
                    re-render, same split toggleMusicMuted/the music effect
                    above already has. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={!sfxMuted}
                  className="game-settings-row"
                  onClick={toggleSfxMuted}
                >
                  <span className="game-settings-row-label">
                    <span className="game-settings-row-icon">
                      <span
                        className="game-settings-row-icon-badge"
                        aria-hidden="true"
                      >
                        {sfxMuted ? <IconVolumeMute /> : <IconVolumeUp />}
                      </span>
                    </span>
                    <span className="game-settings-row-text">
                      Sound
                      <span className="game-settings-row-sub">
                        Popups and effects
                      </span>
                    </span>
                  </span>
                  <span
                    className={`game-switch ${sfxMuted ? '' : 'is-on'}`}
                    aria-hidden="true"
                  >
                    <span className="game-switch-knob" />
                  </span>
                </button>

                <MapStylePicker
                  styles={MAP_STYLES}
                  selectedId={mapStyleId}
                  onSelect={handleChooseMapStyle}
                />

                {/* Native app only (see useReminders/isNative) - the 3 daily
                    "let's run" local notifications. Renders nothing on the
                    website. */}
                {reminders.supported && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={reminders.enabled}
                    className="game-settings-row"
                    onClick={() => reminders.toggle(!reminders.enabled)}
                  >
                    <span className="game-settings-row-label">
                      <span className="game-settings-row-icon">
                        <span
                          className="game-settings-row-icon-badge"
                          aria-hidden="true"
                        >
                          <IconBell />
                        </span>
                      </span>
                      <span className="game-settings-row-text">
                        Reminders
                        <span className="game-settings-row-sub">
                          {reminders.enabled
                            ? '3 daily nudges to go run'
                            : 'Daily run reminders off'}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`game-switch ${reminders.enabled ? 'is-on' : ''}`}
                      aria-hidden="true"
                    >
                      <span className="game-switch-knob" />
                    </span>
                  </button>
                )}
                {reminders.supported && remindersDebug && (
                  <button
                    type="button"
                    className="game-settings-row"
                    onClick={() => scheduleTestReminderInOneMinute()}
                  >
                    <span className="game-settings-row-label">
                      <span className="game-settings-row-text">
                        Send test reminder (1 min)
                        <span className="game-settings-row-sub">
                          Debug only - ?debug=reminders
                        </span>
                      </span>
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={pvp.discoverable}
                  className="game-settings-row"
                  onClick={() => {
                    const next = !pvp.discoverable
                    // Turning Visibility on = open to challenges, so ask
                    // (once) to notify them while the app is in the background.
                    if (
                      next &&
                      typeof Notification !== 'undefined' &&
                      Notification.permission === 'default'
                    ) {
                      Notification.requestPermission().catch(() => {})
                    }
                    pvp.toggleDiscoverable(next)
                  }}
                  disabled={pvp.busy === 'discoverable'}
                >
                  <span className="game-settings-row-label">
                    <span className="game-settings-row-icon">
                      <span
                        className="game-settings-row-icon-badge"
                        aria-hidden="true"
                      >
                        <IconCrosshairs />
                      </span>
                    </span>
                    <span className="game-settings-row-text">
                      Visibility
                      <span className="game-settings-row-sub">
                        {pvp.discoverable
                          ? 'Nearby runners can find & challenge you'
                          : 'Hidden from nearby runners'}
                      </span>
                    </span>
                  </span>
                  <span
                    className={`game-switch ${pvp.discoverable ? 'is-on' : ''}`}
                    aria-hidden="true"
                  >
                    <span className="game-switch-knob" />
                  </span>
                </button>
                {pvp.error && (
                  <p className="game-controls-hint game-controls-hint-error">
                    {pvp.error}
                  </p>
                )}

                <button
                  type="button"
                  className="game-settings-row"
                  onClick={() => navigate('/profile/edit')}
                >
                  <span className="game-settings-row-label">
                    <span className="game-settings-row-icon">
                      <span
                        className="game-settings-row-icon-badge"
                        aria-hidden="true"
                      >
                        <IconUser />
                      </span>
                    </span>
                    <span className="game-settings-row-text">
                      Edit Profile
                      <span className="game-settings-row-sub">
                        You&apos;ll be redirected to your FahhKit account
                      </span>
                    </span>
                  </span>
                  <IconChevronRight
                    className="game-settings-row-chevron"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  className="game-settings-row game-settings-row-danger"
                  onClick={handleLogout}
                >
                  <span className="game-settings-row-label">
                    <span className="game-settings-row-icon">
                      <span
                        className="game-settings-row-icon-badge"
                        aria-hidden="true"
                      >
                        <IconLogout />
                      </span>
                    </span>
                    <span className="game-settings-row-text">
                      Log Out
                      <span className="game-settings-row-sub">
                        Clears your session and returns to the sign-in screen
                      </span>
                    </span>
                  </span>
                </button>

                {/* No dedicated About page exists in this app - this is
                    the closest real equivalent to the "Settings/About
                    page" the map tile credits need to show up on. */}
                <p className="game-settings-credits">
                  Map data © OpenStreetMap contributors, OpenMapTiles,
                  OpenFreeMap
                </p>
              </div>
            )}

            {menuTab === 'shop' && (
              <div className="game-menu-panel game-menu-shop game-cards">
                <div className="game-shop-wallet">
                  <span className="game-hud-icon game-hud-icon-coin" />
                  <span className="game-shop-wallet-value">
                    {profile?.fahhcoinBalance ?? 0}
                  </span>
                  <button
                    type="button"
                    className="game-btn game-btn-green game-btn-sm"
                    onClick={openCoinShop}
                  >
                    + Get more
                  </button>
                </div>
                {(storeError || storeActionError) && (
                  <p className="game-controls-hint game-controls-hint-error">
                    {storeError || storeActionError}
                  </p>
                )}

                <div className="game-menu-subtabs game-shop-tabs">
                  {SHOP_SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`game-menu-subtab ${shopSection === section.id ? 'active' : ''}`}
                      onClick={() => setShopSection(section.id)}
                      title={section.label}
                      aria-label={section.label}
                    >
                      <section.Icon />
                    </button>
                  ))}
                </div>

                {shopSection === 'heroes' && (
                  <HeroGallery
                    heroes={galleryHeroes}
                    ownedItems={ownedItems}
                    activeHeroId={activeHeroId}
                    loading={heroesLoading}
                    onSelect={(hero) => {
                      setStoreActionError(null)
                      setSelectedHeroId(hero.id)
                    }}
                    onEquip={handleEquip}
                  />
                )}

                {shopSection === 'territory' && (
                  <ColorShelf
                    title="Territory"
                    Icon={IconFlag}
                    items={shadeItems}
                    ownedItems={ownedItems}
                    Preview={ShadeFlag}
                    onBuy={setStoreChoice}
                    onEquip={handleEquip}
                    emptyText="No territory colours in stock yet."
                  />
                )}

                {shopSection === 'trail' && (
                  <ColorShelf
                    title="Trail"
                    Icon={IconRunning}
                    items={trailItems}
                    ownedItems={ownedItems}
                    Preview={TrailPreview}
                    onBuy={setStoreChoice}
                    onEquip={handleEquip}
                    emptyText="Fresh trail colours are on their way - check back soon!"
                  />
                )}
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
            nickname={viewingProfile.nickname}
            onClose={() => setViewingProfile(null)}
            onViewClub={handleViewClubByName}
            // A join requester is already asking in - Accept/Decline in
            // the Club tab covers it, so no separate invite button.
            canInvite={
              canInviteToClub &&
              !isMyEntry(viewingProfile) &&
              !viewingProfile.fromJoinRequest
            }
            onInvite={handleInviteToClub}
            actions={viewingProfile.clubActions}
            // See AthleteTerritoryProfilePanel's own comment on these -
            // viewing your own profile (e.g. tapping your row on the
            // leaderboard) reuses the exact same hero/emote selectors the
            // Me tab already trusts instead of this panel's own
            // getTerritoryProfileByUserId fetch, which used to come back
            // with no usable hero/emote for a player on a local avatar
            // pick rather than a real equipped HERO item.
            isSelf={isMyEntry(viewingProfile)}
            selfHeroName={activeHeroName}
            selfEmoteName={equippedEmoteItem?.name ?? null}
            selfShowsTurntable={showHeroTurntable}
            storeCatalog={storeCatalog}
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
                className="game-close-btn game-run-viewer-close"
                aria-label="Close"
                onClick={() => setViewingRun(null)}
              >
                <IconClose />
              </button>
              <ShareRunCarousel run={viewingRun} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {routeNamePromptOpen && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="game-confirm-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <p>Name your route</p>
              <input
                type="text"
                className="game-club-input"
                placeholder="e.g. Riverside Loop"
                value={routeNameInput}
                onChange={(e) => setRouteNameInput(e.target.value)}
                maxLength={60}
                autoFocus
              />
              <p>
                {formatMeters(routeDraftDistance)} ·{' '}
                {routeDraftWaypoints.length} points
              </p>
              {saveRouteError && (
                <p className="game-controls-hint game-controls-hint-error">
                  {saveRouteError}
                </p>
              )}
              <div className="game-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRouteNamePromptOpen(false)}
                  disabled={savingRoute}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={savingRoute || !profile?.clubName}
                  title={
                    profile?.clubName
                      ? undefined
                      : 'Join a club to share routes with it'
                  }
                  onClick={() =>
                    handleSaveRoute({
                      name: routeNameInput.trim() || 'My Route',
                      visibility: 'CLUB',
                    })
                  }
                >
                  {savingRoute ? 'Saving…' : 'Share with Club'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingRoute}
                  onClick={() =>
                    handleSaveRoute({
                      name: routeNameInput.trim() || 'My Route',
                      visibility: 'PRIVATE',
                    })
                  }
                >
                  {savingRoute ? 'Saving…' : 'Just Me'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExitConfirmOverlay backButton={backButton} />

      <AnimatePresence>
        {reminders.showPrompt && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="game-confirm-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <p>Want a nudge to go run? 🏃</p>
              <p className="game-controls-hint">
                Three quick reminders a day — morning, lunch, evening — skipped
                automatically on days you&apos;ve already run. You can turn
                these off anytime in Settings.
              </p>
              <div className="game-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={reminders.declinePrompt}
                >
                  Not now
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={reminders.acceptPrompt}
                >
                  Turn on reminders
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingRoute && !followingRoute && (
          <motion.div
            className="game-highlight-toast glass-card game-route-popup"
            initial={{ opacity: 0, x: '-50%', y: '-40%', scale: 0.9 }}
            animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: '-40%', scale: 0.9 }}
          >
            <button
              type="button"
              className="game-close-btn game-highlight-toast-close"
              aria-label="Close"
              onClick={handleCloseViewingRoute}
            >
              <IconClose />
            </button>
            <h3>{viewingRoute.name}</h3>
            <p>
              {formatMeters(viewingRoute.distanceMeters)} ·{' '}
              {viewingRoute.visibility === 'CLUB'
                ? 'Shared with club'
                : 'Private'}
            </p>
            {tracker.status === 'idle' &&
              !pendingRun &&
              (viewingRoute.points?.length || 0) >= 2 && (
                <div className="game-highlight-toast-actions">
                  <button
                    type="button"
                    className="game-route-run-btn"
                    onClick={handleRunViewedRoute}
                  >
                    🏃 Run This Route
                  </button>
                </div>
              )}
            {viewingRoute.ownerId === user?.id && (
              <div className="game-highlight-toast-actions">
                <button
                  type="button"
                  className={`game-route-visibility-btn ${
                    viewingRoute.visibility === 'CLUB' ? 'is-shared' : ''
                  }`}
                  disabled={
                    routeVisibilityBusyId === viewingRoute.id ||
                    (viewingRoute.visibility !== 'CLUB' && !profile?.clubName)
                  }
                  title={
                    viewingRoute.visibility !== 'CLUB' && !profile?.clubName
                      ? 'Join a club to share routes with it'
                      : undefined
                  }
                  onClick={() => handleToggleRouteVisibility(viewingRoute)}
                >
                  {routeVisibilityBusyId === viewingRoute.id
                    ? '…'
                    : viewingRoute.visibility === 'CLUB'
                      ? 'Make Private'
                      : 'Share with Club'}
                </button>
              </div>
            )}
            {viewingRoute.ownerId === user?.id && myRoutesError && (
              <p className="game-controls-hint game-controls-hint-error">
                {myRoutesError}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* One-time nudge right after End, when the GPS path never made it
          back near its start - draftLoopOpen below is the same client-side
          hint shown inline under Submit/Discard, just surfaced as a popup
          so it can't be scrolled past unnoticed. Doesn't block Submit -
          the run still saves to history either way (see
          game-claim-toast-saved below). */}
      <AnimatePresence>
        {pendingRun && draftLoopOpen && !loopWarningDismissed && (
          <motion.div
            className="game-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLoopWarningDismissed(true)}
          >
            <motion.div
              className="game-confirm-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p>
                <strong>Heads up — your loop&apos;s still open</strong>
              </p>
              <p>
                You finished away from where you started, so this run might not
                close out as territory. It&apos;ll still be saved to your run
                history either way - submit now, or head back out and close the
                loop first.
              </p>
              <div className="game-confirm-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setLoopWarningDismissed(true)}
                >
                  Got it
                </button>
              </div>
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
            className="game-confirm-overlay game-coin-shop-overlay"
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
                className="game-close-btn game-run-viewer-close"
                aria-label="Close"
                onClick={() => setCoinShopOpen(false)}
              >
                <IconClose />
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
            activeHeroId={activeHeroId}
            isActive={selectedHero.id === activeHeroId}
            error={storeActionError}
            onClose={closeHeroModal}
            onEquip={handleEquip}
            // Buying the hero itself (the only onBuy case left here now
            // that Skins is gone) closes this modal first.
            onBuy={(heroItem) => {
              setSelectedHeroId(null)
              setStoreChoice(heroItem)
            }}
            // Emote slides stay open behind the buy/showcase popup, unlike
            // onBuy above - the point is browsing the hero's whole emote
            // slider in place; closing storeChoice afterwards just returns
            // to it, and a freshly-bought emote unlocks on its own slide
            // immediately since ownedItems is the same prop driving both.
            onShowcase={setStoreChoice}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {storeChoice &&
          storeChoice.category === 'EMOTE' &&
          (() => {
            const price = storeChoice.priceFahhcoin || 0
            const balance = profile?.fahhcoinBalance ?? 0
            const short = price > balance
            // EMOTE slides open this same showcase popup whether owned or
            // not (see HeroDetailModal's HeroEmoteStage onShowcase) - an
            // owned one shows Equip/Unequip below instead of the buy flow,
            // since there's nothing left to purchase.
            //
            // storeChoice.id is null for the hero slider's idle slide
            // specifically (see HeroDetailModal.jsx's HeroEmoteStage) - no
            // hero actually has a real "emote1" StoreItem row to equip
            // (the 4 newest heroes never got one created, it's free; an
            // older hero's "Classic" row, if it still exists, can't be
            // name-matched to the renamed manifest keys any more). Idle is
            // the implicit default, not a purchasable row, so "equipped"
            // for it just means nothing ELSE is currently equipped for
            // this hero, and "Equip" means unequipping whatever else is,
            // not calling the API with a fake id.
            const storeChoiceHeroName = heroes.find(
              (h) => h.id === storeChoice.heroId
            )?.name
            const currentlyEquipped = resolveEquippedEmoteItem(
              ownedItems.filter((o) => o.equipped).map((o) => o.storeItem),
              storeChoice.heroId,
              storeChoiceHeroName
            )
            const ownedEmote = storeChoice.id
              ? ownedItems.find((o) => o.storeItem.id === storeChoice.id) ||
                // A free emote (price 0) counts as owned even with no real
                // ownedItems record for it - nothing to buy either way.
                (price <= 0
                  ? { equipped: currentlyEquipped?.id === storeChoice.id }
                  : null)
              : { equipped: !currentlyEquipped }
            return (
              <EmoteShowcase
                item={storeChoice}
                heroName={storeChoiceHeroName}
                owned={ownedEmote}
                price={price}
                balance={balance}
                short={short}
                purchasing={purchasing}
                purchaseError={purchaseError}
                storeActionError={storeActionError}
                onClose={closeStoreChoice}
                onBuy={() => handlePurchase(storeChoice)}
                onEquip={async () => {
                  if (!storeChoice.id) {
                    if (currentlyEquipped) {
                      await handleEquip({ id: currentlyEquipped.id }, true)
                    }
                    closeStoreChoice()
                    return
                  }
                  await handleEquip(storeChoice, ownedEmote.equipped)
                  closeStoreChoice()
                }}
                onGetCoins={() => {
                  closeStoreChoice()
                  openCoinShop()
                }}
              />
            )
          })()}
      </AnimatePresence>

      <AnimatePresence>
        {storeChoice &&
          storeChoice.category !== 'EMOTE' &&
          (() => {
            const price = storeChoice.priceFahhcoin || 0
            const balance = profile?.fahhcoinBalance ?? 0
            const short = price > balance
            return (
              <motion.div
                className="game-confirm-overlay game-buy-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeStoreChoice}
              >
                <motion.div
                  className="game-confirm-card game-buy-card"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="game-close-btn game-run-viewer-close"
                    aria-label="Close"
                    onClick={closeStoreChoice}
                  >
                    <IconClose />
                  </button>
                  {storeChoice.category === 'TERRITORY_SHADE' && (
                    <ShadeFlag
                      className="game-confirm-shade-preview"
                      color={storeChoice.colorValue}
                    />
                  )}
                  {storeChoice.category === 'TRAIL_COLOR' && (
                    <TrailPreview
                      className="game-confirm-shade-preview"
                      color={storeChoice.colorValue}
                    />
                  )}
                  {/* TERRITORY_SHADE/TRAIL_COLOR only ever reach this modal
                      unowned - an owned tile equips/unequips directly on tap
                      (see ColorShelf.jsx), without ever calling onBuy/
                      setStoreChoice - so there's no "already owned" branch
                      to handle here (EMOTE's own owned-vs-buy split now
                      lives in EmoteShowcase.jsx). HERO (the hero-unlock
                      item) reaches it the same unowned-only way, from
                      HeroDetailModal's own onBuy. */}
                  <p className="game-buy-title">
                    {price > 0 ? (
                      <>
                        Buy {storeChoice.name} for {price}{' '}
                        <span className="game-coin" aria-label="Fahhcoin" />?
                      </>
                    ) : (
                      `Unlock ${storeChoice.name} for free?`
                    )}
                  </p>
                  {short && (
                    <p className="game-buy-short">
                      Not enough Fahhcoin - you have {balance}, need{' '}
                      {price - balance} more.
                    </p>
                  )}
                  {purchaseError && (
                    <p className="game-controls-hint game-controls-hint-error">
                      {purchaseError}
                    </p>
                  )}
                  <div className="game-confirm-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={closeStoreChoice}
                      disabled={purchasing}
                    >
                      Cancel
                    </button>
                    {short ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          closeStoreChoice()
                          openCoinShop()
                        }}
                      >
                        Get Fahhcoin
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handlePurchase(storeChoice)}
                        disabled={purchasing}
                      >
                        {purchasing ? 'Buying…' : 'Buy'}
                      </button>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
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

export default function GamePage() {
  return (
    <ToastProvider>
      <GamePageInner />
    </ToastProvider>
  )
}
