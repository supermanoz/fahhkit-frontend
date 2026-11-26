import {
  Suspense,
  lazy,
  useLayoutEffect,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getRunMode, getRunModeLabel } from '../utils/runModeLabel'
import RunResultCard from '../components/RunResultCard'
import {
  CHEAT_COPY_NEUTRAL,
  checksTerritory,
  postRunModeOf,
  shouldShowRunRewards,
  showsRejection,
} from '../utils/postRun'
import {
  IconCheck,
  IconChevronDown,
  IconClose,
  IconCrosshairs,
  IconEnvelope,
  IconFlag,
  IconFlagCheckered,
  IconFlagScope,
  IconHelmet,
  IconMenuOrb,
  IconBolt,
  IconPause,
  IconPlay,
  IconRunning,
  IconSettings,
  IconStore,
  IconSwords,
  IconTrophy,
  IconUser,
  IconUsers,
} from '../components/GameIcons'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TerritoryMap from '../components/TerritoryMap'
import ShareRunCarousel from '../components/ShareRunCarousel'
import VehicleAlert from '../components/VehicleAlert'
import {
  OVER_SPEED_STATUS_LABEL,
  OVER_SPEED_WARNING_COPY,
  OVER_SPEED_WARNING_TITLE,
  SERVER_REJECTED_TERRITORY_COPY,
  SERVER_REJECTED_TITLE,
} from '../constants/runMessages'
import { describeGpsShortfall } from '../utils/runIssues'
import AthleteTerritoryProfilePanel from '../components/AthleteTerritoryProfilePanel'
import TerritoryPopup from '../components/TerritoryPopup'
import PvpResultPopup from '../components/PvpResultPopup'
import { usePvpPostRun } from '../hooks/usePvpPostRun'
import { useRivalHeroes } from '../hooks/useRivalHeroes'
import { useRunView } from '../hooks/useRunView'
import { isMapDebugEnabled } from '../utils/mapDebug'
import {
  clearSession as clearPvpSession,
  loadSession as loadPvpSession,
  markSeen as markPvpSeen,
  saveSession as savePvpSession,
} from '../utils/pvpResult'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useRunTracker } from '../hooks/useRunTracker'
import { useAuthFlow } from '../hooks/useAuthFlow'
import { useDailyNudge } from '../hooks/useDailyNudge'
import { scheduleDailyNudge } from '../utils/dailyNudge'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { useAndroidBackButton } from '../hooks/useAndroidBackButton'
// Dynamically imported (not bundled with the rest of the game) - a logged-
// in player never triggers this import at all, so it doesn't add to the
// bundle they actually download. See the logged-out branch below.
const GameAuthGate = lazy(() => import('../components/game-auth/GameAuthGate'))
import { useGameSocket } from '../hooks/useGameSocket'
import { useMailbox } from '../hooks/useMailbox'
import { mySide, partyOf, usePvp } from '../hooks/usePvp'
import { useClubWarWatch } from '../hooks/useClubWarWatch'
import { ApiError, isNetworkError, resolveFileUrl } from '../api/client'
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
import ProfileAvatar from '../components/ProfileAvatar'
import { getPvpModeByMeters } from '../api/pvp'
import {
  equipStoreItem,
  findHeroes,
  getHero,
  getOwnedStoreItems,
  getStoreCatalog,
  purchaseStoreItem,
  claimFreeItem,
  unequipStoreItem,
} from '../api/store'
import { getFahhcoinBundles } from '../api/coinPurchase'
import {
  createRoute,
  findMyRoutes,
  getRoute,
  toggleRouteVisibility,
} from '../api/routes'
import { snapSegment } from '../utils/routeSnapping'
import {
  DEFAULT_CENTER,
  isLoopOpen,
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
} from '../utils/run'
import { playSfx } from '../utils/gameSound'
import { resumeAudio, routeElement } from '../utils/audioGraph'
import { useAudioVolumes } from '../hooks/useAudioVolumes'
import GameSettings from '../components/GameSettings'
import { installUiSounds } from '../utils/uiSounds'
import useDefaultHeroBootstrap from '../hooks/useDefaultHeroBootstrap'
import { isCometHero, isPlaceholderHero } from '../utils/hero'
import {
  getItemState,
  isNotOwnedError,
  ITEM_STATE,
  needsClaim,
  visibleStoreError,
} from '../utils/itemState'
import {
  hasHero as hasHeroManifest,
  getHero as getHeroManifest,
} from '../utils/heroManifest'
import HeroSprite from '../components/HeroSprite'
import HeroStage from '../components/HeroStage'
import LevelBar from '../components/LevelBar'
import ClubPanel from '../components/ClubPanel'
import MailPanel from '../components/MailPanel'
import PvpPanel from '../components/PvpPanel'
import PortalClouds from '../components/portal/PortalClouds'
import PvpGatePrompt from '../components/pvp/PvpGatePrompt'
import { usePortalTransition } from '../hooks/usePortalTransition'
import {
  PVP_SOURCES,
  createPvpEntry,
  resolveMatchStart,
} from '../utils/pvpEntry'
import { getLocationState } from '../utils/locationPermission'
import { isLive as isLivePvp } from '../utils/pvpCopy'
import { openAppSettings } from '../utils/saveImage'
import HeroGallery from '../components/HeroGallery'
import ShadeFlag from '../components/ShadeFlag'
import TrailPreview from '../components/TrailPreview'
import ColorShelf from '../components/ColorShelf'
import ColorItemSheet from '../components/shop/ColorItemSheet'
import EmoteShowcase from '../components/EmoteShowcase'
import MedalGrid from '../components/MedalGrid'
import ChallengePrompt from '../components/ChallengePrompt'
import BroadcastPrompt from '../components/BroadcastPrompt'
import GameTour from '../components/GameTour'
import { useGameTour } from '../hooks/useGameTour'
import { tourWaitReason } from '../utils/tour'
import GameLegalModal from '../components/game-legal/GameLegalModal'
import { useAnnouncementNotices } from '../hooks/useAnnouncementNotices'
import { useDailyReward } from '../hooks/useDailyReward'
import {
  applyDelta,
  bindUser as bindFahhcoinUser,
  coinsToken,
  getCoins,
  refresh as refreshFahhcoin,
  setCoins,
  setCoinsIfCurrent,
  setCoinsIfNewer,
  startResumeRefresh,
  useCoins,
} from '../state/coins'
import { mailData } from '../utils/mailDetails'
import { useWelcomeBonus } from '../hooks/useWelcomeBonus'
import { useLeaderboardPages } from '../hooks/useLeaderboardPages'
import { rangeLabel } from '../utils/leaderboardPaging'
import WelcomeBonusModal from '../components/WelcomeBonusModal'
import { popupBlockedBy } from '../utils/popupQueue'
import {
  MAP_ROTATION_ENABLED,
  SHOW_PVP_ENTRY,
  SHOW_PVP_IN_DROPDOWN,
} from '../config/features'
import {
  pickerBadgeCount,
  pickerTabs,
  visiblePlayOptions,
} from '../utils/playOptions'
import { SHOW_ICON_LABELS } from '../config/iconLabels'
import DailyRewardModal from '../components/DailyRewardModal'
import { DailyHudChest } from '../components/DailyChest'
import RunRewardsModal from '../components/RunRewardsModal'
import ClubBadge from '../components/ClubBadge'
import ClubTrophyIcon from '../components/ClubTrophyIcon'
import NicknameCard from '../components/NicknameCard'
import { getDisplayName, playerNameOf } from '../utils/playerName'
import { formatCoins, formatNumber } from '../utils/format'
import CoinAmount from '../components/CoinAmount'
import { formatPrice, getHeroUnlockItem } from '../utils/price'
import Price from '../components/Price'
import {
  getSiteUrl,
  iosShopRedirectBlocked,
  openShopPack,
} from '../utils/siteUrl'
import { openExternal } from '../utils/externalLink'
import { App as CapacitorApp } from '@capacitor/app'
import { isNative } from '../utils/geo'
import {
  GOOD_FIX_ACCURACY_M,
  idleWatchShouldRun,
  shouldCommitFix,
} from '../utils/idleGps'
import { useAppActive } from '../hooks/useAppActive'
import { perf } from '../dev/perfLog'
import { visibleInterval } from '../utils/visibleInterval'
import HeroDetailModal from '../components/HeroDetailModal'
import IdleNudge from '../components/IdleNudge'
import GameIntroGlobe from '../components/GameIntroGlobe'
import GameLoadingBackdrop from '../components/GameLoadingBackdrop'
import MailBadgeIcon from '../components/MailBadgeIcon'
import LeaderboardPodium, {
  LeaderboardSkeleton,
  LeaderboardDock,
} from '../components/LeaderboardPodium'
import SponsorBannerCarousel from '../components/SponsorBannerCarousel'
import RouteTurnIndicator from '../components/RouteTurnIndicator'
import { getRouteGuidance } from '../utils/routeNav'
import defaultAvatarImage from '../assets/avatars/blaze.png'
import runConquestLogo from '../assets/ui/brand/run_conquest_logo-ui.webp'
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
import '../game/ui/gameSkin.css'
import { GameModal, GameActions } from '../game/ui/GameModal'
import GameButton from '../components/ui/GameButton'
import { blurActiveField } from '../utils/blurActiveField'
import ConnectionBanner from '../components/ConnectionBanner'
import { useIsOnline } from '../utils/connectivity'
import { useRunSync } from '../hooks/useRunSync'
import {
  enqueueRun,
  pendingCount,
  removeOutboxRun,
  retryOutboxRun,
} from '../utils/runOutbox'
import {
  buildRunMeta,
  buildRunPayload,
  buildRunSummary,
} from '../utils/runPayload'
import OfflineRunSavedModal from '../components/OfflineRunSavedModal'
import PendingRunsList from '../components/PendingRunsList'
import { OFFLINE_BLOCKED_TABS } from '../utils/offlineFeatures'
import {
  formatLastUpdated,
  loadCachedProfile,
  saveCachedProfile,
} from '../utils/profileCache'

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
// Menu entries that are gameplay (halted outside a rolled-out area). Me
// (profile), Shop and Settings are deliberately absent so they stay usable.
const ROLLOUT_LOCKED_TABS = new Set([
  'play',
  'conquer',
  'training',
  'race',
  'club',
  'leaderboard',
])

// `showLabel: false` hides just that item's text label (the aria-label/title
// stay); SHOW_ICON_LABELS (config/iconLabels.js) still switches all of them off.
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
    showLabel: false,
    x: -100,
    y: 0,
  },
  {
    tab: 'settings',
    label: 'Settings',
    Icon: IconSettings,
    tone: 'mini',
    showLabel: false,
    x: 100,
    y: 0,
  },
]

