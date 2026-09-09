import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FaArrowLeft, FaCoins, FaMapMarkedAlt, FaFlag } from 'react-icons/fa'
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
  return `Your loop clips ${check.blocker.ownerName}'s territory — fully surround it to conquer, or route around it.`
}

export default function GamePage() {
  const { user } = useCurrentUser()
  const [gameState, setGameState] = useState(loadGameState)
  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [locating, setLocating] = useState(true)
  const [liveLocation, setLiveLocation] = useState(null)
  const [claimResult, setClaimResult] = useState(null)
  const tracker = useTerritoryRun()

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

  const playerTerritories = gameState.territories.filter(
    (t) => t.ownerId === 'player'
  )
  const totalAreaHeld = playerTerritories.reduce((sum, t) => sum + t.area, 0)

  function persist(nextState) {
    setGameState(nextState)
    saveGameState(nextState)
  }

  function handleClaim() {
    if (!canClaim) return
    // Coins are paid on the ground actually covered by this run, not the
    // post-merge total — otherwise re-tracing the same ground next to
    // already-held land would farm coins for area you already own.
    const runArea = polygonAreaSqMeters(tracker.path)
    const conquered = claimCheck.conquers
    const merges = claimCheck.merges
    const coins = coinsForClaim(runArea, conquered.length)

    const mergedPoints = merges.reduce(
      (acc, t) => unionPolygons(acc, t.points),
      tracker.path
    )
    const finalArea = polygonAreaSqMeters(mergedPoints)

    const newTerritory = {
      id: `player-${Date.now()}`,
      ownerId: 'player',
      ownerName: user?.fullName || 'You',
      color: PLAYER_COLOR,
      points: mergedPoints,
      area: finalArea,
      claimedAt: new Date().toISOString(),
    }

    const removedIds = new Set([...conquered, ...merges].map((t) => t.id))
    const remaining = gameState.territories.filter((t) => !removedIds.has(t.id))

    persist({
      territories: [...remaining, newTerritory],
      coinBalance: gameState.coinBalance + coins,
    })
    setClaimResult({
      area: runArea,
      coins,
      merged: merges.length > 0,
      conqueredNames: conquered.map((t) => t.ownerName),
    })
    tracker.reset()
  }

  const blockMessage = claimBlockMessage(claimCheck)

  return (
    <div className="game-page">
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
        <div className="game-hud-stat">
          <FaCoins />
          <span className="game-hud-value">{gameState.coinBalance}</span>
          <span className="game-hud-label">Fahhcoin</span>
        </div>
        <div className="game-hud-stat">
          <FaMapMarkedAlt />
          <span className="game-hud-value">{formatArea(totalAreaHeld)}</span>
          <span className="game-hud-label">Held</span>
        </div>
        <div className="game-hud-stat">
          <FaFlag />
          <span className="game-hud-value">{playerTerritories.length}</span>
          <span className="game-hud-label">Parcels</span>
        </div>
      </div>

      {tracker.gpsError && (
        <div className="banner error game-page-banner">{tracker.gpsError}</div>
      )}

      <div className="game-controls">
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
              <span>
                Loop area: {formatArea(polygonAreaSqMeters(tracker.path))}
              </span>
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
    </div>
  )
}
