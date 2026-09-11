import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FaArrowLeft,
  FaBars,
  FaCoins,
  FaFlag,
  FaStore,
  FaTimes,
  FaTrophy,
  FaUser,
} from 'react-icons/fa'
import TerritoryMap from '../components/TerritoryMap'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useTerritoryRun } from '../hooks/useTerritoryRun'
import {
  DEFAULT_CENTER,
  MIN_LOOP_PERIMETER_METERS,
  MIN_LOOP_POINTS,
  PLAYER_COLOR,
  coinsForClaim,
  evaluateClaim,
  formatArea,
  loadGameState,
  loopPerimeterMeters,
  polygonAreaSqMeters,
  saveGameState,
  unionPolygons,
} from '../utils/territoryGame'
import './GamePage.css'

function formatMeters(meters) {
  if (!meters) return '0 m'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

function claimBlockMessage(check) {
  if (!check || check.ok) return null
  return "That loop sits entirely inside a bigger rival's territory — there's no ground left to claim. Try a bigger loop, or route around it."
}

// Pokémon GO-style fan-out: tapping the pokéball FAB pops these three
// options up in an arc instead of jumping straight to a menu, so the
// x/y offsets below are the whole point, not incidental styling.
const RADIAL_ITEMS = [
  {
    tab: 'leaderboard',
    label: 'Leaderboard',
    Icon: FaTrophy,
    tone: 'gold',
    x: -92,
    y: -112,
  },
  { tab: 'me', label: 'Me', Icon: FaUser, tone: 'green', x: 0, y: -160 },
  {
    tab: 'shop',
    label: 'Shop',
    Icon: FaStore,
    tone: 'wood',
    x: 92,
    y: -112,
  },
]

export default function GamePage() {
  const { user } = useCurrentUser()
  const [gameState, setGameState] = useState(loadGameState)
  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [locating, setLocating] = useState(true)
  const [liveLocation, setLiveLocation] = useState(null)
  const [claimResult, setClaimResult] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuTab, setMenuTab] = useState('me')
  const [radialOpen, setRadialOpen] = useState(false)
  const tracker = useTerritoryRun()

  // The bottom action sheet's height changes with its content (idle vs.
  // tracking vs. draft-loop-with-hint) and with the device's own safe-area
  // inset - measuring it directly instead of guessing a fixed pixel offset
  // is what lets the floating action row (avatar/menu/locate) sit exactly
  // N px above it on every device, rather than needing hand-tuned
  // breakpoint values that were consistently wrong on real phones.
  const controlsRef = useRef(null)
  const [controlsHeight, setControlsHeight] = useState(90)

  useEffect(() => {
    const el = controlsRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // ResizeObserver's entry.contentRect is the content box only - it
    // excludes .game-controls' own padding and border-top, undershooting
    // the sheet's real visual height. offsetHeight includes both, which is
    // what --sheet-h needs to actually clear the sheet's rounded top edge.
    const observer = new ResizeObserver(() => {
      setControlsHeight(el.offsetHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
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
  }, [])

  // A standing "where am I" watch, independent of whether a run is being
  // tracked — Pokémon GO always shows your position on the map, not just
  // while a loop is actively being recorded.
  useEffect(() => {
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
  }, [])

  const playerLocation =
    tracker.mode === 'gps' && tracker.path.length > 0
      ? tracker.path[tracker.path.length - 1]
      : liveLocation || center

  const perimeter = loopPerimeterMeters(tracker.path)
  const isTracking = tracker.mode === 'gps' || tracker.mode === 'manual'
  const hasDraftLoop = tracker.mode === 'idle' && tracker.path.length > 0
  const geometryReady =
    hasDraftLoop &&
    tracker.path.length >= MIN_LOOP_POINTS &&
    perimeter >= MIN_LOOP_PERIMETER_METERS

  const claimCheck = geometryReady
    ? evaluateClaim(tracker.path, gameState.territories)
    : null
  const canClaim = geometryReady && Boolean(claimCheck?.ok)
  // A bigger rival crops the loop down before it's ever claimed, so the
  // preview should show what you'll actually walk away with, not the raw
  // drawn shape.
  const claimableArea = claimCheck?.ok
    ? polygonAreaSqMeters(claimCheck.claimShape)
    : polygonAreaSqMeters(tracker.path)

  const playerTerritories = gameState.territories.filter(
    (t) => t.ownerId === 'player'
  )
  const totalAreaHeld = playerTerritories.reduce((sum, t) => sum + t.area, 0)
  const playerName = user?.fullName || 'You'

  // Rivals all share ownerId 'rival' (see territoryGame.js), so grouping by
  // name is what keeps them as separate leaderboard rows instead of one
  // combined "rival" blob.
  const leaderboard = Object.values(
    gameState.territories.reduce((acc, t) => {
      const isPlayer = t.ownerId === 'player'
      const key = isPlayer ? 'player' : t.ownerName
      if (!acc[key]) {
        acc[key] = {
          key,
          isPlayer,
          name: isPlayer ? playerName : t.ownerName,
          area: 0,
          parcels: 0,
        }
      }
      acc[key].area += t.area
      acc[key].parcels += 1
      return acc
    }, {})
  ).sort((a, b) => b.area - a.area)

  function persist(nextState) {
    setGameState(nextState)
    saveGameState(nextState)
  }

  function openMenu(tab) {
    setMenuTab(tab)
    setMenuOpen(true)
    setRadialOpen(false)
  }

  function handleClaim() {
    if (!canClaim) return
    const conquered = claimCheck.conquers
    const merges = claimCheck.merges
    const shrinks = claimCheck.shrinks
    // The loop itself may already be cropped down (evaluateClaim clips it
    // against any rival parcel bigger than it) — coins are paid on that
    // actual ground, not the raw drawn loop or the post-merge total,
    // otherwise re-tracing the same ground next to already-held land (or
    // routing through a bigger rival's territory) would farm coins for area
    // you don't end up owning.
    const runArea = polygonAreaSqMeters(claimCheck.claimShape)
    const coins = coinsForClaim(runArea, conquered.length)

    const mergedPoints = merges.reduce(
      (acc, t) => unionPolygons(acc, t.points),
      claimCheck.claimShape
    )
    const finalArea = polygonAreaSqMeters(mergedPoints)

    const newTerritory = {
      id: `player-${Date.now()}`,
      ownerId: 'player',
      ownerName: playerName,
      color: PLAYER_COLOR,
      points: mergedPoints,
      area: finalArea,
      claimedAt: new Date().toISOString(),
    }

    const removedIds = new Set([...conquered, ...merges].map((t) => t.id))
    const shrunkById = new Map(shrinks.map((s) => [s.territory.id, s]))
    const remaining = gameState.territories
      .filter((t) => !removedIds.has(t.id))
      .map((t) => {
        const shrunk = shrunkById.get(t.id)
        return shrunk ? { ...t, points: shrunk.points, area: shrunk.area } : t
      })

    persist({
      territories: [...remaining, newTerritory],
      coinBalance: gameState.coinBalance + coins,
    })
    setClaimResult({
      area: runArea,
      coins,
      merged: merges.length > 0,
      conqueredNames: conquered.map((t) => t.ownerName),
      shrunkNames: shrinks.map((s) => s.territory.ownerName),
    })
    tracker.reset()
  }

  const blockMessage = claimBlockMessage(claimCheck)

  return (
    <div className="game-page" style={{ '--sheet-h': `${controlsHeight}px` }}>
      {locating ? (
        <div className="territory-map-loading game-page-map-slot">
          Finding your location…
        </div>
      ) : (
        <TerritoryMap
          center={center}
          playerLocation={playerLocation}
          territories={gameState.territories}
          livePath={tracker.path}
          manualMode={tracker.mode === 'manual'}
          onMapClick={tracker.addManualPoint}
        />
      )}

      <Link to="/" className="game-exit-btn" aria-label="Exit to home">
        <FaArrowLeft />
      </Link>

      <div className="game-hud">
        <div className="game-hud-stat" aria-label="Fahhcoin balance">
          <span className="game-hud-icon game-hud-icon-coin">
            <FaCoins />
          </span>
          <span className="game-hud-value">{gameState.coinBalance}</span>
        </div>
        <div className="game-hud-stat" aria-label="Parcels held">
          <span className="game-hud-icon game-hud-icon-flag">
            <FaFlag />
          </span>
          <span className="game-hud-value">{playerTerritories.length}</span>
        </div>
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
                  onClick={() => openMenu(item.tab)}
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

      {tracker.gpsError && (
        <div className="banner error game-page-banner">{tracker.gpsError}</div>
      )}

      <div className="game-controls" ref={controlsRef}>
        {tracker.mode === 'idle' && tracker.path.length === 0 && (
          <div className="game-controls-actions">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={tracker.startGps}
            >
              Start GPS Run
            </button>
            <button
              type="button"
              className="btn btn-outline btn-lg"
              onClick={tracker.startManual}
            >
              Tap to Draw Territory
            </button>
          </div>
        )}

        {isTracking && (
          <>
            <div className="game-controls-stats">
              <span>{tracker.path.length} points</span>
              <span>{formatMeters(tracker.distance)} covered</span>
              {tracker.mode === 'manual' && (
                <span>Tap the map to add points</span>
              )}
            </div>
            <div className="game-controls-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={tracker.finish}
                disabled={tracker.path.length < MIN_LOOP_POINTS}
              >
                Close Loop
              </button>
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={tracker.reset}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {hasDraftLoop && (
          <>
            <div className="game-controls-stats">
              <span>Loop area: {formatArea(claimableArea)}</span>
              <span>Perimeter: {formatMeters(perimeter)}</span>
            </div>
            <div className="game-controls-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleClaim}
                disabled={!canClaim}
              >
                Claim Territory
              </button>
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={tracker.reset}
              >
                Discard
              </button>
            </div>
            {!geometryReady && (
              <p className="game-controls-hint">
                Needs at least {MIN_LOOP_POINTS} points and a{' '}
                {MIN_LOOP_PERIMETER_METERS}m+ loop to claim.
              </p>
            )}
            {geometryReady && blockMessage && (
              <p className="game-controls-hint game-controls-hint-error">
                {blockMessage}
              </p>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {claimResult && (
          <motion.div
            className="game-claim-toast glass-card"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
          >
            <h3>
              {claimResult.conqueredNames.length > 0
                ? `You conquered ${claimResult.conqueredNames.join(' & ')}'s territory!`
                : claimResult.shrunkNames.length > 0
                  ? `You cropped ${claimResult.shrunkNames.join(' & ')}'s edge!`
                  : claimResult.merged
                    ? 'Territory expanded!'
                    : 'Territory claimed!'}
            </h3>
            <p>
              {formatArea(claimResult.area)} claimed · +{claimResult.coins}{' '}
              Fahhcoin
            </p>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setClaimResult(null)}
            >
              Nice
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="game-menu-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              className="game-menu-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="game-menu-handle" />

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
                  onClick={() => setMenuTab('leaderboard')}
                >
                  <FaTrophy />
                  Leaderboard
                </button>
                <button
                  type="button"
                  className={`game-menu-tab ${menuTab === 'me' ? 'active' : ''}`}
                  onClick={() => setMenuTab('me')}
                >
                  <FaUser />
                  Me
                </button>
                <button
                  type="button"
                  className={`game-menu-tab ${menuTab === 'shop' ? 'active' : ''}`}
                  onClick={() => setMenuTab('shop')}
                >
                  <FaStore />
                  Shop
                </button>
              </div>

              {menuTab === 'leaderboard' && (
                <div className="game-menu-panel">
                  {leaderboard.length === 0 ? (
                    <p className="game-menu-empty">
                      No territory claimed yet — be the first.
                    </p>
                  ) : (
                    <ul className="game-menu-leaderboard">
                      {leaderboard.map((entry, i) => (
                        <li
                          key={entry.key}
                          className={entry.isPlayer ? 'is-player' : ''}
                        >
                          <span className="game-menu-leaderboard-rank">
                            #{i + 1}
                          </span>
                          <span className="game-menu-leaderboard-name">
                            {entry.name}
                          </span>
                          <span className="game-menu-leaderboard-area">
                            {formatArea(entry.area)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {menuTab === 'me' && (
                <div className="game-menu-panel">
                  <div className="game-menu-summary">
                    <span className="game-menu-summary-value">
                      {formatArea(totalAreaHeld)}
                    </span>
                    <span className="game-menu-summary-label">
                      held across {playerTerritories.length} parcel
                      {playerTerritories.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {playerTerritories.length === 0 ? (
                    <p className="game-menu-empty">
                      Claim your first loop to see it here.
                    </p>
                  ) : (
                    <ul className="game-menu-list">
                      {[...playerTerritories]
                        .sort((a, b) => b.area - a.area)
                        .map((t) => (
                          <li key={t.id}>
                            <span className="game-menu-list-area">
                              {formatArea(t.area)}
                            </span>
                            <span className="game-menu-list-meta">
                              claimed{' '}
                              {new Date(t.claimedAt).toLocaleDateString()}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}

              {menuTab === 'shop' && (
                <div className="game-menu-panel game-menu-shop">
                  <FaStore className="game-menu-shop-icon" />
                  <p className="game-menu-shop-title">Shop is coming soon</p>
                  <p className="game-menu-shop-balance">
                    <FaCoins />
                    {gameState.coinBalance} Fahhcoin saved up for when it opens
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