// What the red Play button opens into: the original start-a-run ("Conquer"
// territory), Training, or a PvP race (in that order) - a choice between modes, shown in
// place of the main layout.
const ALL_PLAY_OPTIONS = [
  {
    tab: 'conquer',
    label: 'Conquer',
    Icon: IconFlag,
    tone: 'green',
    x: -120,
    y: -170,
  },
  {
    tab: 'training',
    label: 'Training',
    Icon: IconRunning,
    tone: 'gold',
    x: 0,
    y: -170,
  },
  {
    tab: 'race',
    label: 'PvP',
    Icon: IconSwords,
    tone: 'violet',
    x: 120,
    y: -170,
  },
]
// PvP is hidden unless SHOW_PVP_ENTRY (config/features.js); the rest re-centre.
const PLAY_OPTIONS = visiblePlayOptions(ALL_PLAY_OPTIONS, SHOW_PVP_ENTRY)

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
    title: SERVER_REJECTED_TITLE,
    message: SERVER_REJECTED_TERRITORY_COPY,
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
    message: `That loop didn't enclose enough ground. Territory needs at least ${formatNumber(LOOP_MIN_AREA_SQ_METERS)} m² inside it, so go bigger.`,
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
const HEROES_CACHE_KEY = 'shop.heroes.v1'
function readCachedHeroes() {
  try {
    const raw = window.localStorage.getItem(HEROES_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
function writeCachedHeroes(list) {
  try {
    window.localStorage.setItem(HEROES_CACHE_KEY, JSON.stringify(list))
  } catch {
    // Quota/private mode - the cache is only an optimisation.
  }
}

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
              <GameButton variant="neutral" onClick={backButton.cancelExit}>
                Stay
              </GameButton>
              <GameButton onClick={backButton.confirmExit}>Exit</GameButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
/* eslint-enable react/prop-types */

/* eslint-disable react/prop-types -- no prop-types dependency in this project */
// Mail's tab icon is the real mail_icon badge asset, but it now sits inside
// the SAME .game-menu-picker-medal ring every other tab uses (ink border,
// drop shadow, size - one class, so they can't drift); the image just fills
// the ring (MailBadgeIcon `fill`) and `tone-mail` swaps the coin colour for
// the badge's blue. Used for all three places that render a tab's icon
// (desktop row, header "current" trigger, dropdown list).
function TabMedal({ tab, medalClassName = '' }) {
  return (
    <span
      className={`game-menu-picker-medal ${medalClassName} tone-${tab.tone}`}
    >
      {tab.tone === 'mail' ? <tab.Icon fill /> : <tab.Icon />}
    </span>
  )
}
/* eslint-enable react/prop-types */

function GamePageInner() {
  const toast = useToast()
  // Online-only features are shaded while offline and answer a tap with this
  // toast instead of opening (see utils/offlineFeatures.js).
  const offline = !useIsOnline()
  const needsInternet = () =>
    toast.push('Needs internet', { type: 'info', duration: 2500 })
  const navigate = useNavigate()
  const { user, isAuthed, loading: userLoading, replaceUser } = useCurrentUser()
  const auth = useAuthFlow()
  const userIdRef = useRef(null)
  userIdRef.current = user?.id ?? null
  useDailyNudge({ isAuthed, loading: userLoading })
  const tracker = useRunTracker()
  perf.render('GamePage')
  // A full reload (not just clearing the token + re-rendering) is
  // deliberate here - this page holds dozens of pieces of React state tied
  // to the signed-in player (hero, territory, run tracker, club, etc.) that
  // have no single "reset to signed-out" path; reloading guarantees none of
  // it leaks into whatever the next GameAuthGate session does, at the cost
  // of a logout being the one action in the game that isn't instant.
  // Runs recorded on this phone that haven't uploaded yet stay on the phone for
  // this account (signing out never deletes them) - but say so first.
  const [logoutWarn, setLogoutWarn] = useState(false)
  async function handleLogout(confirmed = false) {
    if (confirmed !== true && pendingCount(runSync.runs) > 0) {
      setLogoutWarn(true)
      return
    }
    setLogoutWarn(false)
    // Stop pushes for this player on this phone first (needs the token still
    // valid; bounded to ~1.5s and never throws).
    await auth.signOut()
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
  // resumeTick: bumped when the app returns from the background, so the
  // check runs again on the next fresh fix. userId: a different player
  // signing in starts from a clean slate.
  const [resumeTick, setResumeTick] = useState(0)
  const rolloutStatus = useRolloutStatus(liveLocation, {
    userId: user?.id ?? null,
    resumeTick,
  })
  // Location permission denied (watchPosition error code 1) - its own
  // message, deliberately NOT the "not rolled out" lock: we can't tell where
  // the player is, so nothing is locked (unknown rollout state = available).
  const [locationDenied, setLocationDenied] = useState(false)
  const locationDeniedRef = useRef(false)
  locationDeniedRef.current = locationDenied
  // Bumped to restart the standing GPS watch (permission granted after the
  // watch already started, or the player came back from Settings).
  const [gpsRestartTick, setGpsRestartTick] = useState(0)
  // Positively outside a rolled-out area -> the whole game is halted and
  // greyed out. Settings/Profile(Me)/Shop stay usable. Never applies mid-run
  // (a run already underway is never yanked away).
  const gameLocked = rolloutStatus.blocked && tracker.status !== 'tracking'
  // Gates the "Preparing your run…" loading screen - true only once the
  // basemap has actually finished loading tiles (see TerritoryMap.jsx's
  // PokemonStyleBaseLayer, which fires this on MapLibre's "idle" event), not
  // just once the map component has mounted.
  const [mapReady, setMapReady] = useState(false)
  const handleMapReady = useCallback(() => setMapReady(true), [])

  const [profile, setProfile] = useState(null)
  // The ONE Fahhcoin balance (state/coins.js): every pill / popup /
  // shop / PvP / club read below goes through it, never profile.fahhcoinBalance.
  const fahhcoin = useCoins()
  useEffect(() => {
    const uid = isAuthed ? user?.id : null
    bindFahhcoinUser(uid)
    if (uid) refreshFahhcoin({ force: true })
  }, [isAuthed, user?.id])
  useEffect(() => startResumeRefresh(), [])
  // Set while `profile` is the on-device copy (offline) rather than fresh.
  const [profileCachedAt, setProfileCachedAt] = useState(null)
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
  // The ONE scroll container every menu tab (Leaderboard, Club, Me, Shop,
  // Settings...) shares - see the reset effect below.
  const menuSheetRef = useRef(null)
  // Latest menu tab, readable from async callbacks (see goToMyRunsPage).
  const menuTabRef = useRef(null)
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
  const [leaderboardMode, setLeaderboardMode] = useState('individual')
  // Solo: ranked worldwide, or just within the city the backend resolves
  // from your last-known GPS fix. Club: worldwide, or just within your
  // country (every city in it pooled together) - see useLeaderboardPages.
  const [individualScope, setIndividualScope] = useState('global')
  const [clubScope, setClubScope] = useState('global')
  // Set when a club leaderboard row is tapped - the Club tab jumps straight
  // to that club's info instead of wherever it was left.
  const [openClubId, setOpenClubId] = useState(null)
  const [storeCatalog, setStoreCatalog] = useState([])
  const [shopSection, setShopSection] = useState('heroes')

  // The Territory / Trail preview sheet: which item (by id) and which shelf.
  const [colorPreview, setColorPreview] = useState(null)
  // Buy confirm pop-up: request in flight / its own error line.
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState(null)
  const [ownedItems, setOwnedItems] = useState([])
  const [storeError, setStoreError] = useState(null)
  const [storeActionError, setStoreActionError] = useState(null)
  const [coinShopOpen, setCoinShopOpen] = useState(false)
  const [coinBundles, setCoinBundles] = useState([])
  const [coinBundlesError, setCoinBundlesError] = useState(null)
  // The bundle a Buy tap picked, driving the "Open the Shop" redirect
  // confirmation popup below (not a direct purchase any more - see
  // handleContinueToShop's own comment for why).
  const [buyRedirectBundle, setBuyRedirectBundle] = useState(null)
  const [buyRedirecting, setBuyRedirecting] = useState(false)
  const [buyRedirectError, setBuyRedirectError] = useState(null)
  // Hero roster is public catalog data: seed from the last fetch so the Shop
  // paints instantly on a cold start while loadHeroes revalidates in the
  // background (stale-while-revalidate).
  const [heroes, setHeroes] = useState(readCachedHeroes)
  const [heroesLoading, setHeroesLoading] = useState(false)
  // True once /v1/store/owned has answered at least once (see loadStore).
  const [ownedLoaded, setOwnedLoaded] = useState(false)
  // Id, not the object, so the modal picks up the refreshed hero after an
  // equip reloads the roster.
  const [selectedHeroId, setSelectedHeroId] = useState(null)

  const [menuOpen, setMenuOpen] = useState(false)
  // No text field may hold focus while running: it is what lets iOS's "Shake
  // to Undo" pop "Undo Typing" over the run (also disabled natively). Blur when
  // the run starts, when the app comes back to the foreground, and whenever the
  // menu/popups are closed mid-run.
  useEffect(() => {
    if (tracker.status !== 'tracking') return undefined
    if (!menuOpen) blurActiveField()
    const onVisible = () => {
      if (document.visibilityState === 'visible') blurActiveField()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [tracker.status, menuOpen])
  const [menuTab, setMenuTab] = useState('me')
  // Run Conquest terms/privacy overlay opened from Settings ('terms'|'privacy').
  const [legalDoc, setLegalDoc] = useState(null)
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
      // A Shop preview sheet is open: Escape closes just that.
      if (colorPreview) return
      if (tabPickerOpen) setTabPickerOpen(false)
      else setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen, tabPickerOpen, colorPreview])

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
  // never exits mid-run (it minimises the app instead). See
  // useAndroidBackButton's own comment for why `blocked` matters here.
  // Set by GameAuthGate (via onBackStateChange below) while logged out -
  // null at its WELCOME screen, otherwise a function that steps it back one
  // screen. A ref, not state: GameAuthGate updates it on its own render
  // cycle, and the back-button layer below reads it fresh on every actual
  // button press rather than whatever it was at GamePage's last render.
  const authBackRef = useRef(null)
  // The first-time tour (see useGameTour below): Back = previous step, or
  // close (same as Skip) on the first one. A ref so this earlier hook always
  // reads the tour's latest state.
  const tourBackRef = useRef({ active: false, close: () => {} })
  // True while the tour is showing or about to - the idle nudge (written
  // earlier in this component than the tour hook) holds off for it.
  const tourBusyRef = useRef(false)
  const backButton = useAndroidBackButton({
    layers: [
      {
        isOpen: () => tourBackRef.current.active,
        close: () => tourBackRef.current.close(),
      },
      // A cloud transition in progress: Back cancels it cleanly.
      {
        isOpen: () => portalActiveRef.current,
        close: () => portalCancelRef.current(),
      },
      {
        isOpen: () => Boolean(authBackRef.current),
        close: () => authBackRef.current?.(),
      },
      {
        isOpen: () => Boolean(colorPreview),
        close: () => setColorPreview(null),
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
      {
        isOpen: () => menuOpen,
        close: () =>
          menuTabRef.current === 'race'
            ? exitPvpRef.current()
            : setMenuOpen(false),
      },
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
  // "Run saved" popup for a run queued while offline.
  const [offlineSavedRun, setOfflineSavedRun] = useState(null)
  // The PvP post-run popup (components/PvpResultPopup): one session per
  // finished race run, from "Calculating..." to the final WIN/LOSE.
  const [pvpSession, setPvpSession] = useState(null)
  const pvpSessionRef = useRef(null)
  pvpSessionRef.current = pvpSession
  // HUD coin value while the popup counts the balance up (null = real value).
  const [pvpHudCoins, setPvpHudCoins] = useState(null)
  const pvpSubmitInFlightRef = useRef(false)
  const pvpAutoSubmitRef = useRef(null)
  // Uploads queued runs whenever it can (online again, app foreground, app
  // start, right after login) and exposes them for the Pending runs list.
  const runSync = useRunSync({
    userId: user?.id ?? null,
    send: (payload) => createRun(payload),
    onSynced: handleSyncedRun,
  })
  // A run that ENDS (or is found stopped after an app kill) while offline goes
  // straight to the outbox. Runs below the minimum keep the normal card, which
  // explains why they won't count.
  const autoQueuedRef = useRef(new Set())
  useEffect(() => {
    const run = tracker.pendingRun
    if (!run || !offline || !user?.id) return
    if (
      run.distance < MIN_VALID_RUN_DISTANCE_METERS ||
      run.duration < MIN_VALID_RUN_DURATION_SECONDS
    ) {
      return
    }
    const id = buildRunPayload(run).clientRunId
    if (autoQueuedRef.current.has(id)) return
    autoQueuedRef.current.add(id)
    queueRunForUpload(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queue once per run
  }, [tracker.pendingRun, offline, user?.id])
  const [saveError, setSaveError] = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [gpsErrorDismissed, setGpsErrorDismissed] = useState(false)
  // The run just submitted, kept around so "Download Map" in the result
  // toast has something to export — createRun's response (RunSummaryResponse)
  // has no points, so this is built from the local pendingRun data plus the
  // id/avgPace the backend hands back.
  const [completedRun, setCompletedRun] = useState(null)
  // The score breakdown the backend already pushes over the socket for
  // every scored run (RunScoreBreakdownResponse, see onRunProcessed below)
  // - previously only read to pick a rejection message, never to show the
  // actual numbers (see RunRewardsModal.jsx). null for a cheat-flagged run
  // (never scored at all) or a PvP race (scored entirely separately, no
  // push at all for that mode - see TerritoryProcessingServiceImpl).
  const [runScoreBreakdown, setRunScoreBreakdown] = useState(null)

  // Music + Sound-effects volume sliders (Settings > Sound): 0-100, saved on
  // every change, applied live and restored on launch (hooks/useAudioVolumes).
  // 0 = muted - the old on/off meaning - so the music effect below still just
  // pauses the track then. Old on/off values are migrated in utils/audioSettings.
  const volumes = useAudioVolumes()
  const { musicMuted } = volumes
  const musicRef = useRef(null)
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
  // Mode pill text on the in-run card. Long ones ("Territory Capture",
  // "Training · Paused") get a compact card variant on narrow phones so the
  // "Run Conquest" brand text beside them isn't clipped.
  const runStatusLabel =
    tracker.vehicleState === 'vehicle'
      ? OVER_SPEED_STATUS_LABEL
      : getRunModeLabel(
          getRunMode(tracker),
          tracker.paused ? 'paused' : undefined
        )
  // Swipe-up/down on the run card's grip: while dragging, gripDragH is the
  // live height of the details area (0..its natural capped height) so the
  // card follows the finger; on release it snaps to expanded/collapsed.
  const [gripDragH, setGripDragH] = useState(null)
  const detailsScrollRef = useRef(null)
  const gripDragRef = useRef(null)
  function handleGripPointerDown(e) {
    const cap = detailsScrollRef.current?.offsetHeight || 0
    gripDragRef.current = {
      startY: e.clientY,
      startH: statsOnly ? 0 : cap,
      cap,
      lastY: e.clientY,
      lastT: e.timeStamp,
      v: 0,
      h: statsOnly ? 0 : cap,
      moved: false,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function handleGripPointerMove(e) {
    const d = gripDragRef.current
    if (!d) return
    const dy = d.startY - e.clientY
    if (!d.moved && Math.abs(dy) < 6) return
    d.moved = true
    const dt = Math.max(1, e.timeStamp - d.lastT)
    d.v = (d.lastY - e.clientY) / dt // px/ms, up = positive
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    d.h = Math.min(d.cap, Math.max(0, d.startH + dy))
    setGripDragH(d.h)
  }
  function handleGripPointerUp() {
    const d = gripDragRef.current
    gripDragRef.current = null
    if (!d) return
    if (!d.moved) {
      setStatsOnly((collapsed) => !collapsed)
      return
    }
    const expand = Math.abs(d.v) > 0.4 ? d.v > 0 : d.h > d.cap / 2
    setStatsOnly(!expand)
    setGripDragH(null)
  }
  function handleGripPointerCancel() {
    gripDragRef.current = null
    setGripDragH(null)
  }
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
  // Conquer only (Training / PvP / Club War never capture territory - see
  // postRun.checksTerritory). Ending one of those never shows the loop warning.
  const liveRunIsConquer = checksTerritory(
    postRunModeOf({
      isTraining: tracker.isTraining,
      challengeId: tracker.challengeId,
      clubWarId: tracker.clubWarId,
    })
  )
  const liveLoopOpen = isLoopOpen(tracker.path)
  const endClickedRef = useRef(false)
  // End: a Conquer run whose loop isn't closed gets the "Loop not closed yet"
  // popup INSTEAD of "End this run?" (one popup, never two).
  function handleRequestEnd() {
    endClickedRef.current = false
    setConfirmAction(
      tracker.status === 'tracking' && liveRunIsConquer && liveLoopOpen
        ? 'loop'
        : 'end'
    )
  }
  // While that popup is open: the loop closing swaps it for the normal
  // confirm (nothing left to warn about); the run ending by itself (vehicle
  // discard, auto-finish...) just dismisses it.
  useEffect(() => {
    if (confirmAction !== 'loop') return
    if (tracker.status !== 'tracking') setConfirmAction(null)
    else if (!liveLoopOpen) setConfirmAction('end')
  }, [confirmAction, tracker.status, liveLoopOpen])
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
  // Who you're about to race (PvP only), shown above the 3-2-1.
  const [countdownVs, setCountdownVs] = useState(null)
  const pendingStartRef = useRef(null)

  function resetForRunStart() {
    setGpsErrorDismissed(false)
    setStatsOnly(true)
    setConfirmAction(null)
    setMapMode('follow')
  }

  function beginCountdownThenStart(startFn) {
    if (gameLocked) return
    resetForRunStart()
    pendingStartRef.current = startFn
    setStartCountdown(3)
  }

  // Tap the countdown to back out - nothing starts (the queued start
  // function is dropped before it can fire).
  function cancelCountdown() {
    pendingStartRef.current = null
    setStartCountdown(null)
    setCountdownVs(null)
  }

  useEffect(() => {
    if (startCountdown == null) return
    if (startCountdown === 'GO') {
      const timeout = setTimeout(() => {
        setStartCountdown(null)
        setCountdownVs(null)
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

  // ONE standing GPS watch feeds both the map's starting center and the hero
  // marker (liveLocation), so they can never disagree. It starts the moment
  // the user is authed (long before the intro ends). `locating` clears at
  // the first accurate fix (<= GOOD_FIX_ACCURACY_M) or after 5s with the
  // best fix so far; until then `center` follows each incoming fix so the
  // map starts exactly where the hero is. Once a good fix exists, a worse
  // fix that would jump the hero further than its own error is ignored, and
  // near-identical fixes within 1s are dropped (fewer GamePage re-renders).
  const liveLocationRef = useRef(null)
  // Adaptive GPS (see utils/idleGps.js): this watch is OFF while a run is
  // being tracked (the run tracker owns GPS then and the hero position comes
  // from its path - two simultaneous high-accuracy streams doubled the GPS
  // cost) and while the app is backgrounded; it restarts on return. Fixes
  // that are just jitter inside the accuracy circle aren't committed, so a
  // phone lying still doesn't re-render this whole page every second.
  const appActive = useAppActive()
  const gpsOff = !idleWatchShouldRun({
    runTracking: tracker.status === 'tracking',
    appActive,
  })
  const menuOpenRef = useRef(false)
  menuOpenRef.current = menuOpen
  const gpsStartedForTickRef = useRef(null)
  useEffect(() => {
    if (!isAuthed || !('geolocation' in navigator)) {
      setLocating(false)
      return undefined
    }
    if (gpsOff) {
      // Never leave the loading screen waiting on a watch that is
      // deliberately off (a run resumed on launch, app opened hidden).
      setLocating(false)
      return undefined
    }
    // The first-fix "settle" (loading bar + recentre) only applies to a fresh
    // start (login, or location newly allowed) - not to resuming after a
    // run / the background, which must not yank the map around.
    const fresh = gpsStartedForTickRef.current !== gpsRestartTick
    gpsStartedForTickRef.current = gpsRestartTick
    let settled = !fresh
    let lastCommitAt = 0
    const settle = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      setLocating(false)
    }
    const timeout = fresh ? setTimeout(settle, 5000) : null
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        perf.geo('idle-watch')
        const fix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          // Kept (like useRunTracker's points) so the heading cone and
          // Blaze's run animation also work outside a tracked run.
          accuracy: position.coords.accuracy,
          // When the OS took this fix - the rollout check ignores a stale
          // (cached) one, see utils/gpsFix.js.
          timestamp: position.timestamp,
          speed: position.coords.speed ?? null,
          heading: position.coords.heading ?? null,
        }
        const good = fix.accuracy != null && fix.accuracy <= GOOD_FIX_ACCURACY_M
        const prev = liveLocationRef.current
        const now = Date.now()
        if (prev) {
          const prevGood =
            prev.accuracy != null && prev.accuracy <= GOOD_FIX_ACCURACY_M
          const moved = haversineDistance(prev, fix)
          if (prevGood && !good && moved > (prev.accuracy || 0)) return
          if (
            settled &&
            !shouldCommitFix({
              prev,
              fix,
              movedM: moved,
              elapsedMs: now - lastCommitAt,
              menuOpen: menuOpenRef.current,
            })
          ) {
            return
          }
        }
        lastCommitAt = now
        liveLocationRef.current = fix
        setLocationDenied(false)
        setLiveLocation(fix)
        if (!settled) {
          setCenter({ lat: fix.lat, lng: fix.lng })
          if (good) settle()
        }
      },
      (err) => {
        if (err?.code === 1) setLocationDenied(true)
        settle()
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => {
      clearTimeout(timeout)
      navigator.geolocation.clearWatch(watchId)
      // Torn down before the first fix settled (React StrictMode runs every
      // effect twice in dev): the next run must count as fresh again, or it
      // starts "settled" with no 5s timeout and `locating` never clears -
      // the loading screen would sit on "Finding your location…" forever.
      if (!settled) gpsStartedForTickRef.current = null
    }
  }, [isAuthed, gpsRestartTick, gpsOff])

  // Location permission asked AFTER login: the watch above started before the
  // player answered the prompt, so when the answer is "allow" restart it and
  // the first fix flows straight into the rollout check.
  useEffect(() => {
    if (!isAuthed || !navigator.permissions?.query) return undefined
    let status = null
    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (cancelled) return
        status = result
        status.onchange = () => {
          if (status.state !== 'granted') return
          setLocationDenied(false)
          setGpsRestartTick((n) => n + 1)
        }
      })
      .catch(() => {
        // Permissions API unsupported here - the watch's own callbacks cover it.
      })
    return () => {
      cancelled = true
      if (status) status.onchange = null
    }
  }, [isAuthed])

  // Back from the background: re-check the rollout status on the next fresh
  // fix, and if location was denied meanwhile (the player may have switched
  // it on in Settings) start the GPS watch again.
  useEffect(() => {
    if (!isAuthed) return undefined
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      setResumeTick((n) => n + 1)
      if (locationDeniedRef.current) setGpsRestartTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
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
  // Coin screens re-read the balance when they open (throttled by the store).
  const coinScreenOpen = menuOpen && ['shop', 'race', 'club'].includes(menuTab)
  useEffect(() => {
    if (coinScreenOpen) refreshFahhcoin()
  }, [coinScreenOpen, menuTab])
  const pvp = usePvp({
    userId: isAuthed ? user?.id : null,
    playerLocation,
    pvpOpen,
  })

  // --- PvP post-run: follow the finished race run to its result ----------
  // (usePvpPostRun: own result -> rival via socket/poll -> wallet). The
  // socket push reaches it through pvp.challenges (usePvp.handlePush).
  const pvpRivalSide = pvpSession?.challengeId
    ? (() => {
        const c = pvp.challenges.find((x) => x.id === pvpSession.challengeId)
        return c ? mySide(c, user?.id) : null
      })()
    : null
  const pvpRivalHeroes = useRivalHeroes([pvpRivalSide?.opponentId])
  const pvpRivalHero =
    pvpRivalSide?.opponentHero ||
    pvpRivalHeroes[pvpRivalSide?.opponentId] ||
    null
  const pvpFollow = usePvpPostRun({
    session: pvpSession?.runId ? pvpSession : null,
    userId: user?.id ?? null,
    pushed: pvpSession
      ? pvp.challenges.find((c) => c.id === pvpSession.challengeId) || null
      : null,
    refreshProfile,
  })
  // The wallet balance from BEFORE the race resolved (the payout is shown as
  // the server's before/after difference): if the profile hadn't loaded yet
  // when the run was submitted, take the first balance that arrives - as long
  // as the race isn't resolved (the refresh after it must not become "before").
  useEffect(() => {
    const bal = fahhcoin
    if (
      pvpSession &&
      pvpSession.balanceBefore == null &&
      bal != null &&
      !pvpFollow.view.resolved
    ) {
      setPvpSession((s) => (s ? { ...s, balanceBefore: bal } : s))
    }
  }, [fahhcoin, pvpSession, pvpFollow.view.resolved])
  // App was closed before the result was seen: pick the race up again.
  useEffect(() => {
    if (!user?.id || pvpSessionRef.current) return
    const saved = loadPvpSession(user.id)
    if (saved) setPvpSession({ ...saved, status: 'submitted' })
  }, [user?.id])
  // Closed while waiting for the rival: when the result lands, bring it back.
  useEffect(() => {
    if (pvpSession?.dismissed && pvpFollow.view.resolved) {
      setPvpSession((s) => (s ? { ...s, dismissed: false } : s))
    }
  }, [pvpSession?.dismissed, pvpFollow.view.resolved])
  // A race ended by hand (End -> Yes, End) submits itself, like the
  // auto-finish at the target distance already did.
  useEffect(() => {
    const run = tracker.pendingRun
    if (!run?.challengeId || saving || offline) return
    const key = run.clientRunId || run.startedAt
    if (pvpAutoSubmitRef.current === key) return
    pvpAutoSubmitRef.current = key
    attemptSubmit(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per run
  }, [tracker.pendingRun])
  function closePvpPopup() {
    const s = pvpSession
    if (!s) return
    if (pvpFollow.view.resolved) {
      markPvpSeen(s.challengeId)
      clearPvpSession()
      setPvpSession(null)
    } else if (s.status === 'submitted' && s.runId) {
      // Keep following in the background; the popup returns with the result.
      setPvpSession({ ...s, dismissed: true })
    } else {
      setPvpSession(null)
    }
  }

  // Run-processing outcomes pushed over the socket, keyed by run id - the
  // push can land before OR after createRun() resolves, so it's parked here
  // and checked from both sides (onRunProcessed and attemptSubmit).
  const runOutcomesRef = useRef({})
  // The run whose result toast is currently showing; once its outcome is
  // known, the territory-event poll for it stops early.
  const watchedRunIdRef = useRef(null)
  // Mode of the run being watched (utils/postRun.js) - decides whether a
  // server outcome may show territory wording at all.
  const watchedModeRef = useRef(null)
  const settledRunIdRef = useRef(null)

  function showRunOutcome(outcome) {
    // Only a Conquer run is judged on territory: Training / PvP / Club War
    // never open a "loop not closed" style popup (a cheat flag still does,
    // with copy that doesn't talk about territory).
    const mode = watchedModeRef.current
    if (!showsRejection(mode, outcome)) return false
    const rejection = describeRunRejection(outcome)
    if (!rejection) return false
    settledRunIdRef.current = outcome.runId
    setRunResult({
      phase: 'rejected',
      ...(checksTerritory(mode) ? rejection : CHEAT_COPY_NEUTRAL),
    })
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
      // A finished run can leave mail behind (results, territory, rewards):
      // pick it up without waiting for a game re-open. Skipped while the Mail
      // tab is open (refresh() resets its paging); live pushes cover that case.
      if (!(menuOpen && menuTab === 'mail')) mailbox.refresh()
      if (outcome.runId !== watchedRunIdRef.current) return
      // Captured for every outcome, not just a rejection - a successful
      // (or Club War/Boss Fight) run's score numbers live on this same
      // payload, just previously never read (see RunRewardsModal.jsx).
      setRunScoreBreakdown(outcome)
      showRunOutcome(outcome)
    },
    onMail: (mail) => {
      mailbox.receiveMail(mail)
      syncCoinsFromMail(mail)
    },
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

  // --- Entering / leaving PvP ------------------------------------------------
  // ONE entry function: every way in (Play menu, section pickers, challenge
  // alerts, accepted challenges, the idle nudge, push taps) calls
  // enterPvp(source) -> rollout lock / run rules -> location permission ->
  // Visibility gate -> cloud transition -> the PvP hub. The routing itself
  // lives in utils/pvpEntry.js (unit-tested); this is the wiring.
  const portal = usePortalTransition()
  const portalActiveRef = useRef(false)
  portalActiveRef.current = portal.active
  const [pvpGate, setPvpGate] = useState(null)
  const portalCancelRef = useRef(() => {})
  portalCancelRef.current = portal.cancel
  const exitPvpRef = useRef(() => {})
  exitPvpRef.current = exitPvp
  // Lets the final step reach switchTab('race') without re-entering the gate.
  const pvpBypassRef = useRef(false)
  // Mount the sheet in place (no slide-up): the clouds are covering it.
  const pvpInstantRef = useRef(false)
  const entryCtxRef = useRef(null)
  entryCtxRef.current = {
    gameLocked,
    running: tracker.status === 'tracking',
    pvp,
    locationDenied,
    hasFix: Boolean(liveLocation),
  }
  const entryFnsRef = useRef({})
  const pvpEntryRef = useRef(null)
  if (!pvpEntryRef.current) {
    pvpEntryRef.current = createPvpEntry({
      getContext: async () => {
        const c = entryCtxRef.current
        const locationState = await getLocationState({
          knownDenied: c.locationDenied,
          hasFix: c.hasFix,
        })
        const queued = ['WAITING', 'MATCHED'].includes(c.pvp.queueEntry?.status)
        return {
          locked: c.gameLocked,
          running: c.running,
          locationState,
          // Re-read on every entry (not just the value from page load).
          discoverable: c.pvp.refreshDiscoverable(),
          hasLiveRace: c.pvp.challenges.some(isLivePvp) || queued,
        }
      },
      showGate: (variant, source) =>
        setPvpGate({ variant, source, busy: false, error: null }),
      hideGate: () => setPvpGate(null),
      turnOnVisibility: () => entryFnsRef.current.turnOnVisibility(),
      runPortal: (kind, onCovered) => portal.start(kind, onCovered),
      openPvp: () => entryFnsRef.current.openPvpNow(),
    })
  }
  entryFnsRef.current = { turnOnVisibility, openPvpNow }
  // Portal: start is read through a ref too (the controller outlives renders).
  const portalStartRef = useRef(portal.start)
  portalStartRef.current = portal.start

  function enterPvp(source) {
    if (!SHOW_PVP_ENTRY) {
      // Safe fallback for anything that still tries to open PvP (an old push,
      // a stale link): say so instead of opening a screen that isn't there.
      toast.push("PvP isn't available right now.", {
        type: 'info',
        duration: 4000,
      })
      return false
    }
    return pvpEntryRef.current.enterPvp(source)
  }

  // Same thing the Settings > Visibility row does: ask (once) to notify while
  // the app is in the background, then call the same API / state.
  async function turnOnVisibility() {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {})
    }
    const ok = await pvp.toggleDiscoverable(true)
    pvp.clearError()
    return ok
  }

  function openPvpNow() {
    pvpInstantRef.current = true
    pvpBypassRef.current = true
    switchTab('race')
    pvpBypassRef.current = false
    setMenuOpen(true)
    setRadialOpen(false)
  }

  const GATE_FAILED =
    "Couldn't turn on Visibility. Check your connection and try again."

  async function handleGateTurnOn() {
    const gate = pvpGate
    if (!gate || gate.busy) return
    setPvpGate({ ...gate, busy: true, error: null })
    if (gate.source === 'new-match') {
      // Already inside PvP (a live race): turning it on just lets them start.
      const ok = await turnOnVisibility().catch(() => false)
      if (ok) {
        setPvpGate(null)
        gate.proceed?.()
      } else {
        setPvpGate((g) => g && { ...g, busy: false, error: GATE_FAILED })
      }
      return
    }
    const r = await pvpEntryRef.current.confirmVisibility(gate.source)
    if (r.status === 'failed')
      setPvpGate((g) => g && { ...g, busy: false, error: GATE_FAILED })
    else if (r.status === 'ignored')
      setPvpGate((g) => g && { ...g, busy: false })
  }

  // "Battle" inside PvP: starting a NEW match needs Visibility + location. A
  // player with a live race is let in without these, so the gate is applied
  // here instead (same popup).
  async function requestNewMatch(proceed) {
    const c = entryCtxRef.current
    const locationState = await getLocationState({
      knownDenied: c.locationDenied,
      hasFix: c.hasFix,
    })
    const gate = resolveMatchStart({
      locationState,
      discoverable: pvp.refreshDiscoverable(),
    })
    if (!gate) {
      proceed()
      return
    }
    setPvpGate({
      variant: gate.variant,
      source: 'new-match',
      proceed,
      busy: false,
      error: null,
    })
  }

  // Leaving PvP (X / back): a search still running is cancelled, then a short
  // reverse of the cloud transition back to the map.
  function exitPvp() {
    if (pvp.queueEntry?.status === 'WAITING') pvp.leaveQueue()
    portalStartRef.current('exit', () => {
      setMenuOpen(false)
      setTabPickerOpen(false)
    })
  }
  useEffect(() => {
    if (!menuOpen) pvpInstantRef.current = false
  }, [menuOpen])

  // A race of mine just went live (the rival accepted my challenge) or the
  // queue found me a rival → take me straight to that race screen, whether
  // it came by socket push or by usePvp's polling. Not while I'm mid-run -
  // the callout pill still shows then.
  useEffect(() => {
    const a = pvp.alert
    if (!SHOW_PVP_ENTRY) return // hidden: no auto-jump to a missing screen
    if (!a?.challenge?.id) return
    if (a.kind !== 'started' && a.kind !== 'matched') return
    if (tracker.status === 'tracking') return
    // Already watching the search in the PvP tab - the panel shows
    // "Rival found!" and opens the race itself.
    if (a.kind === 'matched' && menuOpen && menuTab === 'race') return
    setPvpFocusId(a.challenge.id)
    openMenu('race', PVP_SOURCES.ALERT_AUTO)
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
  const incomingChallenge =
    SHOW_PVP_ENTRY && user?.id
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
          body: `${getDisplayName(partyOf(c, 'challenger')) || 'A runner'} wants to race you for ${c.stakeAmount} Fahhcoin.`,
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
        openMenu('race', PVP_SOURCES.CHALLENGE_ACCEPTED)
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
    const stopRefresh = visibleInterval(loadSky, 15 * 60 * 1000, 'sky-refresh')
    // Re-evaluates dawn/day/dusk/night between fetches.
    const stopTick = visibleInterval(
      () => setSkyClock(Date.now()),
      60 * 1000,
      'sky-clock'
    )
    return () => {
      cancelled = true
      controller?.abort()
      clearTimeout(giveUp)
      stopRefresh()
      stopTick()
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
  // FCM push: token registration + permission ask (never mid-run), and tap
  // routing - a cold-start tap is held until login + game load are done.
  // Foreground pushes use the in-app toast instead of an OS banner.
  const push = usePushNotifications({
    userId: isAuthed ? user?.id : null,
    gameReady,
    canPrompt:
      gameReady && tracker.status !== 'tracking' && !tracker.pendingRun,
    onRoute: (route) => {
      if (route.tab) {
        openMenu(
          route.tab,
          route.tab === 'race' ? PVP_SOURCES.PUSH_TAP : undefined
        )
      } else if (route.map) {
        setMenuOpen(false)
        setRadialOpen(false)
      }
    },
    onForeground: (text) => toast.push(text, { type: 'info', duration: 6000 }),
  })
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
        name: getDisplayName(
          {
            nickname: standingIn.ownerNickname,
            fullName: standingIn.ownerName,
          },
          'a rival'
        ),
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
  // Walking counts too: the only moving sheet is the run cycle (there is no
  // separate walk sheet), and a standing-still idle while the map turns with a
  // walker looked broken.
  // Hidden debug switch on (utils/mapDebug.js): even a slow walk plays the run
  // animation, so rotation can be tested on foot.
  const testWalk = isMapDebugEnabled()
  const RUN_ANIM_MIN_SPEED_MPS = testWalk ? 0.25 : 1.0 // a brisk walk and up
  const RUN_ANIM_MAX_ACCURACY_M = 25
  const RUN_ANIM_WINDOW_MS = 12000
  const RUN_ANIM_MIN_DISPLACEMENT_M = testWalk ? 3 : 8
  const RUN_ANIM_HOLD_MS = 3000
  const recentFixesRef = useRef([])
  const lastRunningAtRef = useRef(0)
  const [playerMoving, setPlayerMoving] = useState(false)
  // ONE shared RUN / IDLE state for a tracked run: it drives the hero's run
  // animation AND the heading-up map (utils/runView.js), so they can't disagree.
  // Outside a run the old on-screen motion check above still animates the hero.
  // Flag off: the machine never starts and the hero uses the old on-screen
  // motion check (playerMoving) in a run too, exactly as before rotation.
  const runView = useRunView(
    MAP_ROTATION_ENABLED && tracker.status === 'tracking'
  )
  const heroRunning =
    MAP_ROTATION_ENABLED && tracker.status === 'tracking'
      ? runView.mode === 'run'
      : playerMoving
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

  const [xpReward, setXpReward] = useState(null)
  // Post-run sequence bookkeeping: the run whose reward lookup has finished,
  // and the run whose rewards/image step the player already dismissed (so it
  // can never re-open for the same run).
  const [rewardsSettledRunId, setRewardsSettledRunId] = useState(null)
  const [postRunDismissedId, setPostRunDismissedId] = useState(null)
  // The rewards / run-image sequence is on screen (same rule that mounts it).
  const runRewardsOpen = shouldShowRunRewards({
    resultOpen: Boolean(runResult),
    run: completedRun,
    dismissedId: postRunDismissedId,
    settledId: rewardsSettledRunId,
    hasXp: Boolean(xpReward),
    hasScore: runScoreBreakdown?.totalScore != null,
  })
  // Popup queue: only one of these shows at a time, in this order -
  // rollout-blocking -> welcome bonus -> first-time walkthrough -> daily reward
  // (utils/popupQueue.js). None of them ever interrupts a run, the post-run
  // screens, the intro or a notice.
  const popupBase =
    tracker.status === 'tracking' ||
    Boolean(tracker.pendingRun) ||
    startCountdown != null ||
    Boolean(runResult) ||
    runRewardsOpen ||
    announcementNotices.queue.length > 0 ||
    introPlaying ||
    !gameReady
  // First-login welcome bonus: the server already granted the coins; this only
  // announces them once per account (hooks/useWelcomeBonus.js).
  const welcomeBonus = useWelcomeBonus({
    userId: isAuthed ? user?.id : null,
    blocked:
      popupBase ||
      popupBlockedBy('welcome', { rollout: rolloutStatus.showModal }),
  })
  const [idleNudgeOpen, setIdleNudgeOpen] = useState(false)
  const idleDelayRef = useRef(IDLE_NUDGE_MS)
  // Only nag when it makes sense: game on screen, nothing running or
  // waiting to submit, no menu/sheet/toast in the way.
  const canNudge =
    gameReady &&
    !tourBusyRef.current &&
    !introPlaying &&
    tracker.status !== 'tracking' &&
    !tracker.pendingRun &&
    !menuOpen &&
    !radialOpen &&
    !coinShopOpen &&
    !viewingProfile &&
    !runResult &&
    !runRewardsOpen &&
    !saveError &&
    !(pvpSession && !pvpSession.dismissed) &&
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
    openMenu('race', PVP_SOURCES.IDLE_NUDGE)
  }

  // A live event mail that moved coins: PVP_RESULT carries the new balance
  // (applied unless something newer already wrote it); REWARD only has the
  // amount, which the claim response may already have applied, so it just
  // triggers a throttled re-read instead of being added a second time.
  function syncCoinsFromMail(mail) {
    if (mail?.type === 'PVP_RESULT') {
      const n = Number(mailData(mail).newBalance)
      if (
        mailData(mail).newBalance != null &&
        Number.isFinite(n) &&
        setCoinsIfNewer(n, Date.parse(mail.createdDate), 'mail-pvp')
      )
        return
      refreshFahhcoin({ force: true })
    } else if (mail?.type === 'REWARD') {
      refreshFahhcoin({ force: true })
    }
  }

  async function refreshProfile() {
    // Independent, not Promise.all: a failing parcels call (e.g. a brand-new
    // account with none) must not keep the level/XP HUD from loading.
    // Failures leave whatever's already loaded in place - a background
    // refresh isn't worth surfacing as an error.
    // A balance the server answered while this request was in flight (a
    // claim, a pushed payout) must not be overwritten by this older read.
    const balanceSeq = coinsToken()
    const [profileResult, parcelsResult] = await Promise.allSettled([
      getTerritoryProfile(),
      findMyParcels(1, 100),
    ])
    if (parcelsResult.status === 'fulfilled') {
      setMyParcels(parcelsResult.value?.content || [])
    }
    if (profileResult.status !== 'fulfilled') {
      // Offline (or the server is down): keep showing the last known profile.
      if (userIdRef.current) {
        const cached = loadCachedProfile(userIdRef.current)
        if (cached) {
          setProfile((p) => p || cached.profile)
          setProfileCachedAt(cached.at)
          // Offline: show the last known balance rather than nothing (never
          // over a value the server already gave us this session).
          if (getCoins() == null) {
            setCoins(cached.profile?.fahhcoinBalance, 'offline-cache')
          }
        }
      }
      return null
    }
    setProfile(profileResult.value)
    setCoinsIfCurrent(
      balanceSeq,
      profileResult.value?.fahhcoinBalance,
      'profile'
    )
    setProfileCachedAt(null)
    if (userIdRef.current)
      saveCachedProfile(userIdRef.current, profileResult.value)
    return profileResult.value
  }

  // Set the moment handleContinueToShop actually sends the player out
  // (not on every Buy tap - only once they've committed), cleared the
  // first time they come back. A ref, not state: nothing here should
  // re-render anything, it only gates the one-shot refreshProfile() call
  // below.
  const pendingCoinShopReturnRef = useRef(false)

  // "After returning to the game ..., refresh the player's Fahhcoin
  // balance so the new coins show up with no restart" - the purchase
  // itself happens on the website/external browser (handleContinueToShop),
  // entirely outside this app's own control, so coming back is the only
  // moment this app can know to check again. Scoped to the
  // pendingCoinShopReturnRef flag rather than refreshing on every ordinary
  // tab-focus/app-resume, which would otherwise fire a profile fetch on
  // every single backgrounding during normal play for no reason.
  // visibilitychange covers the web (including inside an in-app browser
  // tab that isn't a full OS context switch); appStateChange is the native
  // equivalent Capacitor fires when the OS actually backgrounds/foregrounds
  // the app (e.g. returning from the system browser/Custom Tabs on
  // Android/iOS, where document.visibilityState alone isn't reliable).
  useEffect(() => {
    function maybeRefresh() {
      if (!pendingCoinShopReturnRef.current) return
      pendingCoinShopReturnRef.current = false
      refreshProfile()
    }
    function handleVisibility() {
      if (!document.hidden) maybeRefresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    let appStateHandle
    if (isNative) {
      appStateHandle = CapacitorApp.addListener('appStateChange', (state) => {
        if (state.isActive) maybeRefresh()
      })
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      appStateHandle?.then((h) => h.remove())
    }
  }, [])

  // Snapshot of level/xp taken right before a run is submitted (see
  // attemptSubmit) - compared against the fresh profile once the server has
  // actually finished processing that run (territory outcome known, or a
  // race/war run just logged) to drive the XP reward popup. Cleared after
  // use, and on a failed submit, so it never pairs with some later run.
  const runXpBeforeRef = useRef(null)
  async function refreshProfileAfterRun() {
    const runId = watchedRunIdRef.current
    const before = runXpBeforeRef.current
    runXpBeforeRef.current = null
    try {
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
    } finally {
      // The reward lookup is over (XP found or not) - the post-run sequence
      // can now fall back to the run image alone for a run with no rewards.
      setRewardsSettledRunId(runId)
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

  // Level-up: the backend grants level-gated heroes (Nova at 5) the moment
  // the level is reached, so re-read the owned list when the profile's
  // level changes - the hero then flips from level-locked to owned live,
  // no reload needed. (The first load isn't a change, so it's skipped.)
  const lastLevelRef = useRef(null)
  const profileLevel = profile?.level ?? null
  useEffect(() => {
    if (profileLevel == null) return
    const previous = lastLevelRef.current
    lastLevelRef.current = profileLevel
    if (previous != null && profileLevel > previous) refreshOwnedItems()
  }, [profileLevel])

  // Catches up on mail/News/important notices published while the app was
  // in the background or the screen was locked: the STOMP socket (see
  // useGameSocket) is suspended by the OS there and the broker doesn't
  // replay missed messages, so the only other time these load is a full game
  // open. Throttled so flicking between apps doesn't hammer the API, and
  // skipped while the Mail tab itself is open (refresh() resets its paging).
  const lastForegroundSyncRef = useRef(0)
  const foregroundSyncStateRef = useRef({})
  foregroundSyncStateRef.current = {
    isAuthed,
    mailTabOpen: menuOpen && menuTab === 'mail',
    refreshMail: mailbox.refresh,
    recheckNotices: announcementNotices.recheck,
  }
  useEffect(() => {
    function syncOnForeground() {
      const { isAuthed, mailTabOpen, refreshMail, recheckNotices } =
        foregroundSyncStateRef.current
      if (!isAuthed) return
      const now = Date.now()
      if (now - lastForegroundSyncRef.current < FOREGROUND_SYNC_MIN_GAP_MS)
        return
      lastForegroundSyncRef.current = now
      if (!mailTabOpen) refreshMail()
      recheckNotices()
    }
    function handleVisibility() {
      if (!document.hidden) syncOnForeground()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    let appStateHandle
    if (isNative) {
      appStateHandle = CapacitorApp.addListener('appStateChange', (state) => {
        if (state.isActive) syncOnForeground()
      })
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      appStateHandle?.then((h) => h.remove())
    }
  }, [])

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
    // Level comes from the Music slider through a gain node (utils/audioGraph)
    // - an <audio> element's own .volume is ignored on iOS. The element still
    // loops/plays/pauses exactly as before, it just feeds the graph.
    routeElement(audio, 'music', 1)

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
      resumeAudio()
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

    // Native shells: the WebView doesn't always fire visibilitychange when
    // the OS backgrounds the app, and audio can keep playing under the home
    // screen - so pause/resume on Capacitor's own app state too.
    let appStateHandle
    if (isNative) {
      appStateHandle = CapacitorApp.addListener('appStateChange', (state) => {
        if (state.isActive) tryPlay()
        else audio.pause()
      })
    }

    tryPlay()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      removeRetryListeners()
      document.removeEventListener('visibilitychange', handleVisibility)
      appStateHandle?.then((h) => h.remove())
    }
  }, [gameReady, musicMuted])

  // Click/tap + pop-up sounds: one global handler (utils/uiSounds.js), live
  // for as long as the game screen is up. The Sound setting is checked
  // inside playSfx, so toggling it needs no re-install.
  useEffect(() => {
    if (!gameReady) return undefined
    return installUiSounds()
  }, [gameReady])

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

  // Leaderboard: 20 rows per page (hooks/useLeaderboardPages.js). Global is
  // paged by the server; District / Country only have a `limit`, so they are
  // fetched once and sliced here. Re-opens / tab / scope switches start at
  // page 1.
  const leaderboardSource = useMemo(() => {
    if (leaderboardMode === 'individual') {
      return individualScope === 'city'
        ? {
            key: 'individual:city',
            kind: 'client',
            fetchAll: (limit) => getTopIndividualsLocal(limit),
          }
        : {
            key: 'individual:global',
            kind: 'server',
            fetchPage: findIndividualLeaderboard,
          }
    }
    return clubScope === 'national'
      ? {
          key: 'club:national',
          kind: 'client',
          fetchAll: (limit) => getTopClubsNational(limit),
        }
      : { key: 'club:global', kind: 'server', fetchPage: findClubLeaderboard }
  }, [leaderboardMode, individualScope, clubScope])
  const lb = useLeaderboardPages(leaderboardSource, {
    active: menuOpen && menuTab === 'leaderboard',
  })
  const leaderboardPager = {
    page: lb.page,
    hasPrev: lb.hasPrev,
    hasNext: lb.hasNext,
    loading: lb.loading,
    error: lb.error,
    range: rangeLabel(lb.rows, lb.page),
    onPrev: lb.prev,
    onNext: lb.next,
    onRetry: lb.retry,
  }
  // The player's own pinned row. Rank comes from the rows loaded so far (the
  // API has no "my rank"); not in any loaded page -> unknown (a dash, never a
  // made-up number).
  const myPlayerRow = lb.loadedRows.find((e) => e.userId === user?.id)
  const myClubRow = profile?.clubName
    ? lb.loadedRows.find((e) => e.clubName === profile.clubName)
    : null
  const leaderboardScopeLabel = lb.loadedRows[0]
  const leaderboardMe =
    leaderboardMode === 'individual'
      ? user
        ? {
            rank: myPlayerRow?.rank ?? null,
            name: playerNameOf(user),
            avatarSrc: resolveFileUrl(user.profilePictureUrl),
            area: (
              <span className="lb-trophy-stat">
                <IconFlag />
                {myPlayerRow
                  ? formatArea(myPlayerRow.areaSqMeters)
                  : individualScope === 'global' &&
                      profile?.totalAreaSqMeters != null
                    ? formatArea(profile.totalAreaSqMeters)
                    : '—'}
              </span>
            ),
            onClick: () =>
              setViewingProfile(
                myPlayerRow || {
                  userId: user.id,
                  fullName: user.fullName,
                  nickname: user.nickname,
                }
              ),
          }
        : null
      : profile?.clubName
        ? {
            rank: myClubRow?.rank ?? null,
            name: profile.clubName,
            badge: <ClubBadge name={profile.clubName} size={40} />,
            area: (
              <span className="lb-trophy-stat">
                <ClubTrophyIcon size={26} />
                {myClubRow ? formatCoins(myClubRow.trophies ?? 0) : '—'}
              </span>
            ),
            onClick: () => {
              if (myClubRow) setOpenClubId(myClubRow.clubId)
              switchTab('club')
            },
          }
        : null
  // New page -> back to the top (the menu sheet is the scroller).
  useEffect(() => {
    menuSheetRef.current?.scrollTo?.({ top: 0 })
  }, [lb.page, leaderboardSource.key])
  // Mode / scope switches just change the source; the hook resets to page 1.
  const switchLeaderboardMode = setLeaderboardMode
  const switchIndividualScope = setIndividualScope
  const switchClubScope = setClubScope

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
      setOwnedLoaded(true)
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
      writeCachedHeroes(details)
    } catch {
      // Keep showing the cached roster (if any) when a refresh fails.
      setHeroes((prev) => prev)
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
    // Anything that may have paid coins: re-read the common balance.
    if (item.type === 'REWARD') refreshFahhcoin({ force: true })
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
    setCountdownVs({
      opponent: mySide(challenge, user?.id).opponentName || 'your rival',
      pot: Number(challenge.stakeAmount) * 2,
    })
    beginCountdownThenStart(() =>
      tracker.start(null, { challengeId: challenge.id })
    )
  }

  function openMenu(tab, source) {
    // PvP is entered through the one gate (see enterPvp).
    if (tab === 'race') {
      enterPvp(source || PVP_SOURCES.PLAY_MENU)
      return
    }
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
    setCoinShopOpen(true)
    if (coinBundles.length === 0) loadCoinBundles()
  }

  // A Buy tap no longer starts the purchase itself - it opens a
  // confirmation popup first (the brief's own "don't start the purchase
  // directly"), which on Continue hands off to the website's /shop page
  // instead (handleContinueToShop below). Payment itself happens there,
  // never inside the game.
  function openBuyRedirectConfirm(bundle) {
    setBuyRedirectError(null)
    setBuyRedirectBundle(bundle)
  }

  function closeBuyRedirectConfirm() {
    if (buyRedirecting) return
    setBuyRedirectBundle(null)
  }

  // Routes the purchase itself to the public website's /shop page (same
  // app, different route - see utils/siteUrl.js) instead of redirecting
  // the game's own window/WebView straight to a payment URL, the way this
  // used to work (see git history - initiateCoinPurchase/paymentUrl). Two
  // reasons: a new tab/external browser never tears down the running
  // game's own state (map, live GPS watch, an in-progress run) the way
  // window.location.href = paymentUrl used to, and keeping actual payment
  // for a virtual currency out of the native WebView sidesteps Apple's App
  // Store guideline 3.1.1 risk entirely on iOS (still gated by
  // iosShopRedirectBlocked, i.e. VITE_IOS_EXTERNAL_SHOP, as a second layer).
  // buyRedirecting is the brief's own "double-tap guard" - set synchronously
  // before the (possibly async, on native) Browser.open/window.open call,
  // so a second tap before either resolves can't open a second tab/popup.
  async function handleContinueToShop() {
    if (!buyRedirectBundle || buyRedirecting) return
    setBuyRedirecting(true)
    setBuyRedirectError(null)
    try {
      await openShopPack(buyRedirectBundle.fahhcoinAmount)
      pendingCoinShopReturnRef.current = true
      setBuyRedirectBundle(null)
    } catch {
      setBuyRedirectError('Could not open the shop - please try again.')
    } finally {
      setBuyRedirecting(false)
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
  // `scroll` is only for the Prev/Next/jump buttons (a user action that
  // lands on the list). Reopening the Me tab must NOT scroll: it used to
  // scrollIntoView the History section every time, so Me opened scrolled
  // down past the profile/XP/hero.
  async function goToMyRunsPage(pageNumber, { scroll = true } = {}) {
    const result = await loadMyRunsPage(pageNumber)
    // Only if the player is still on Me: the page load can outlive a tab
    // switch, and the stale scroll would then fire when Me is reopened.
    if (scroll && menuTabRef.current === 'me') {
      myRunsListRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
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
    if (gameLocked) return
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
      const { points, snapped, disabled } = await snapSegment(previous, point)
      setRouteDraftWaypoints((prev) => [...prev, point])
      setRouteDraftSegments((prev) => [...prev, points])
      if (!snapped && !disabled) {
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
    // Section pickers that list PvP route through the same entry function.
    if (nextTab === 'race' && !pvpBypassRef.current) {
      enterPvp(PVP_SOURCES.SECTION_MENU)
      return
    }
    // Heroes now live inside the Shop tab.
    const tab = nextTab === 'heroes' ? 'shop' : nextTab
    setMenuTab(tab)
    // loadStore also loads the heroes, plus owned items for their badges.
    if (tab === 'shop' && storeCatalog.length === 0) loadStore()
    // Club Wars' hero lock-in needs owned heroes + the catalog for names.
    if (tab === 'club' && storeCatalog.length === 0) loadStore()
    // Me tab's Medals grid needs the MEDAL catalog + owned items too.
    if (tab === 'me' && storeCatalog.length === 0) loadStore()
    // Always back to page 1 on reopening the tab - cheap when it's
    // already cached (no fetch, no flash), a real fetch otherwise.
    if (tab === 'me') goToMyRunsPage(1, { scroll: false })
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
  // useRunTracker's isTraining comment), just with Pause/Resume available on
  // the run panel. Tapped straight from the Play menu (no panel in between,
  // like Conquer): the 3-2-1-GO countdown, then the run. A run already in
  // progress (or one waiting to be saved) is left alone - the Play menu
  // isn't offered then anyway. If location is blocked/unsupported the
  // countdown is skipped and tracker.start() surfaces the existing GPS
  // prompt right away instead of counting down to a run that can't start.
  async function handleStartTraining() {
    setMenuOpen(false)
    if (gameLocked) return
    if (tracker.status === 'tracking' || pendingRun) return
    let blocked = !('geolocation' in navigator)
    if (!blocked) {
      try {
        const perm = await navigator.permissions?.query({
          name: 'geolocation',
        })
        blocked = perm?.state === 'denied'
      } catch {
        // Permissions API missing/unsupported - fall through to the countdown.
      }
    }
    if (blocked) {
      resetForRunStart()
      tracker.start(null, { isTraining: true })
      return
    }
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
    tracker.clearRunIssue() // a deliberate discard is not a GPS problem
  }

  // A run that ended with nothing measured because of the phone's GPS (no
  // fix, or mostly imprecise ones): explain it neutrally instead of ending
  // in silence.
  useEffect(() => {
    if (!tracker.runIssue) return
    setSaveError({
      title: tracker.runIssue.title,
      message: tracker.runIssue.message,
    })
    tracker.clearRunIssue()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the issue only
  }, [tracker.runIssue])

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

  // Dev/e2e only (stripped from production builds): lets the screenshot spec
  // put the popup into its loading / error states, which no live code path
  // reaches today (the card is built from parcels already on the map).
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    window.__setTerritoryPopupStatus = (status) =>
      setHighlightedEntry((e) => (e ? { ...e, status } : e))
    return () => delete window.__setTerritoryPopupStatus
  }, [])

  // Tapping a claimed parcel directly on the map is a stronger signal than
  // tapping a leaderboard row (the player already has it in view), so this
  // skips the "view on map?" confirm dialog and goes straight to the same
  // highlight/focus toast the leaderboard flow produces.
  function handleParcelClick(parcel) {
    // Territory taps are resolved by point in TerritoryMap's
    // TerritoryHitLayer (innermost territory under the tap wins; tap the same
    // spot again to go outward). While drawing a route that layer stays out
    // of the way and the tap just plants a point (DrawClickCatcher) - routes
    // aren't claims, so one may cross someone else's territory. This guard
    // is a second safety net for the "whose ground is this" popup.
    if (routeDraftMode) return
    const isMine = Boolean(user?.id) && parcel.ownerId === user.id
    // Avatar: the owner's real uploaded profile picture, never a cosmetic
    // (equipped Hero skin, map marker art, etc.). Own territory: the logged-
    // in user's photo. Someone else's: the parcel's ownerProfilePictureUrl
    // (the backend's TerritoryParcelResponse doesn't send it yet - see
    // toDisplayParcel), else a picture already known from a loaded
    // leaderboard list, else null -> the colored initial.
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
      nickname: parcel.ownerNickname,
      areaSqMeters: parcel.area,
      avatarSrc:
        resolveFileUrl(
          isMine
            ? user?.profilePictureUrl
            : parcel.ownerProfilePictureUrl ||
                lb.loadedRows.find((e) => e.userId === parcel.ownerId)
                  ?.profilePictureUrl
        ) || null,
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

  function closeTerritoryPopup() {
    setHighlightedEntry(null)
    setTerritoryRunWarning(null)
  }

  // A loop longer than this is a long run to commit to by accident - the
  // spec's own "over 10 km" example.
  const TERRITORY_RUN_WARN_MAX_METERS = 10000
  // A loop this short isn't really worth a turn-by-turn guide (likely a
  // sliver/edge case parcel) - warn rather than silently guide something
  // this trivial.
  const TERRITORY_RUN_WARN_MIN_METERS = 40

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
      nickname: user?.nickname,
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

  // Everything the player sees after a run was accepted by the server: the
  // result card (territory check / "Run saved!" / war points), then XP rewards.
  // Shared by a normal Submit and by an offline run that just finished
  // uploading (fromQueue: that one must not touch the draft/saving state of
  // whatever else is on screen).
  function presentSubmittedRun(run, created, submittedAt, { fromQueue }) {
    // The History list's every page shifts by one with a new run saved -
    // next time the Me tab is open, it re-fetches from page 1 instead of
    // showing the now-stale cache.
    scheduleDailyNudge()
    resetMyRunsPagination()
    if (run.challengeId) pvp.refreshChallenges()
    const isRace = Boolean(run.challengeId)
    if (isRace) {
      // PvP has its own popup (PvpResultPopup): no territory/"Run submitted"
      // card, no generic reward modal. It follows the race to its result.
      const known = pvp.challenges.find((c) => c.id === run.challengeId)
      const prev = pvpSessionRef.current
      const next = {
        userId: user?.id ?? null,
        challengeId: run.challengeId,
        runId: created.id,
        opponentName:
          prev?.opponentName ||
          (known ? mySide(known, user?.id).opponentName : null),
        balanceBefore: prev?.balanceBefore ?? fahhcoin ?? null,
        run: {
          distance: run.distance,
          duration: run.duration,
          avgPace: created.avgPace,
        },
        status: 'submitted',
        dismissed: Boolean(prev?.dismissed),
      }
      setPvpSession(next)
      savePvpSession(next)
      if (!fromQueue) {
        discardDraft()
        setSaving(false)
      }
      return
    }
    const isWar = Boolean(run.clubWarId)
    // Watched from here, not just inside pollForTerritoryResult below -
    // a Club War/Boss Fight run also gets a score push (just never a
    // territory-event poll), so this needs to be set for every mode, not
    // only the territory-capture one.
    watchedRunIdRef.current = created.id
    watchedModeRef.current = postRunModeOf(run)
    settledRunIdRef.current = null
    setCompletedRun({
      id: created.id,
      isRace,
      isWar,
      isTraining: Boolean(run.isTraining),
      points: run.points,
      distance: run.distance,
      duration: run.duration,
      avgPace: created.avgPace,
      startedAt: run.startedAt,
    })
    if (!fromQueue) {
      discardDraft()
      setSaving(false)
    }
    // Territory is only ever evaluated for a plain Conquer run. A PvP
    // race, Club War entry or Training run skips the territory poll
    // entirely instead of showing "Checking your territory…" for a check
    // that was never going to happen (Training: "Run saved!").
    if (!checksTerritory(postRunModeOf(run))) {
      setRunResult({ phase: 'submitted' })
      // Club War/Boss Fight runs DO get a score push (pace + base effort
      // only, no territory - see TerritoryProcessingServiceImpl); a PvP
      // race never does (scored entirely separately), so this just finds
      // nothing and runScoreBreakdown stays null for that mode, same as
      // ever - RunRewardsModal already renders nothing score-related in
      // that case.
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
  }

  // Offline (or the upload could not reach the server): the run goes to the
  // outbox - the durable, per-account queue - and the player gets the "Run
  // saved" popup. Nothing is lost and nothing is submitted twice.
  async function queueRunForUpload(run) {
    if (!user?.id) return
    const payload = buildRunPayload(run)
    const record = await enqueueRun({
      clientRunId: payload.clientRunId,
      userId: user.id,
      payload,
      summary: buildRunSummary(run),
      meta: buildRunMeta({ heroId: activeHeroId ?? null }),
    })
    tracker.clearPendingRun()
    setSaving(false)
    setSaveError(null)
    if (run.challengeId) {
      // PvP needs a connection for its result: say so in the PvP popup (the
      // run itself is safe in the outbox and uploads by itself).
      setPvpSession((s) => ({
        ...(s || {
          userId: user.id,
          challengeId: run.challengeId,
          runId: null,
          opponentName: null,
          balanceBefore: fahhcoin ?? null,
          run: { distance: run.distance, duration: run.duration },
        }),
        status: 'offline',
      }))
      return
    }
    setOfflineSavedRun(record)
  }

  // An outbox run was accepted by the server (it uploaded in the background).
  function handleSyncedRun(record, created) {
    toast.push('Your offline run was submitted', {
      type: 'success',
      duration: 4500,
    })
    resetMyRunsPagination()
    if (tracker.status === 'tracking') {
      // Mid-run: just refresh the numbers, no popups over the run.
      refreshProfile()
      return
    }
    runXpBeforeRef.current = profile
      ? { level: profile.level, xp: profile.xp }
      : null
    presentSubmittedRun(
      {
        points: record.payload.points,
        distance: record.payload.distance,
        duration: record.payload.duration,
        startedAt: record.summary.startedAt,
        challengeId: record.payload.challengeId,
        clubWarId: record.payload.clubWarId,
        isTraining: record.summary.isTraining,
      },
      created,
      new Date(),
      { fromQueue: true }
    )
  }

  async function attemptSubmit(pendingRun) {
    // Lost to the phone's GPS (not the player): say so, neutrally, with a
    // way to try again - never the "warm-up" or any fraud wording.
    const gpsIssue =
      pendingRun.distance < MIN_VALID_RUN_DISTANCE_METERS
        ? describeGpsShortfall(pendingRun)
        : null
    if (gpsIssue) {
      setSaveError({ title: gpsIssue.title, message: gpsIssue.message })
      return
    }
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
    const isPvpRun = Boolean(pendingRun.challengeId)
    if (isPvpRun) {
      // One submit at a time (auto-finish and the draft effect can both
      // fire); the popup shows "Calculating..." straight away.
      if (pvpSubmitInFlightRef.current) return
      pvpSubmitInFlightRef.current = true
      const known = pvp.challenges.find((c) => c.id === pendingRun.challengeId)
      setPvpSession({
        userId: user?.id ?? null,
        challengeId: pendingRun.challengeId,
        runId: null,
        opponentName: known ? mySide(known, user?.id).opponentName : null,
        balanceBefore: fahhcoin ?? null,
        run: { distance: pendingRun.distance, duration: pendingRun.duration },
        status: 'submitting',
        dismissed: false,
      })
    }
    setSaving(true)
    setSaveError(null)
    setRunScoreBreakdown(null)
    const submittedAt = new Date()
    runXpBeforeRef.current = profile
      ? { level: profile.level, xp: profile.xp }
      : null
    try {
      // clientRunId is stable per recorded run (created at run start and
      // persisted with it), so a retry after a lost response - or after the
      // app was closed - returns the run the server already created instead of
      // counting it twice. The backend scopes this id per user.
      const created = await createRun(buildRunPayload(pendingRun))
      presentSubmittedRun(pendingRun, created, submittedAt, {
        fromQueue: false,
      })
    } catch (err) {
      runXpBeforeRef.current = null
      // No connection: not a failure - the run goes to the outbox and uploads
      // by itself when the connection is back.
      if (isNetworkError(err) && user?.id) {
        await queueRunForUpload(pendingRun)
        return
      }
      if (isPvpRun) {
        // The popup shows the error + "Try again"; the run stays saved.
        setPvpSession((s) =>
          s
            ? {
                ...s,
                status: 'error',
                error:
                  err instanceof ApiError
                    ? err.message
                    : 'Could not reach the server.',
              }
            : s
        )
        setSaving(false)
        return
      }
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
    } finally {
      pvpSubmitInFlightRef.current = false
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
      applyDelta(-(item.priceFahhcoin || 0), 'shop-purchase')
      refreshFahhcoin({ force: true })
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

  // Esc closes the Buy-redirect confirmation, same as its own X or
  // backdrop (closeBuyRedirectConfirm already no-ops while redirecting).
  useEffect(() => {
    if (!buyRedirectBundle) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeBuyRedirectConfirm()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyRedirectBundle, buyRedirecting])

  // useCallback (empty deps - every function this touches, including
  // loadStore/loadHeroes, only closes over stable setState setters and
  // imported API calls, never per-render state, so there's nothing to go
  // stale) so ColorShelf below can actually be React.memo'd - passing a
  // plain function here would hand it a new prop identity every render
  // and defeat that memo regardless of how stable its other props are.
  const handleEquip = useCallback(async (item, isEquipped, opts = {}) => {
    setStoreActionError(null)
    try {
      // Free items are owned by rule (utils/itemState.js) but the backend
      // only equips items with a row: claim any missing ones first
      // (`claim` is true, or a list of extra items such as the emote's hero).
      const toClaim = opts.claim === true ? [item] : opts.claim || []
      for (const c of toClaim) await claimFreeItem(c.id)
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
  // The hero-detail response's `skins` leave out `unlockLevel` (the store
  // catalog's items carry it), so copy it across by store item id - that is
  // what level-locks Nova until level 5 (utils/itemState.js).
  const unlockLevelByItemId = useMemo(() => {
    const map = new Map()
    storeCatalog.forEach((i) => {
      if (i.unlockLevel != null) map.set(i.id, i.unlockLevel)
    })
    return map
  }, [storeCatalog])
  const heroesWithLevels = useMemo(
    () =>
      unlockLevelByItemId.size === 0
        ? heroes
        : heroes.map((h) => ({
            ...h,
            skins: (h.skins || []).map((s) =>
              s.unlockLevel == null && unlockLevelByItemId.has(s.id)
                ? { ...s, unlockLevel: unlockLevelByItemId.get(s.id) }
                : s
            ),
          })),
    [heroes, unlockLevelByItemId]
  )
  const galleryHeroes = useMemo(
    () => heroesWithLevels.filter((h) => !isPlaceholderHero(h.name)),
    [heroesWithLevels]
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
  // Stable handlers (all setters), so the memoized Shop components
  // (HeroGallery/ColorShelf) can skip the re-renders GamePage gets from the
  // GPS watch - inline arrows here defeated their React.memo every tick.
  const handleSelectGalleryHero = useCallback((hero) => {
    setStoreActionError(null)
    setSelectedHeroId(hero.id)
  }, [])
  const handleSelectTerritoryColor = useCallback((item) => {
    setPurchaseError(null)
    setStoreActionError(null)
    setColorPreview({ id: item.id, kind: 'territory' })
  }, [])
  const handleSelectTrailColor = useCallback((item) => {
    setPurchaseError(null)
    setStoreActionError(null)
    setColorPreview({ id: item.id, kind: 'trail' })
  }, [])
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
  // Clean accounts have no hero record server-side while the UI shows Comet
  // as the default: load the store once up front and silently record Comet
  // as owned + equipped (see hooks/useDefaultHeroBootstrap.js).
  useEffect(() => {
    if (user && !ownedLoaded) loadStore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ownedLoaded])
  useDefaultHeroBootstrap({
    enabled: ownedLoaded && !heroesLoading,
    heroes,
    ownedItems,
    onDone: loadStore,
  })
  // Every tab shares one scroll container, so a tab opened after scrolling
  // another (or reopened later) inherited its scrollTop. Always start at
  // the top when the menu opens or the tab changes.
  useLayoutEffect(() => {
    menuTabRef.current = menuOpen ? menuTab : null
    if (menuSheetRef.current) menuSheetRef.current.scrollTop = 0
  }, [menuOpen, menuTab])
  const selectedHero = selectedHeroId
    ? heroesWithLevels.find((h) => h.id === selectedHeroId) || null
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
    pendingRun && pendingRun.points.length >= 2 && isLoopOpen(pendingRun.points)

  const allMenuTabs = [
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
    { id: 'settings', label: 'Settings', Icon: IconSettings, tone: 'stone' },
  ]
  // The PvP tab only exists while SHOW_PVP_ENTRY is on.
  const menuTabs = allMenuTabs.filter((t) => SHOW_PVP_ENTRY || t.id !== 'race')
  const activeMenuTab = menuTabs.find((t) => t.id === menuTab) || menuTabs[0]
  const switcherTabs = menuTabs
  // Collapsed picker shows one dot summing what's waiting on other tabs.
  const otherTabsBadgeCount = pickerBadgeCount({
    menuTab,
    pvpCount: SHOW_PVP_ENTRY ? pvp.actionCount : 0,
    mailCount: mailbox.unreadCount,
    showPvpInDropdown: SHOW_PVP_IN_DROPDOWN,
  })
  // The drop-down list (phones). PvP is not a row in it while
  // SHOW_PVP_IN_DROPDOWN is off - it lives in the round Play menu. (The
  // desktop tab row above keeps `switcherTabs`, and the PvP screen's own
  // static header still uses menuTabs/activeMenuTab.)
  const dropdownTabs = pickerTabs(menuTabs, SHOW_PVP_IN_DROPDOWN)

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
    ? mySide(raceChallenge, user?.id).opponentName
    : ''

  // Detail tiles under the run card's main row when it's expanded - only
  // values the run already tracks/shows elsewhere (the loop sheet's area +
  // perimeter, the PvP/club-war HUD's race/opponent/to-go), no new data.
  const runDetailTiles = []
  if (tracker.status === 'tracking') {
    runDetailTiles.push({
      label: 'Elapsed',
      value: formatDuration(tracker.elapsedSeconds),
    })
    if (tracker.isTraining) {
      runDetailTiles.push({
        label: 'Paused',
        value: formatDuration(
          Math.max(0, tracker.elapsedSeconds - tracker.movingSeconds)
        ),
      })
    } else if (raceChallenge) {
      runDetailTiles.push(
        { label: 'Race', value: raceModeLabel },
        { label: 'Opponent', value: raceOpponentName },
        {
          label: 'To go',
          value: formatMeters(
            Math.max(0, raceChallenge.distanceMeters - tracker.distance)
          ),
        },
        {
          label: 'Progress',
          value: `${Math.min(100, Math.round(raceProgress * 100))}%`,
        }
      )
    } else if (tracker.clubWarId) {
      if (activeWarRun?.id === tracker.clubWarId && activeWarRun.theirName) {
        runDetailTiles.push({
          label: 'Club war',
          value: `${activeWarRun.ourName} vs ${activeWarRun.theirName}`,
        })
      }
      runDetailTiles.push({
        label: 'Squad meters',
        value: formatMeters(tracker.distance),
      })
    } else {
      runDetailTiles.push(
        {
          label: 'Loop area',
          value: formatArea(polygonAreaSqMeters(tracker.path)),
        },
        {
          label: 'Perimeter',
          value: formatMeters(loopPerimeterMeters(tracker.path)),
        }
      )
    }
  }

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
  const currentMapStyle = getMapStyleById(mapStyleId) || MAP_STYLES[0]
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
  // The HUD hero (map marker) plays the equipped emote too. Same selector as
  // above but WITHOUT ignoreHidden (a hidden emote falls back to idle here),
  // and Classic/emote1 (the idle alias) or an emote with no local art also
  // mean "keep the idle sprite exactly as it is".
  const hudEmoteAsset = useMemo(() => {
    if (!animatedMarkerHero) return null
    const item = resolveEquippedEmoteItem(
      ownedItems.filter((o) => o.equipped).map((o) => o.storeItem),
      activeHeroId,
      activeHeroName
    )
    if (!item) return null
    const asset = resolveEmoteAsset(activeHeroName, item.name)
    if (!asset || asset === getHeroManifest(animatedMarkerHero).poses?.idle)
      return null
    return asset
  }, [ownedItems, activeHeroId, activeHeroName, animatedMarkerHero])
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

  // ---- First-time walkthrough (utils/tour.js has the rules) -------------
  const tourWait = tourWaitReason({
    gameReady,
    introPlaying,
    running: tracker.status === 'tracking' || startCountdown != null,
    rolloutPopup: rolloutStatus.showModal,
    welcome: welcomeBonus.holdsQueue,
    broadcast: announcementNotices.queue.length > 0,
    challenge: Boolean(incomingChallenge),
    nudge: idleNudgeOpen,
    modalOpen: Boolean(
      coinShopOpen ||
      viewingProfile ||
      viewingRun ||
      viewingRoute ||
      runResult ||
      saveError ||
      legalDoc ||
      pendingRun ||
      completedRun ||
      confirmAction ||
      (pvpSession && !pvpSession.dismissed) ||
      pvpGate ||
      weatherHype ||
      storeChoice ||
      avatarChoice ||
      routeNamePromptOpen ||
      xpReward ||
      tracker.status === 'permission-denied' ||
      backButton.exitConfirmOpen
    ),
    menuOpen,
  })
  const tour = useGameTour({
    userId: isAuthed ? (user?.id ?? null) : null,
    user,
    profile,
    parcelCount: myParcels.length,
    locked: gameLocked,
    wait: tourWait,
    running: tracker.status === 'tracking',
  })
  tourBusyRef.current = tour.active || tour.pending
  // Daily reward (7-day streak, server-authoritative - see
  // hooks/useDailyReward.js). Last in the popup queue: waits for the rollout
  // popup, the welcome bonus and the walkthrough; claim refreshes balance/XP.
  const dailyReward = useDailyReward({
    userId: isAuthed ? user?.id : null,
    blocked:
      popupBase ||
      popupBlockedBy('daily', {
        rollout: rolloutStatus.showModal,
        welcome: welcomeBonus.holdsQueue,
        tour: tour.active || tour.pending,
      }),
    onClaimed: (result) => {
      // The server's own answer is the balance; a response without one (older
      // backend) triggers a re-read instead of guessing.
      if (!setCoins(result.balance, 'daily-claim'))
        refreshFahhcoin({ force: true })
      const g = result.granted
      setProfile((p) =>
        p ? { ...p, xp: result.xp ?? p.xp, level: result.level ?? p.level } : p
      )
      // XP / items change more than the number: only then re-read the profile.
      if ((g?.xp || 0) > 0 || g?.item) refreshProfile()
    },
  })
  // The welcome bonus was credited at signup: its popup shows the real number.
  const welcomeOpen = welcomeBonus.visible
  useEffect(() => {
    if (welcomeOpen) refreshFahhcoin()
  }, [welcomeOpen])
  // The claim popup shows the balance too: re-read it as it opens.
  const dailyRewardOpen = dailyReward.state.open
  useEffect(() => {
    if (dailyRewardOpen) refreshFahhcoin()
  }, [dailyRewardOpen])
  tourBackRef.current = {
    active: tour.active && !tour.paused,
    close: tour.index > 0 ? tour.back : tour.skip,
  }
  // The tour drives the Play menu (its targets only exist while it is open).
  const tourRadial = tour.step?.radial
  const tourActive = tour.active
  useEffect(() => {
    if (!tourActive) return undefined
    setRadialMode('main')
    setRadialOpen(tourRadial === 'main')
    return () => setRadialOpen(false)
  }, [tourActive, tourRadial])

  function startTrainingFromTour() {
    tour.finish()
    setRadialOpen(false)
    handleStartTraining()
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
      className={`game-page game-root${gameLocked ? ' is-rollout-locked' : ''}${radialOpen ? ' is-radial-open' : ''}`}
      style={{ '--sheet-h': `${controlsHeight}px` }}
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
          hasFix={Boolean(liveLocation)}
          snapToPlayer={!gameReady || introPlaying}
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
          heroEmoteAsset={hudEmoteAsset}
          heroEmotePaused={menuOpen || !gameReady || introPlaying}
          playerMoving={heroRunning}
          runView={runView.mode}
          movingSlowly={runView.slow}
          isFollowing={isFollowing}
          isTracking={tracker.status === 'tracking'}
          onUserPan={handleUserPan}
          onRequestFollow={() => setMapMode('follow')}
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
            onClick={cancelCountdown}
            role="button"
            aria-label="Cancel countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {countdownVs && (
              <div className="pvp-countdown-vs">
                <span className="pvp-countdown-vs-names">
                  <span>You</span>
                  <span className="pvp-countdown-vs-badge">VS</span>
                  <span>{countdownVs.opponent}</span>
                </span>
                {countdownVs.pot > 0 && (
                  <span className="pvp-countdown-vs-pot">
                    {countdownVs.pot} Fahhcoin to the winner
                  </span>
                )}
              </div>
            )}
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
            <span className="game-countdown-hint">Tap to cancel</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent while outside a rolled-out area (not dismissible); the
          grey tint sits over the map only - pointer-events: none, so the map
          can still be panned. */}
      {gameReady && gameLocked && (
        <>
          <div className="game-rollout-tint" aria-hidden="true" />
          <div className="game-rollout-banner" role="status">
            <strong>Territory not rolled out here</strong>
            <span>Run Conquest isn&rsquo;t live in your area yet.</span>
          </div>
        </>
      )}
      {gameReady && !gameLocked && locationDenied && (
        <div className="game-rollout-banner is-denied" role="status">
          <strong>Location is off</strong>
          <span>Enable location for Run Conquest to find your area.</span>
        </div>
      )}

      {gameReady && !introPlaying && rolloutStatus.showModal && (
        <RolloutRequestModal onDismiss={rolloutStatus.dismiss} />
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
          <CoinAmount
            className="game-hud-value"
            value={pvpHudCoins ?? fahhcoin ?? 0}
          />
          <span className="game-hud-icon game-hud-icon-coin" />
        </button>
      </div>
      {dailyReward.available && (
        <DailyHudChest
          dr={dailyReward}
          onOpen={offline ? needsInternet : dailyReward.open}
        />
      )}

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
          <div className="pvp-race-hud-line">
            {raceProgress >= 1 ? <IconFlagCheckered /> : <IconBolt />}
            <span>
              {raceProgress >= 1
                ? `${raceModeLabel} done! Submitting your race…`
                : `Race vs ${raceOpponentName} · ${formatMeters(
                    Math.max(0, raceChallenge.distanceMeters - tracker.distance)
                  )} to go`}
            </span>
          </div>
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
        {SHOW_PVP_ENTRY && pvp.alert && PVP_ALERT_COPY[pvp.alert.kind] && (
          <motion.button
            type="button"
            key={`pvp-${pvp.alert.kind}-${pvp.alert.challenge?.id || ''}`}
            className="game-weather-hype game-pvp-alert"
            onClick={() => {
              pvp.clearAlert()
              openMenu('race', PVP_SOURCES.ALERT_PILL)
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

      {tour.active && (
        <GameTour
          step={tour.step}
          index={tour.index}
          count={tour.steps.length}
          paused={tour.paused}
          canStartTraining={!gameLocked}
          speaker={<HeroSprite size={72} hero={activeHeroName} />}
          onNext={tour.next}
          onBack={tour.back}
          onSkip={tour.skip}
          onMissing={tour.skipMissing}
          onStartTraining={startTrainingFromTour}
        />
      )}

      {legalDoc && (
        <GameLegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
      )}
      <ConnectionBanner enabled={gameReady && !introPlaying} />
      <OfflineRunSavedModal
        run={offlineSavedRun}
        onClose={() => setOfflineSavedRun(null)}
      />
      <GameModal
        open={logoutWarn}
        onClose={() => setLogoutWarn(false)}
        tone="warning"
        title="Runs not uploaded yet"
        overlayClassName="game-end-run-overlay"
      >
        <p className="game-end-run-summary">
          {pendingCount(runSync.runs)} run(s) are still waiting to upload. They
          stay safely on this phone and upload the next time you sign in to this
          account with internet.
        </p>
        <GameActions>
          <GameButton onClick={() => setLogoutWarn(false)}>
            Stay signed in
          </GameButton>
          <GameButton variant="danger" onClick={() => handleLogout(true)}>
            Sign out anyway
          </GameButton>
        </GameActions>
      </GameModal>
      <AnimatePresence>
        <WelcomeBonusModal
          key="welcome-bonus"
          open={welcomeBonus.visible}
          amount={welcomeBonus.amount}
          name={playerNameOf(user)}
          ack={welcomeBonus.state.ack}
          error={welcomeBonus.state.error}
          onContinue={welcomeBonus.acknowledge}
          onDismiss={welcomeBonus.dismiss}
        />
        <DailyRewardModal
          key="daily-reward"
          open={dailyReward.state.open}
          onClose={dailyReward.close}
          state={dailyReward.state}
          balance={fahhcoin ?? 0}
          onClaim={dailyReward.claim}
          onRetry={dailyReward.retry}
          onSkipAnim={dailyReward.skipAnim}
          onAnimDone={dailyReward.animDone}
        />
        {announcementNotices.queue.length > 0 && (
          <BroadcastPrompt
            notices={announcementNotices.queue}
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
            showBattle={SHOW_PVP_ENTRY}
            onDismiss={dismissIdleNudge}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {territoryEntryBanner && (
          <motion.div
            key={territoryEntryBanner.name}
            className="game-popup-layer is-top"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* The layer owns the centring; the banner only animates its own
                y/scale, so framer-motion's inline transform can no longer
                overwrite a CSS translateX(-50%) and shove it off-centre. */}
            <motion.div
              className="game-territory-entry-banner"
              initial={{ y: -40, scale: 0.85 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -24, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              <span className="game-territory-entry-banner-flag">🚩</span>
              <span className="game-territory-entry-banner-text">
                Entering <strong>{territoryEntryBanner.name}</strong>
                &apos;s territory!
              </span>
            </motion.div>
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
                  const locked = gameLocked && ROLLOUT_LOCKED_TABS.has(item.tab)
                  const offlineLocked =
                    offline && OFFLINE_BLOCKED_TABS.has(item.tab)
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
                        className={`game-radial-btn radial-${item.tone}${locked ? ' is-locked' : ''}${offlineLocked ? ' is-offline-locked' : ''}`}
                        disabled={locked}
                        aria-disabled={offlineLocked || undefined}
                        onClick={() => {
                          if (offlineLocked) {
                            needsInternet()
                            return
                          }
                          if (item.tab === 'play') {
                            setRadialMode('play')
                            return
                          }
                          if (item.tab === 'conquer') {
                            setRadialOpen(false)
                            handleStartRun()
                            return
                          }
                          if (item.tab === 'training') {
                            setRadialOpen(false)
                            handleStartTraining()
                            return
                          }
                          openMenu(item.tab)
                        }}
                        aria-label={item.label}
                        title={item.label}
                        data-label={
                          SHOW_ICON_LABELS && item.showLabel !== false
                            ? item.label
                            : undefined
                        }
                        data-tour={`radial-${item.tab}`}
                      >
                        <item.Icon />
                        {offlineLocked && (
                          <span
                            className="game-offline-lock-badge"
                            aria-hidden="true"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14">
                              <path
                                d="M6.5 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.4 8.4 4.6 4.6 0 0 1 17.5 19H6.5Z"
                                fill="currentColor"
                              />
                              <path
                                d="M3 3l18 18"
                                stroke="#0a0e28"
                                strokeWidth="3"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                        )}
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
            {dailyReward.dot && !radialOpen && (
              <span
                className="game-menu-btn-dot"
                data-testid="daily-reward-dot"
                aria-hidden="true"
              />
            )}
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

      {/* Vehicle detection: warning banner with countdown while tracking,
          then the "Run discarded" card (see useRunTracker.js). */}
      <VehicleAlert
        vehicleState={tracker.vehicleState}
        warningDeadline={tracker.vehicleWarningDeadline}
        discarded={tracker.vehicleDiscarded}
        onDismissDiscard={tracker.dismissVehicleDiscarded}
      />

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
          data-label={
            SHOW_ICON_LABELS
              ? mapMode === 'follow'
                ? 'Following'
                : 'Follow'
              : undefined
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
            {/* In-run status card, styled after the iOS Live Activity: brand
                row (runner icon + "Run Conquest") with the mode pill on the
                right, then Time on the left and Distance/Pace on the right.
                The top row is still the statsOnly expand/collapse toggle.
                "Paused" only ever shows for a Training run (see
                useRunTracker's pause()). Pace/Time read off movingSeconds,
                not elapsedSeconds, so a Training run's pace stays honest
                while paused. Same tracker fields/formatters as before - only
                the layout/skin changed. */}
            <div
              className={`game-run-card${tracker.paused ? ' is-paused' : ''}${
                runStatusLabel.length > 12
                  ? ' has-long-mode'
                  : runStatusLabel.length > 8
                    ? ' has-mid-mode'
                    : ''
              }`}
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
                <span className="game-run-card-brand">
                  <IconRunning className="game-run-card-brand-icon" />
                  <span className="game-run-card-brand-name">Run Conquest</span>
                </span>
                <span className="game-run-card-status">{runStatusLabel}</span>
              </button>
              <div className="game-run-card-stats">
                <span className="game-stat game-stat-time">
                  <span className="game-stat-value">
                    {formatDuration(tracker.movingSeconds)}
                  </span>
                  <span className="game-stat-label">Time</span>
                </span>
                <span className="game-run-card-metrics">
                  <span className="game-stat">
                    <span className="game-stat-value">
                      {formatDistance(displayedDistance).replace(' km', '')}
                    </span>
                    <span className="game-stat-label">km</span>
                  </span>
                  <span className="game-stat">
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
                    <span className="game-stat-label">min/km</span>
                  </span>
                </span>
              </div>
              <motion.div
                className="game-run-card-details"
                initial={false}
                animate={{
                  height: gripDragH ?? (statsOnly ? 0 : 'auto'),
                }}
                transition={{
                  duration: gripDragH != null ? 0 : 0.22,
                  ease: 'easeInOut',
                }}
                aria-hidden={statsOnly}
              >
                <div
                  className="game-run-card-details-scroll"
                  ref={detailsScrollRef}
                >
                  <div className="game-run-card-divider" />
                  <div className="game-run-card-grid">
                    {runDetailTiles.map((tile) => (
                      <div key={tile.label} className="game-run-card-tile">
                        <span className="game-run-card-tile-value">
                          {tile.value}
                        </span>
                        <span className="game-run-card-tile-label">
                          {tile.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
              <div
                className="game-run-card-grip"
                role="button"
                tabIndex={0}
                aria-label="Drag to expand run details"
                onPointerDown={handleGripPointerDown}
                onPointerMove={handleGripPointerMove}
                onPointerUp={handleGripPointerUp}
                onPointerCancel={handleGripPointerCancel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setStatsOnly((collapsed) => !collapsed)
                  }
                }}
              >
                <span className="game-run-card-handle" aria-hidden="true" />
              </div>
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
                  {/* End (green) and Discard (red) are the shared GameButton
                      (primary / danger) like every other screen; the "are you
                      sure" step is the modal below, triggered by either one
                      (Discard always asks). Pause/Resume only ever renders for a
                      Training run (tracker.isTraining) - every other mode
                      (Conquer, PvP, Club War) keeps exactly the two buttons
                      it always had. */}
                  <div className="game-controls-actions game-run-actions">
                    {tracker.isTraining &&
                      (tracker.paused ? (
                        <GameButton
                          variant="accent"
                          size="compact"
                          icon={<IconPlay />}
                          className="game-run-slot game-run-btn-resume"
                          onClick={tracker.resume}
                        >
                          Resume
                        </GameButton>
                      ) : (
                        <GameButton
                          variant="accent"
                          size="compact"
                          icon={<IconPause />}
                          className="game-run-slot game-run-btn-pause"
                          onClick={tracker.pause}
                        >
                          Pause
                        </GameButton>
                      ))}
                    <GameButton
                      variant="primary"
                      size="compact"
                      icon={<IconFlagCheckered />}
                      className="game-run-slot game-run-btn-end"
                      onClick={handleRequestEnd}
                    >
                      End
                    </GameButton>
                    <GameButton
                      variant="danger"
                      size="compact"
                      icon={<IconClose />}
                      className="game-run-slot game-run-btn-discard"
                      onClick={() => setConfirmAction('cancel')}
                    >
                      Discard
                    </GameButton>
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
                  <GameButton
                    variant="neutral"
                    onClick={() => setConfirmAction(null)}
                  >
                    Keep It
                  </GameButton>
                  <GameButton
                    variant="danger"
                    onClick={() => {
                      setConfirmAction(null)
                      discardDraft()
                    }}
                  >
                    Yes, Discard
                  </GameButton>
                </div>
              </div>
            ) : (
              <div className="game-controls-actions">
                <GameButton
                  size="lg"
                  fullWidth
                  onClick={() => attemptSubmit(pendingRun)}
                  disabled={saving}
                >
                  {saving ? 'Submitting…' : 'Submit Run'}
                </GameButton>
                <GameButton
                  variant="danger"
                  size="lg"
                  fullWidth
                  onClick={() => setConfirmAction('discard')}
                  disabled={saving}
                >
                  Discard
                </GameButton>
              </div>
            )}
            {draftLoopOpen ? (
              <p className="game-controls-hint game-controls-hint-warn">
                This loop isn&apos;t closed — your capture might not be complete
                since you didn&apos;t finish back where you started.
              </p>
            ) : (
              draftLooksThin && (
                <p className="game-controls-hint game-controls-hint-warn">
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
                  <GameButton
                    variant="neutral"
                    onClick={() => setRouteConfirmCancel(false)}
                  >
                    Keep Drawing
                  </GameButton>
                  <GameButton
                    variant="danger"
                    onClick={handleConfirmCancelDrawing}
                  >
                    Yes, Discard
                  </GameButton>
                </div>
              </div>
            ) : (
              <div className="game-controls-actions">
                <GameButton
                  variant="neutral"
                  onClick={handleUndoRoutePoint}
                  disabled={routeDraftWaypoints.length === 0 || routeSnapBusy}
                >
                  Undo
                </GameButton>
                <GameButton
                  onClick={handleFinishDrawing}
                  disabled={routeSnapBusy}
                >
                  Finish
                </GameButton>
                <GameButton
                  variant="danger"
                  onClick={handleRequestCancelDrawing}
                >
                  Cancel
                </GameButton>
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
      {/* Conquer + End while the loop is open (see handleRequestEnd).
          Backdrop / Esc = Keep Running; the run is never touched by it. */}
      <GameModal
        open={confirmAction === 'loop'}
        onClose={() => setConfirmAction(null)}
        tone="warning"
        title="Loop not closed yet"
        overlayClassName="game-end-run-overlay"
      >
        <p className="game-end-run-summary" data-testid="loop-warning-stats">
          {/* tracker.distance, not displayedDistance: that one only refreshes
              every 5 s (HUD throttle), this popup should be exact on open. */}
          {formatMeters(tracker.distance)} ·{' '}
          {formatDuration(tracker.elapsedSeconds)}
        </p>
        <p className="game-end-run-summary">
          Close your loop to capture territory. If you end now, no territory
          will be claimed.
        </p>
        <GameActions>
          <GameButton onClick={() => setConfirmAction(null)}>
            Keep Running
          </GameButton>
          <GameButton
            variant="danger"
            onClick={() => {
              if (endClickedRef.current) return // double tap
              endClickedRef.current = true
              setConfirmAction(null)
              setLoopWarningDismissed(false)
              tracker.stop()
            }}
          >
            End Anyway
          </GameButton>
        </GameActions>
      </GameModal>

      <GameModal
        open={confirmAction === 'end' || confirmAction === 'cancel'}
        onClose={() => setConfirmAction(null)}
        tone={confirmAction === 'cancel' ? 'danger' : 'success'}
        title={
          confirmAction === 'cancel' ? 'Discard this run?' : 'End this run?'
        }
        overlayClassName="game-end-run-overlay"
      >
        <p className="game-end-run-summary">
          {formatMeters(displayedDistance)} ·{' '}
          {formatDuration(tracker.elapsedSeconds)}
          {confirmAction === 'end' ? ' will be saved' : ' will be lost'}
        </p>
        {confirmAction === 'end' &&
          tracker.distance < MIN_VALID_RUN_DISTANCE_METERS && (
            <p className="game-controls-hint game-controls-hint-warn">
              This run is very short and may not count.
            </p>
          )}
        <GameActions>
          <GameButton variant="neutral" onClick={() => setConfirmAction(null)}>
            Keep Running
          </GameButton>
          <GameButton
            variant={confirmAction === 'end' ? 'primary' : 'danger'}
            onClick={() => {
              setConfirmAction(null)
              if (confirmAction === 'end') {
                setLoopWarningDismissed(false)
                tracker.stop()
              } else handleCancelTracking()
            }}
          >
            {confirmAction === 'end' ? 'Yes, End' : 'Yes, Discard'}
          </GameButton>
        </GameActions>
      </GameModal>

      <AnimatePresence>
        {saveError && (
          <motion.div
            className="game-popup-layer is-bottom"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="game-claim-toast glass-card"
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
            >
              <h3>{saveError.title}</h3>
              <p>{saveError.message}</p>
              <div className="game-highlight-toast-actions">
                {pendingRun && (
                  <GameButton
                    onClick={() => attemptSubmit(pendingRun)}
                    disabled={saving}
                  >
                    Retry Save
                  </GameButton>
                )}
                <GameButton
                  variant="neutral"
                  onClick={() => setSaveError(null)}
                >
                  Dismiss
                </GameButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tracker.invalidMotion && (
          <motion.div
            className="game-popup-layer is-bottom"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="game-claim-toast glass-card"
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
            >
              <h3>{OVER_SPEED_WARNING_TITLE}</h3>
              <p>{OVER_SPEED_WARNING_COPY}</p>
              <div className="game-highlight-toast-actions">
                <GameButton onClick={() => tracker.stop()}>Stop Run</GameButton>
                <GameButton
                  variant="neutral"
                  onClick={tracker.dismissInvalidMotion}
                >
                  Keep Going
                </GameButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {runResult && (
          <motion.div
            className="game-popup-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="run-result-motion"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              {/* One card for every mode (RunResultCard): Training says "Run
                  saved!" and never mentions territory; only a Conquer run
                  ever shows "Checking your territory...". Copy lives in
                  utils/postRun.js. By the time any phase renders,
                  attemptSubmit() has already created the run server-side. */}
              <RunResultCard
                runResult={runResult}
                run={completedRun}
                warPoints={runScoreBreakdown?.totalScore ?? null}
                summary={
                  runResult.phase === 'done'
                    ? summarizeRunEvents(runResult.events)
                    : null
                }
                onClose={() => {
                  setRunResult(null)
                  if (runResult.phase === 'rejected') {
                    setRolloutRequestResult(null)
                    setRolloutRequestError(null)
                  }
                }}
                rollout={{
                  result: rolloutRequestResult,
                  error: rolloutRequestError,
                  busy: rolloutRequestBusy,
                  onRequest: handleRequestRollout,
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Shown right after the run-result toast above is dismissed, never
            layered on top of it - the reward beat (XP/score/hero perk) is
            separate from the territory/race/war outcome itself. Gated on
            either xpReward or a real score, not just xpReward alone - a
            Club War/PvP run always gets a score push even on the rare
            run that somehow grants zero XP. completedRun supplies the
            stats row and the mode (training/club_war/pvp vs plain
            territory); TrackRunPanel's Boss Fight flow is a separate,
            admin-only staging surface this never touches. */}
        {/* After the result popup: rewards (XP/score) and then the run
            image - for EVERY mode with a route. A run with no XP and no
            score (PvP without XP, a rejected/timed-out Conquer, ...) skips
            straight to the image once the reward lookup has finished. Once
            dismissed it never re-opens for the same run. */}
        {runRewardsOpen && (
          <RunRewardsModal
            key={completedRun.id}
            mode={
              completedRun.isWar
                ? 'club_war'
                : completedRun.isRace
                  ? 'pvp'
                  : completedRun.isTraining
                    ? 'training'
                    : 'territory'
            }
            stats={completedRun}
            run={completedRun}
            xpReward={xpReward}
            scoreBreakdown={runScoreBreakdown}
            onDismiss={() => {
              // Both are checked in the gate above - dismissing must
              // clear both, or a score-only run (no xpReward) would
              // leave runScoreBreakdown truthy and the modal would just
              // re-show itself on the very next render.
              setXpReward(null)
              setRunScoreBreakdown(null)
              setPostRunDismissedId(completedRun.id)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pvpSession && !pvpSession.dismissed && (
          <PvpResultPopup
            key={pvpSession.challengeId}
            status={pvpSession.status}
            error={pvpSession.error}
            view={pvpFollow.view}
            rivalHero={pvpRivalHero}
            heroCatalog={heroes}
            delayed={pvpFollow.delayed}
            settled={pvpFollow.settled}
            distanceText={
              pvpSession.run?.distance != null
                ? formatMeters(pvpSession.run.distance)
                : null
            }
            paceText={
              pvpSession.run?.avgPace != null
                ? formatPace(pvpSession.run.avgPace)
                : null
            }
            balanceBefore={pvpSession.balanceBefore}
            balanceAfter={pvpFollow.balanceAfter}
            onBalanceTick={setPvpHudCoins}
            onDone={closePvpPopup}
            onDetails={() => {
              closePvpPopup()
              openMenu('race', PVP_SOURCES.ALERT_PILL)
            }}
            onRetry={() => {
              const run = tracker.pendingRun
              if (run) attemptSubmit(run)
            }}
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
            const canRun = (highlightedEntry.points?.length || 0) >= 3
            const busy = tracker.status !== 'idle' || Boolean(pendingRun)
            const runBlockedReason = busy
              ? 'Finish your current run first.'
              : offline
                ? 'Needs internet - connect to Wi-Fi or mobile data.'
                : gameLocked
                  ? 'Territory runs aren’t open in your area yet.'
                  : null
            return (
              <motion.div
                className="game-popup-layer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => {
                  // Backdrop tap closes (the layer ignores pointer events, so
                  // this only fires through the popup's own scrim, see CSS).
                  if (e.target === e.currentTarget) closeTerritoryPopup()
                }}
              >
                <TerritoryPopup
                  status={highlightedEntry.status || 'ready'}
                  isMine={isMine}
                  name={playerNameOf(highlightedEntry)}
                  avatarSrc={highlightedEntry.avatarSrc}
                  color={highlightedEntry.color}
                  level={isMine ? profileLevel : null}
                  clubTag={isMine ? profile?.clubName || null : null}
                  areaText={formatAreaStat(highlightedEntry.areaSqMeters)}
                  scoreText={formatNumber(highlightedEntry.runScore || 0)}
                  // playerLocation can be the map's fallback centre; only a real fix
                  // makes the distance meaningful.
                  hasLocation={Boolean(liveLocation)}
                  startDistanceMeters={
                    previewRoute?.startDistanceMeters ?? null
                  }
                  startDistanceText={
                    previewRoute
                      ? formatMeters(previewRoute.startDistanceMeters)
                      : null
                  }
                  canRun={canRun}
                  runBlockedReason={runBlockedReason}
                  hasVisibleParcels={highlightHasVisibleParcels}
                  warning={territoryRunWarning}
                  onClose={closeTerritoryPopup}
                  onRun={() => handleRunTerritory(highlightedEntry)}
                  onForceRun={() =>
                    handleRunTerritory(highlightedEntry, { force: true })
                  }
                  onCancelWarning={() => setTerritoryRunWarning(null)}
                  onProfile={() => {
                    setViewingProfile(highlightedEntry)
                    setHighlightedEntry(null)
                  }}
                  onRetry={() =>
                    setHighlightedEntry((e) =>
                      e ? { ...e, status: undefined } : e
                    )
                  }
                />
              </motion.div>
            )
          })()}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className={`game-menu-sheet${menuTab === 'race' ? ' is-pvp' : ''}${menuTab === 'settings' ? ' is-fixed-head' : ''}${menuTab === 'leaderboard' ? ' is-lb' : ''}`}
            ref={menuSheetRef}
            // Opened through the cloud portal: appear in place (the clouds
            // cover it), no slide-up flash.
            initial={pvpInstantRef.current ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={
              menuTab === 'race'
                ? { opacity: 0, transition: { duration: 0.01 } }
                : { y: '100%' }
            }
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {menuTab === 'race' ? (
              // PvP: the same pill header + close X as the other sections,
              // without the section dropdown, plus the coin balance.
              <>
                <button
                  type="button"
                  className="game-close-btn game-menu-close"
                  onClick={exitPvp}
                  aria-label="Close PvP"
                >
                  <IconClose />
                </button>
                <div className="game-menu-picker is-static">
                  <div className="game-menu-picker-current is-static">
                    <TabMedal tab={activeMenuTab} />
                    <h1 className="game-menu-picker-label">PvP</h1>
                    <span
                      className="pvp-balance-chip"
                      aria-label={`${fahhcoin ?? 0} Fahhcoin`}
                    >
                      <span className="pvp-coin" aria-hidden="true" />
                      <CoinAmount className="pvp-num" value={fahhcoin ?? 0} />
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
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
                      className={`game-menu-tab ${menuTab === tab.id ? 'active' : ''}${gameLocked && ROLLOUT_LOCKED_TABS.has(tab.id) ? ' is-locked' : ''}${offline && OFFLINE_BLOCKED_TABS.has(tab.id) ? ' is-offline-locked' : ''}`}
                      disabled={gameLocked && ROLLOUT_LOCKED_TABS.has(tab.id)}
                      aria-disabled={
                        (offline && OFFLINE_BLOCKED_TABS.has(tab.id)) ||
                        undefined
                      }
                      onClick={() =>
                        offline && OFFLINE_BLOCKED_TABS.has(tab.id)
                          ? needsInternet()
                          : switchTab(tab.id)
                      }
                    >
                      <TabMedal
                        tab={tab}
                        medalClassName="game-menu-tab-medal"
                      />
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
                        transition={{
                          type: 'spring',
                          stiffness: 460,
                          damping: 26,
                        }}
                      >
                        {dropdownTabs.map((tab, i) => (
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
              </>
            )}

            {menuTab === 'leaderboard' && (
              <>
                <div className="game-menu-panel game-cards lb-panel">
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
                              leaderboardScopeLabel?.cityName) ||
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
                              leaderboardScopeLabel?.countryName) ||
                              'Country'}
                          </span>
                        </button>
                      </div>
                    )}

                    {leaderboardMode === 'individual' &&
                      individualScope === 'city' && (
                        <p className="game-leaderboard-notice">
                          Showing conquered area in{' '}
                          {leaderboardScopeLabel?.cityName || 'your district'}{' '}
                          only.
                        </p>
                      )}
                    {leaderboardMode === 'club' && clubScope === 'national' && (
                      <p className="game-leaderboard-notice">
                        Showing clubs in{' '}
                        {leaderboardScopeLabel?.countryName || 'your country'}{' '}
                        only.
                      </p>
                    )}

                    {lb.error && lb.rows.length === 0 ? (
                      <div className="game-menu-empty">
                        <p>{lb.error.message}</p>
                        <GameButton
                          size="sm"
                          variant="neutral"
                          onClick={lb.retry}
                        >
                          Retry
                        </GameButton>
                      </div>
                    ) : lb.initialLoading ? (
                      <LeaderboardSkeleton />
                    ) : lb.rows.length === 0 ? (
                      <p className="game-menu-empty">
                        {leaderboardMode === 'individual'
                          ? individualScope === 'city'
                            ? 'Nothing here yet — district rankings only refresh about once an hour, so a run from the last little while (or from a different district than you expect) may not show up here yet.'
                            : 'No territory claimed yet — be the first.'
                          : clubScope === 'national'
                            ? 'No club has claimed territory in your country yet.'
                            : 'No club has claimed territory yet.'}
                      </p>
                    ) : leaderboardMode === 'individual' ? (
                      <LeaderboardPodium
                        nameLabel="Runner"
                        page={lb.page}
                        pager={leaderboardPager}

                        entries={lb.rows.map((entry) => ({
                          key: entry.userId,
                          rank: entry.rank,
                          // My own row: the leaderboard payload has no nickname,
                          // but I know mine.
                          name: playerNameOf(
                            isMyEntry(entry)
                              ? {
                                  ...entry,
                                  nickname: entry.nickname || user?.nickname,
                                }
                              : entry
                          ),
                          // Same "icon + stat" treatment as the Club board's
                          // trophy count - territory is this board's score.
                          area: (
                            <span className="lb-trophy-stat">
                              <IconFlag />
                              {formatArea(entry.areaSqMeters)}
                            </span>
                          ),
                          // The leaderboard API has no profile pictures yet
                          // (always null today) -> coloured initials.
                          avatarSrc: resolveFileUrl(entry.profilePictureUrl),
                          isPlayer: isMyEntry(entry),
                          onClick: () => setViewingProfile(entry),
                        }))}
                      />
                    ) : (
                      <LeaderboardPodium
                        nameLabel="Club"
                        statLabel="Trophies"
                        page={lb.page}
                        pager={leaderboardPager}

                        entries={lb.rows.map((entry) => ({
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
                {/* The player's own row: a SIBLING after the one scrolling
                  element (.lb-panel), docked flush at the bottom. */}
                <LeaderboardDock me={leaderboardMe} />
              </>
            )}

            {menuTab === 'club' && (
              <div className="game-menu-panel">
                <ClubPanel
                  hasClub={Boolean(profile?.clubName)}
                  userId={user?.id}
                  balance={fahhcoin ?? 0}
                  onClubChanged={refreshProfile}
                  onViewProfile={setViewingProfile}
                  ownedItems={ownedItems}
                  storeCatalog={storeCatalog}
                  level={profile?.level}
                  onEquipHero={handleEquipWarHero}
                  onStartWarRun={handleStartWarRun}
                  racing={tracker.status === 'tracking' || Boolean(pendingRun)}
                  openClubId={openClubId}
                  onOpenClubHandled={() => setOpenClubId(null)}
                  onViewRoute={handleViewRoute}
                  onGetCoins={openCoinShop}
                />
              </div>
            )}

            {menuTab === 'race' && (
              <div className="game-menu-panel">
                <PvpPanel
                  pvp={pvp}
                  userId={user?.id}
                  balance={fahhcoin ?? 0}
                  onStartRace={handleStartRace}
                  onForfeited={() => refreshProfile()}
                  racing={tracker.status === 'tracking' || Boolean(pendingRun)}
                  focusRaceId={pvpFocusId}
                  onFocusHandled={() => setPvpFocusId(null)}
                  heroName={showHeroTurntable ? activeHeroName : null}
                  avatarSrc={
                    resolveFileUrl(user?.profilePictureUrl) || avatarSrc
                  }
                  playerName={playerNameOf(user)}
                  heroCatalog={heroes}
                  onClose={exitPvp}
                  onGetCoins={openCoinShop}
                  onOpenSettings={() => switchTab('settings')}
                  onRequestStart={requestNewMatch}
                />
              </div>
            )}

            {menuTab === 'mail' && (
              <div className="game-menu-panel">
                <MailPanel
                  mailbox={mailbox}
                  onClaimed={handleMailClaimed}
                  // Names a gifted item from the catalog when it is already
                  // loaded (no extra request); otherwise the chip says "Gift
                  // item".
                  resolveStoreItem={(id) =>
                    id ? storeCatalog.find((item) => item.id === id) : null
                  }
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
                {profileCachedAt && (
                  <p
                    className="game-controls-hint"
                    data-testid="profile-last-updated"
                  >
                    Offline - showing your last known stats (updated{' '}
                    {formatLastUpdated(profileCachedAt)})
                  </p>
                )}
                <div className="game-menu-hero">
                  {showHeroTurntable ? (
                    // Plays the equipped emote in place of the idle
                    // turntable when one's equipped and its art actually
                    // resolves (see equippedEmoteItem/equippedEmoteAsset
                    // above) - same spot, same size, just a different
                    // sprite/pace (EmoteGlyph plays through the same
                    // shared pace as HeroSprite's idle turntable now - see
                    // utils/spriteTiming.js). Falls
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
                      loading="lazy"
                      decoding="async"
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
                {/* XP bar, then the profile picture, then name and stats -
                    same order as another player's profile. */}
                {profile?.level != null && (
                  <div className="game-level-hud">
                    <LevelBar level={profile.level} xp={profile.xp} showXp />
                  </div>
                )}
                <ProfileAvatar
                  src={resolveFileUrl(user?.profilePictureUrl)}
                  name={playerNameOf(user)}
                  level={profile?.level}
                  loading={userLoading || !profile}
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
                                  score {formatNumber(t.currentScore || 0)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {myTerritoriesTotalPages > 1 && (
                          <div className="game-route-pager">
                            <GameButton
                              variant="neutral"
                              size="sm"
                              aria-label="Show previous territories"
                              disabled={myTerritoriesPage <= 1}
                              onClick={() => setMyTerritoriesPage((p) => p - 1)}
                            >
                              ◀
                            </GameButton>
                            <span className="game-route-pager-label">
                              Page {myTerritoriesPage} of{' '}
                              {myTerritoriesTotalPages}
                            </span>
                            <GameButton
                              variant="neutral"
                              size="sm"
                              aria-label="Show more territories"
                              disabled={
                                myTerritoriesPage >= myTerritoriesTotalPages
                              }
                              onClick={() => setMyTerritoriesPage((p) => p + 1)}
                            >
                              ▶
                            </GameButton>
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className="game-me-section">
                    <p className="game-menu-section-title">My Routes</p>
                    <GameButton
                      size="sm"
                      className="game-me-draw-route-btn"
                      onClick={handleStartDrawRoute}
                    >
                      + Draw New Route
                    </GameButton>
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
                            <GameButton
                              variant="neutral"
                              size="sm"
                              disabled={myRoutesPage <= 1}
                              onClick={() => loadMyRoutes(myRoutesPage - 1)}
                            >
                              Prev
                            </GameButton>
                            <span className="game-route-pager-label">
                              Page {myRoutesPage} of {myRoutesTotalPages}
                            </span>
                            <GameButton
                              variant="neutral"
                              size="sm"
                              disabled={myRoutesPage >= myRoutesTotalPages}
                              onClick={() => loadMyRoutes(myRoutesPage + 1)}
                            >
                              Next
                            </GameButton>
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <PendingRunsList
                    runs={runSync.runs}
                    onRetry={async (id) => {
                      await retryOutboxRun(id)
                      runSync.flush()
                    }}
                    onDelete={(id) => removeOutboxRun(id)}
                  />

                  <section className="game-me-section" ref={myRunsListRef}>
                    <p className="game-menu-section-title">History</p>
                    {myRunsError ? (
                      <div className="game-me-history-error">
                        <p className="game-controls-hint game-controls-hint-error">
                          {myRunsError}
                        </p>
                        <GameButton
                          variant="neutral"
                          size="sm"
                          onClick={() => loadMyRunsPage(myRunsPage)}
                        >
                          Retry
                        </GameButton>
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
              <GameSettings
                audio={volumes}
                push={push}
                mapStyles={MAP_STYLES}
                mapStyleId={mapStyleId}
                onSelectMapStyle={handleChooseMapStyle}
                pvp={pvp}
                onEditProfile={() => {
                  // Website page: the system browser natively (not a game
                  // route there), the in-app route on the web.
                  if (isNative) openExternal(getSiteUrl('/profile/edit'))
                  else navigate('/profile/edit')
                }}
                onHowToPlay={() => {
                  setMenuOpen(false)
                  tour.replay()
                }}
                onOpenLegal={setLegalDoc}
                onLogout={handleLogout}
              />
            )}

            {menuTab === 'shop' && (
              <div className="game-menu-panel game-menu-shop game-cards">
                <div className="game-shop-wallet">
                  <span className="game-hud-icon game-hud-icon-coin" />
                  <span className="game-shop-wallet-value">
                    {formatCoins(fahhcoin ?? 0)}
                  </span>
                  <GameButton variant="gold" size="sm" onClick={openCoinShop}>
                    + Get more
                  </GameButton>
                </div>
                {(storeError ||
                  (storeActionError && !isNotOwnedError(storeActionError))) && (
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
                    level={profile?.level}
                    loading={heroesLoading}
                    onSelect={handleSelectGalleryHero}
                    onEquip={handleEquip}
                  />
                )}

                {shopSection === 'territory' && (
                  <ColorShelf
                    kind="territory"
                    title="Territory"
                    items={shadeItems}
                    ownedItems={ownedItems}
                    balance={fahhcoin ?? 0}
                    level={profile?.level}
                    onSelect={handleSelectTerritoryColor}
                    emptyText="No territory colours in stock yet."
                  />
                )}

                {shopSection === 'trail' && (
                  <ColorShelf
                    kind="trail"
                    title="Trail"
                    items={trailItems}
                    ownedItems={ownedItems}
                    balance={fahhcoin ?? 0}
                    level={profile?.level}
                    onSelect={handleSelectTrailColor}
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
            profilePictureUrl={
              isMyEntry(viewingProfile)
                ? user?.profilePictureUrl
                : viewingProfile.profilePictureUrl
            }
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
            className="game-confirm-overlay game-run-viewer-overlay"
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
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
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
                <GameButton
                  variant="neutral"
                  onClick={() => setRouteNamePromptOpen(false)}
                  disabled={savingRoute}
                >
                  Back
                </GameButton>
                <GameButton
                  variant="neutral"
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
                </GameButton>
                <GameButton
                  disabled={savingRoute}
                  onClick={() =>
                    handleSaveRoute({
                      name: routeNameInput.trim() || 'My Route',
                      visibility: 'PRIVATE',
                    })
                  }
                >
                  {savingRoute ? 'Saving…' : 'Just Me'}
                </GameButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExitConfirmOverlay backButton={backButton} />

      {/* "Turn on Visibility" / "Location is off" in front of PvP. */}
      <AnimatePresence>
        {pvpGate && (
          <PvpGatePrompt
            key="pvp-gate"
            variant={pvpGate.variant}
            busy={pvpGate.busy}
            error={pvpGate.error}
            canOpenSettings={isNative}
            onTurnOn={handleGateTurnOn}
            onNotNow={() => setPvpGate(null)}
            onOpenSettings={() => {
              openAppSettings()?.catch?.(() => {})
              setPvpGate(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* The cloud portal into / out of PvP: above everything, input locked. */}
      <PortalClouds {...portal.state} />

      <AnimatePresence>
        {viewingRoute && !followingRoute && (
          <motion.div
            className="game-popup-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="game-highlight-toast glass-card game-route-popup"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
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
                <GameButton onClick={() => setLoopWarningDismissed(true)}>
                  Got it
                </GameButton>
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
                <GameButton
                  variant="neutral"
                  onClick={() => setGpsErrorDismissed(true)}
                >
                  Dismiss
                </GameButton>
                <GameButton onClick={handleStartRun}>Try Again</GameButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* !buyRedirectBundle - while the redirect confirmation is open,
            this list isn't just hidden behind it visually, it's unmounted
            entirely. Both are .game-confirm-overlay popups with their own
            semi-transparent scrim (by design - "no transparency" in the
            brief means the CARD, not the scrim); leaving this one mounted
            underneath stacked its scrim under the new one's and let its
            larger, differently-sized card peek out around the smaller
            confirmation's edges - caught in a screenshot, not by reading
            the JSX. coinShopOpen itself stays true throughout (not reset
            on Continue/Cancel), so dismissing the confirmation returns to
            this exact list, not an empty/reloading one. */}
        {coinShopOpen && !buyRedirectBundle && (
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
                          {formatNumber(bundle.fahhcoinAmount)} Fahhcoin
                        </span>
                        <span className="game-menu-list-meta">
                          Rs. {formatNumber(bundle.priceNpr)}
                        </span>
                      </span>
                      <GameButton
                        variant="gold"
                        size="sm"
                        className="game-coin-buy-btn"
                        onClick={() => openBuyRedirectConfirm(bundle)}
                      >
                        Buy
                      </GameButton>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {buyRedirectBundle && (
          <motion.div
            className="game-confirm-overlay game-buy-redirect-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeBuyRedirectConfirm}
          >
            <motion.div
              className="game-confirm-card game-buy-redirect-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="game-close-btn game-run-viewer-close"
                aria-label="Close"
                onClick={closeBuyRedirectConfirm}
              >
                <IconClose />
              </button>
              <p className="game-buy-redirect-title">Open the Shop</p>
              <p className="game-buy-redirect-pack">
                {formatNumber(buyRedirectBundle.fahhcoinAmount)} Fahhcoin ·{' '}
                <span className="game-buy-redirect-price">
                  Rs. {formatNumber(buyRedirectBundle.priceNpr)}
                </span>
              </p>
              <p className="game-buy-redirect-note">
                You&apos;ll be taken to the Fahhcoin shop page to complete your
                purchase. Your coins appear in your account after payment.
              </p>
              {iosShopRedirectBlocked && (
                <p className="game-buy-redirect-ios-note">
                  Fahhcoin purchases aren&apos;t available in the iOS app yet -
                  please use the website instead.
                </p>
              )}
              {buyRedirectError && (
                <p className="game-controls-hint game-controls-hint-error">
                  {buyRedirectError}
                </p>
              )}
              <div className="game-confirm-actions">
                <GameButton
                  variant="neutral"
                  onClick={closeBuyRedirectConfirm}
                  disabled={buyRedirecting}
                >
                  Cancel
                </GameButton>
                <GameButton
                  onClick={handleContinueToShop}
                  disabled={buyRedirecting || iosShopRedirectBlocked}
                >
                  {buyRedirecting ? 'Opening…' : 'Continue to Shop'}
                </GameButton>
              </div>
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
            level={profile?.level}
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
            const balance = fahhcoin ?? 0
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
            // Shared rules (utils/itemState.js): equipped implies owned,
            // free (price 0) and the virtual idle slide (id null) are owned
            // for everyone; only a priced item with no row is locked.
            const emoteState = storeChoice.id
              ? getItemState(storeChoice, ownedItems, {
                  equipped:
                    currentlyEquipped?.id === storeChoice.id ||
                    // Idle/Classic is the default: equipped when nothing
                    // else is, row or not.
                    Boolean(storeChoice.isIdleSlide && !currentlyEquipped),
                })
              : getItemState(storeChoice, ownedItems, {
                  equipped: !currentlyEquipped,
                })
            const ownedEmote =
              emoteState === ITEM_STATE.LOCKED
                ? null
                : { equipped: emoteState === ITEM_STATE.EQUIPPED }
            // A claimable free emote needs its hero owned first (backend
            // rule), so a free hero with no row is claimed ahead of it.
            const emoteHeroItem = getHeroUnlockItem(
              heroes.find((h) => h.id === storeChoice.heroId)
            )
            const emoteClaims = [
              needsClaim(emoteHeroItem, ownedItems) ? emoteHeroItem : null,
              needsClaim(storeChoice, ownedItems) ? storeChoice : null,
            ].filter(Boolean)
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
                storeActionError={visibleStoreError(
                  storeActionError,
                  emoteState
                )}
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
                  await handleEquip(storeChoice, ownedEmote.equipped, {
                    claim: emoteClaims,
                  })
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
            const balance = fahhcoin ?? 0
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
                        Buy {storeChoice.name} for <Price amount={price} />?
                      </>
                    ) : (
                      `Unlock ${storeChoice.name} for free?`
                    )}
                  </p>
                  {short && (
                    <p className="game-buy-short">
                      Not enough Fahhcoin - you have {formatPrice(balance)},
                      need {formatPrice(price - balance)} more.
                    </p>
                  )}
                  {purchaseError && (
                    <p className="game-controls-hint game-controls-hint-error">
                      {purchaseError}
                    </p>
                  )}
                  <div className="game-confirm-actions">
                    <GameButton
                      variant="neutral"
                      onClick={closeStoreChoice}
                      disabled={purchasing}
                    >
                      Cancel
                    </GameButton>
                    {short ? (
                      <GameButton
                        variant="gold"
                        onClick={() => {
                          closeStoreChoice()
                          openCoinShop()
                        }}
                      >
                        Get Fahhcoin
                      </GameButton>
                    ) : (
                      <GameButton
                        onClick={() => handlePurchase(storeChoice)}
                        disabled={purchasing}
                      >
                        {purchasing ? 'Buying…' : 'Buy'}
                      </GameButton>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
      </AnimatePresence>

      {/* Territory / Trail preview sheet (Shop). Buy / Get / Equip go through
          the same handlePurchase / handleEquip as before. */}
      <AnimatePresence>
        {(() => {
          if (!colorPreview) return null
          const list = colorPreview.kind === 'trail' ? trailItems : shadeItems
          const item = list.find((i) => i.id === colorPreview.id)
          if (!item) return null
          const closePreview = () => {
            setColorPreview(null)
            setPurchaseError(null)
          }
          return (
            <ColorItemSheet
              key={`color-${item.id}`}
              item={item}
              kind={colorPreview.kind}
              ownedItems={ownedItems}
              balance={fahhcoin ?? 0}
              level={profile?.level}
              purchasing={purchasing}
              purchaseError={purchaseError}
              onBuy={handlePurchase}
              onEquip={handleEquip}
              onGetCoins={() => {
                closePreview()
                openCoinShop()
              }}
              onClose={closePreview}
            />
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
                  <img
                    loading="lazy"
                    decoding="async"
                    src={currentAvatar?.src || defaultAvatarImage}
                    alt=""
                  />
                  <span>{currentAvatar?.name || 'Current'}</span>
                </div>
                <span className="game-avatar-confirm-arrow">→</span>
                <div className="game-avatar-confirm-option">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={avatarChoice.src}
                    alt={avatarChoice.name}
                  />
                  <span>{avatarChoice.name}</span>
                </div>
              </div>
              <div className="game-confirm-actions">
                <GameButton
                  variant="neutral"
                  onClick={() => setAvatarChoice(null)}
                >
                  Cancel
                </GameButton>
                <GameButton onClick={() => handleChooseAvatar(avatarChoice)}>
                  Set This Avatar
                </GameButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Minimum gap between foreground catch-up syncs (see syncOnForeground).
const FOREGROUND_SYNC_MIN_GAP_MS = 20000

export default function GamePage() {
  return (
    <ToastProvider>
      <GamePageInner />
    </ToastProvider>
  )
}
