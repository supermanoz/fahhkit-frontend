/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import CoinAmount from './CoinAmount'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  IconBolt,
  IconChevronRight,
  IconClock,
  IconClose,
  IconCrosshairs,
  IconFlag,
  IconInfo,
  IconLock,
  IconMinus,
  IconPlus,
  IconRunning,
  IconSwords,
  IconTrophy,
} from './GameIcons'
import { PVP_MODES, getPvpMode, getPvpModeByMeters } from '../api/pvp'
import { resolveFileUrl } from '../api/client'
import { mySide } from '../hooks/usePvp'
import { useRivalHeroes } from '../hooks/useRivalHeroes'
import { useRaceDetail } from '../hooks/useRaceDetail'
import { playerNameOf } from '../utils/playerName'
import {
  distanceAwayLabel,
  estimateLabel,
  isLive,
  modeInfo,
  needCoinsLine,
  potSummary,
  raceEndedView,
  raceOutcome,
  recordLabel,
  statusChip,
  timeLeftLabel,
  winRateLabel,
} from '../utils/pvpCopy'
import { useNumberRollup } from '../game/ui/useNumberRollup'
import GameButton from '../game/ui/GameButton'
import StatChip from '../game/ui/StatChip'
import {
  ArenaEmptyArt,
  BackRow,
  Coin,
  RivalHero,
  StatusChip,
  StepRail,
  VsStage,
  YouFigure,
} from './pvp/PvpParts'
import './PvpPanel.css'

// The PvP arena, as a step-by-step flow:
//   hub → 1 distance → 2 rival (quick match | nearby) → 3 searching / stake →
//   4 race screen (accept, run, forfeit, result).
// Active races and history live on the hub and open the same race screen. A
// queue match (or an accepted challenge pop-up, via focusRaceId) jumps
// straight to its race screen. All state, APIs and stake rules are unchanged
// from the previous version - this file is presentation only (copy and the
// small pure helpers are in utils/pvpCopy.js).

// A nearby runner's hero, when the server sends one (heroName/heroId/heroColor).
const heroOfPlayer = (p) =>
  p?.heroName || p?.heroId
    ? { name: p.heroName, id: p.heroId, color: p.heroColor }
    : null

const modeLabel = (c) =>
  getPvpModeByMeters(c.distanceMeters)?.label || `${c.distanceMeters} m`

// Where a race stands for me, as one of four timeline steps.
function raceStep(c, side) {
  if (c.status === 'PENDING') return side.confirmed ? 1 : 0
  if (c.status === 'IN_PROGRESS') return side.myRunId ? 2 : 1
  return 3
}

const TIMELINE = ['Matched', 'Locked in', 'Run', 'Result']

// How long the searching screen shows "Rival found!" before the race.
const FOUND_FLASH_MS = 1500

// The rival's id in a challenge, whichever seat I'm in.
const rivalId = (c, userId) =>
  c.challengerId === userId ? c.opponentId : c.challengerId

function Notice({ children, tone = 'info' }) {
  return (
    <p
      className={`pvp-notice is-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <IconInfo />
      <span>{children}</span>
    </p>
  )
}

export default function PvpPanel({
  pvp,
  userId,
  balance,
  onStartRace,
  onForfeited,
  racing,
  focusRaceId,
  onFocusHandled,
  // Presentation wiring from GamePage (all optional):
  heroName,
  avatarSrc,
  playerName,
  heroCatalog,
  onClose,
  onGetCoins,
  onOpenSettings,
  // Starting a NEW match: GamePage checks Visibility + location first and
  // calls proceed() when the player is set (a live race gets in without them).
  onRequestStart,
}) {
  const [screen, setScreen] = useState('home')
  const [modeId, setModeId] = useState(null)
  const [raceId, setRaceId] = useState(null)
  // Nearby: the runner picked to challenge, and the stake being typed.
  const [target, setTarget] = useState(null)
  const [stake, setStake] = useState('')
  // Race id whose Forfeit button is waiting for the confirming second tap.
  const [confirmForfeitId, setConfirmForfeitId] = useState(null)
  const reduceMotion = useReducedMotion()

  const {
    challenges,
    challengesLoaded,
    queueEntry,
    nearby,
    discoverable,
    busy,
    error,
  } = pvp
  const mode = getPvpMode(modeId)
  const inQueue = queueEntry?.status === 'WAITING'
  const active = challenges.filter(isLive)
  const past = challenges.filter((c) => !isLive(c)).slice(0, 12)
  // The open race: the list/socket copy when there is one, otherwise (and
  // after a decline drops it from the list) straight from the server.
  const {
    race,
    phase: racePhase,
    retry: retryRace,
  } = useRaceDetail(
    raceId,
    raceId ? challenges.find((c) => c.id === raceId) : null
  )
  // Races I declined on this device (the server does not say who declined).
  const declinedByMe = useRef(new Set())
  const me = playerName || 'You'
  // Rival heroes come from each rival's public profile (the PvP responses don't
  // carry them). Most relevant rivals first - the hook caps how many it loads.
  const rivalIds = [
    target?.userId,
    queueEntry?.opponentId,
    race && mySide(race, userId).opponentId,
    ...active.map((c) => mySide(c, userId).opponentId),
    ...(nearby || []).map((p) => p.userId),
    ...past.map((c) => mySide(c, userId).opponentId),
  ]
  const rivalHeroes = useRivalHeroes(rivalIds)
  const heroFor = (id, fromServer) => fromServer || rivalHeroes[id] || null
  const heroLoading = (id, fromServer) =>
    !fromServer && Boolean(id) && rivalHeroes[id] === undefined

  function openRace(id) {
    setRaceId(id)
    setConfirmForfeitId(null)
    setScreen('race')
  }

  // Queue found a rival → flash "Rival found!" on the searching screen for
  // a beat, then open that race (while it still needs me).
  const matchedId =
    queueEntry?.status === 'MATCHED' ? queueEntry.matchedChallengeId : null
  useEffect(() => {
    if (!matchedId) return undefined
    const c = challenges.find((x) => x.id === matchedId)
    if (c && !(c.status === 'PENDING' && !mySide(c, userId).confirmed))
      return undefined
    if (!c) pvp.refreshChallenges()
    if (screen !== 'queue') {
      openRace(matchedId)
      return undefined
    }
    const go = setTimeout(() => openRace(matchedId), FOUND_FLASH_MS)
    return () => clearTimeout(go)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedId])

  // Accepted from the challenge pop-up → show that race (once).
  useEffect(() => {
    if (!focusRaceId) return
    openRace(focusRaceId)
    onFocusHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRaceId])

  // "Battle" / "Find a rival": go to the distance step - after the Visibility /
  // location check when GamePage supplies one.
  function beginNewMatch() {
    const go = () => setScreen('distance')
    if (onRequestStart) onRequestStart(go)
    else go()
  }

  function pickMode(id) {
    setModeId(id)
    setScreen('opponent')
  }

  async function startQuickMatch() {
    setScreen('queue')
    // Failed to join (e.g. not enough coins) → back a step, error shown.
    const entry = await pvp.joinQueue(modeId)
    if (!entry) setScreen('opponent')
  }

  async function cancelQueue() {
    await pvp.leaveQueue()
    setScreen('opponent')
  }

  function goNearby() {
    setTarget(null)
    setScreen('nearby')
    pvp.scanNearby()
  }

  function pickTarget(player) {
    setTarget(player)
    setStake(String(mode?.queueStake ?? 10))
  }

  async function sendChallenge(e) {
    e.preventDefault()
    const amount = Number(stake)
    if (!target || !Number.isInteger(amount) || amount < 1) return
    const created = await pvp.challengePlayer(target.userId, modeId, amount)
    if (created) {
      setTarget(null)
      openRace(created.id)
    }
  }

  // Rematch: the same rival, distance and stake, sent through the same direct
  // challenge call the nearby flow uses. If the server won't take it (the
  // rival isn't discoverable right now) the error shows on this screen.
  async function rematch(c) {
    const m = getPvpModeByMeters(c.distanceMeters)
    const id = rivalId(c, userId)
    if (!m || !id) {
      setScreen('distance')
      return
    }
    setModeId(m.id)
    const created = await pvp.challengePlayer(id, m.id, Number(c.stakeAmount))
    if (created) openRace(created.id)
  }

  async function forfeit(c) {
    if (confirmForfeitId !== c.id) {
      setConfirmForfeitId(c.id)
      return
    }
    const done = await pvp.forfeit(c)
    setConfirmForfeitId(null)
    if (done) onForfeited?.(done)
  }

  // Keep a focused field clear of the on-screen keyboard.
  const focusTimer = useRef(null)
  useEffect(() => () => clearTimeout(focusTimer.current), [])
  function keepInView(e) {
    const el = e.currentTarget
    clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(
      () => el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }),
      300
    )
  }

  const errorLine = error && <Notice tone="error">{error}</Notice>

  const queueScreen = screen === 'queue' || (inQueue && screen !== 'race')

  function goBack() {
    if (queueScreen) {
      if (inQueue) cancelQueue()
      else setScreen('opponent')
      return
    }
    if (screen === 'distance') setScreen('home')
    else if (screen === 'opponent') setScreen('distance')
    else if (screen === 'nearby') {
      if (target) setTarget(null)
      else setScreen('opponent')
    } else if (screen === 'race' || screen === 'history') setScreen('home')
    else onClose?.()
  }

  const youFigure = (size = 72) => (
    <YouFigure
      heroName={heroName}
      avatarSrc={avatarSrc}
      name={me}
      size={size}
    />
  )

  let step = null
  let key = screen
  let body = null

  // --- 3a. Searching (queue) ---
  if (queueScreen) {
    key = 'queue'
    step = 3
    const queuedMode = getPvpMode(queueEntry?.mode) || mode
    const expired = !inQueue && queueEntry?.status === 'EXPIRED'
    // Matched but the race screen hasn't taken over yet (race still loading).
    const found = !inQueue && queueEntry?.status === 'MATCHED'
    const matchedRace = found
      ? challenges.find((c) => c.id === queueEntry.matchedChallengeId)
      : null
    const matchedSide = matchedRace ? mySide(matchedRace, userId) : null
    const rivalName = matchedSide?.opponentName || ''
    body = (
      <>
        {found ? (
          <div className="pvp-found">
            <h2 className="pvp-screen-title pvp-display">Rival found!</h2>
            <VsStage
              you={youFigure(76)}
              rival={
                <RivalHero
                  hero={heroFor(
                    matchedSide?.opponentId,
                    matchedSide?.opponentHero
                  )}
                  loading={heroLoading(
                    matchedSide?.opponentId,
                    matchedSide?.opponentHero
                  )}
                  catalog={heroCatalog}
                  name={rivalName}
                  size={76}
                  unknown={!rivalName}
                />
              }
              youLabel={me}
              rivalLabel={rivalName || 'A rival'}
            />
            {queuedMode && (
              <p className="pvp-pot-line">
                <Coin />{' '}
                <span className="pvp-num">{queuedMode.queueStake * 2}</span> to
                the winner
              </p>
            )}
            <p className="pvp-sentence">Locking in the race…</p>
          </div>
        ) : (
          <div className="pvp-radar-wrap">
            <div
              className={`pvp-radar ${expired ? 'is-idle' : ''}`}
              role="img"
              aria-label={expired ? 'Search finished' : 'Searching for a rival'}
            >
              <span className="pvp-radar-sweep" />
              <span className="pvp-radar-ring" />
              <span className="pvp-radar-ring is-2" />
              <span className="pvp-radar-core">
                <IconSwords />
              </span>
            </div>
            <h2 className="pvp-screen-title pvp-display">
              {expired
                ? 'No rival found'
                : inQueue
                  ? 'Finding a rival…'
                  : 'Joining the search…'}
            </h2>
            <p className="pvp-sentence">
              {expired
                ? 'Nobody was free this time. Try again, or challenge someone nearby.'
                : 'Hang tight. We will start the race as soon as someone joins.'}
            </p>
            {queuedMode && (
              <p className="pvp-pot-line">
                <span className="pvp-num">{queuedMode.label}</span>
                <span aria-hidden="true">·</span>
                <Coin />{' '}
                <span className="pvp-num">{queuedMode.queueStake}</span> each
                <span aria-hidden="true">·</span>
                Winner takes the pot
              </p>
            )}
          </div>
        )}
        {found ? (
          <GameButton
            variant="success"
            size="lg"
            className="g-full-width"
            onClick={() => openRace(queueEntry.matchedChallengeId)}
            disabled={!queueEntry.matchedChallengeId}
          >
            Go to the race
          </GameButton>
        ) : expired ? (
          <div className="pvp-actions-col">
            <GameButton
              variant="success"
              size="lg"
              className="g-full-width"
              onClick={startQuickMatch}
              loading={busy === 'queue'}
              disabled={!mode}
            >
              Try again
            </GameButton>
            <GameButton
              variant="secondary"
              size="lg"
              className="g-full-width"
              onClick={goNearby}
              disabled={!mode}
            >
              Challenge someone nearby
            </GameButton>
          </div>
        ) : (
          <GameButton
            variant="secondary"
            size="lg"
            className="g-full-width"
            onClick={cancelQueue}
            disabled={busy === 'queue'}
          >
            Cancel search
          </GameButton>
        )}
        {errorLine}
      </>
    )
  }

  // --- 1. Distance ---
  else if (screen === 'distance') {
    step = 1
    body = (
      <>
        <h2 className="pvp-screen-title pvp-display">Pick a distance</h2>
        <p className="pvp-sentence">Longer races mean bigger pots.</p>
        <div className="pvp-choice-list">
          {PVP_MODES.map((m) => {
            const info = modeInfo(m.id)
            const selected = modeId === m.id
            return (
              <button
                key={m.id}
                type="button"
                className={`pvp-tier is-${info.tier}${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => pickMode(m.id)}
              >
                <span className="pvp-tier-badge pvp-display pvp-num">
                  {m.label}
                </span>
                <span className="pvp-tier-body">
                  <span className="pvp-tier-name pvp-display">{info.tag}</span>
                  <span className="pvp-tier-pitch">{info.pitch}</span>
                  <span className="pvp-tier-meta">
                    <span className="pvp-tier-fact">
                      <Coin /> <span className="pvp-num">{m.queueStake}</span>{' '}
                      stake
                    </span>
                    <span className="pvp-tier-fact">
                      <IconClock /> {estimateLabel(info.estMinutes)}
                    </span>
                  </span>
                </span>
                <IconChevronRight className="pvp-tier-go" />
              </button>
            )
          })}
        </div>
      </>
    )
  }

  // --- 2. Rival ---
  else if (screen === 'opponent' && mode) {
    step = 2
    const short = balance < mode.queueStake
    const info = modeInfo(mode.id)
    body = (
      <>
        <h2 className="pvp-screen-title pvp-display">Choose your rival</h2>
        <p className="pvp-picked">
          <span className={`pvp-picked-chip is-${info.tier} pvp-num`}>
            {mode.label}
          </span>
          <span>
            {info.tag} · {estimateLabel(info.estMinutes)}
          </span>
        </p>
        <div className="pvp-choice-list">
          {short ? (
            <div className="pvp-option is-locked" aria-disabled="true">
              <span className="pvp-option-icon">
                <IconLock />
              </span>
              <span className="pvp-option-body">
                <span className="pvp-option-title pvp-display">
                  Quick Match
                </span>
                <span className="pvp-option-line">
                  Any runner, matched for you.
                </span>
                <span className="pvp-option-need">
                  <Coin /> {needCoinsLine(mode.queueStake, balance)}
                </span>
                {onGetCoins && (
                  <GameButton
                    variant="success"
                    size="sm"
                    className="pvp-get-coins"
                    onClick={onGetCoins}
                  >
                    Get Fahhcoin
                  </GameButton>
                )}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="pvp-option"
              onClick={startQuickMatch}
              disabled={busy === 'queue'}
            >
              <span className="pvp-option-icon">
                <IconBolt />
              </span>
              <span className="pvp-option-body">
                <span className="pvp-option-title pvp-display">
                  Quick Match
                </span>
                <span className="pvp-option-line">
                  Any runner, matched for you.
                </span>
                <span className="pvp-option-meta">
                  Each of you stakes <Coin />{' '}
                  <span className="pvp-num">{mode.queueStake}</span>
                </span>
              </span>
              <IconChevronRight className="pvp-tier-go" />
            </button>
          )}
          <button type="button" className="pvp-option" onClick={goNearby}>
            <span className="pvp-option-icon">
              <IconCrosshairs />
            </span>
            <span className="pvp-option-body">
              <span className="pvp-option-title pvp-display">
                Challenge nearby
              </span>
              <span className="pvp-option-line">
                Call out a runner around you and set your own stake.
              </span>
            </span>
            <IconChevronRight className="pvp-tier-go" />
          </button>
        </div>
        {!discoverable && (
          <Notice>
            Tip: turn on Visibility in Settings so other runners can find you
            too.
          </Notice>
        )}
        {errorLine}
      </>
    )
  }

  // --- 3b. Pick a nearby runner, then the stake ---
  else if (screen === 'nearby' && mode) {
    const amount = Number(stake)
    const pot = potSummary(stake)
    const tooMuch = pot && amount > balance
    const stepSize = Math.max(5, Math.round(mode.queueStake / 2))
    const bump = (d) =>
      setStake(String(Math.max(1, (Number.isFinite(amount) ? amount : 0) + d)))
    if (target) {
      key = 'stake'
      step = 3
      body = (
        <form className="pvp-stake" onSubmit={sendChallenge}>
          <h2 className="pvp-screen-title pvp-display">Set the stake</h2>
          <VsStage
            compact
            you={youFigure(56)}
            rival={
              <RivalHero
                hero={heroFor(target.userId, heroOfPlayer(target))}
                loading={heroLoading(target.userId, heroOfPlayer(target))}
                catalog={heroCatalog}
                name={playerNameOf(target)}
                src={resolveFileUrl(target.profilePictureUrl)}
                size={56}
              />
            }
            youLabel={me}
            rivalLabel={playerNameOf(target)}
          />
          <p className="pvp-sentence">
            {mode.label} race. Each of you puts in the same amount.
          </p>
          <div className="pvp-stepper">
            <button
              type="button"
              className="pvp-step-btn"
              onClick={() => bump(-stepSize)}
              aria-label={`Lower the stake by ${stepSize}`}
              disabled={amount <= 1}
            >
              <IconMinus />
            </button>
            <label className="pvp-stake-field">
              <Coin />
              <input
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                max={balance || undefined}
                className="pvp-stake-input pvp-display pvp-num"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                onFocus={keepInView}
                aria-label="Your stake in Fahhcoin"
              />
            </label>
            <button
              type="button"
              className="pvp-step-btn"
              onClick={() => bump(stepSize)}
              aria-label={`Raise the stake by ${stepSize}`}
              disabled={balance > 0 && amount >= balance}
            >
              <IconPlus />
            </button>
          </div>
          <div className="pvp-chips" role="group" aria-label="Quick stakes">
            {[1, 2, 5]
              .map((m) => mode.queueStake * m)
              .filter((v) => v <= balance)
              .map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`pvp-stake-chip${amount === v ? ' is-on' : ''}`}
                  onClick={() => setStake(String(v))}
                >
                  <Coin /> <span className="pvp-num">{v}</span>
                </button>
              ))}
          </div>
          <div className="pvp-pot">
            {pot ? (
              <>
                <span>
                  You stake <Coin /> <b className="pvp-num">{pot.stake}</b>
                </span>
                <span className="pvp-pot-win">
                  Winner takes <Coin /> <b className="pvp-num">{pot.pot}</b>
                </span>
              </>
            ) : (
              <span>Enter a whole number of coins.</span>
            )}
          </div>
          <p className={`pvp-have${tooMuch ? ' is-short' : ''}`}>
            {tooMuch ? (
              <>
                You only have <span className="pvp-num">{balance}</span> coins.
              </>
            ) : (
              <>
                You have <span className="pvp-num">{balance}</span> coins.
              </>
            )}
          </p>
          <GameButton
            type="submit"
            variant="success"
            size="lg"
            className="g-full-width"
            loading={busy === `challenge-${target.userId}`}
            disabled={!pot || amount > balance}
          >
            Send challenge
          </GameButton>
          {errorLine}
        </form>
      )
    } else {
      step = 2
      body = (
        <>
          <h2 className="pvp-screen-title pvp-display">Runners near you</h2>
          {busy === 'nearby' && !nearby ? (
            <p className="pvp-sentence">Looking around…</p>
          ) : !nearby || nearby.length === 0 ? (
            <div className="pvp-empty">
              <ArenaEmptyArt />
              <h3 className="pvp-empty-title pvp-display">
                Nobody nearby right now
              </h3>
              <p className="pvp-sentence">
                {discoverable
                  ? 'Try again in a moment, or use Quick Match.'
                  : 'Runners can only find each other when Visibility is on. Turn it on in Settings, then scan again.'}
              </p>
              {!discoverable && onOpenSettings && (
                <GameButton
                  variant="secondary"
                  size="sm"
                  className="pvp-empty-btn"
                  onClick={onOpenSettings}
                >
                  Open Settings
                </GameButton>
              )}
            </div>
          ) : (
            <ul className="pvp-rival-list">
              {nearby.map((p) => (
                <li key={p.userId}>
                  <button
                    type="button"
                    className="pvp-rival"
                    onClick={() => pickTarget(p)}
                  >
                    <RivalHero
                      hero={heroFor(p.userId, heroOfPlayer(p))}
                      loading={heroLoading(p.userId, heroOfPlayer(p))}
                      catalog={heroCatalog}
                      name={playerNameOf(p)}
                      src={resolveFileUrl(p.profilePictureUrl)}
                      size={34}
                      photoFallback
                    />
                    <span className="pvp-rival-info">
                      <span className="pvp-rival-name pvp-display">
                        {playerNameOf(p)}
                      </span>
                      <span className="pvp-rival-meta">
                        {p.level != null && (
                          <span className="pvp-level pvp-num">
                            Lv {p.level}
                          </span>
                        )}
                        <span>{distanceAwayLabel(p.distanceMeters)}</span>
                      </span>
                    </span>
                    <span className="pvp-rival-go">Challenge</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <GameButton
            variant="secondary"
            size="lg"
            className="g-full-width"
            onClick={pvp.scanNearby}
            loading={busy === 'nearby'}
          >
            Scan again
          </GameButton>
          {errorLine}
        </>
      )
    }
  }

  // --- 4. Race screen ---
  else if (screen === 'race') {
    step = 4
    const ended = race
      ? raceEndedView(race, {
          userId,
          rivalName: mySide(race, userId).opponentName,
          declinedByMe: declinedByMe.current.has(race.id) ? true : undefined,
        })
      : null
    if (!race) {
      body = (
        <>
          <h2 className="pvp-screen-title pvp-display">Your race</h2>
          {racePhase === 'loading' && (
            <p className="pvp-sentence" role="status">
              Loading the match…
            </p>
          )}
          {racePhase === 'notfound' && (
            <>
              <Notice tone="error">
                We could not find that race. It may have been removed.
              </Notice>
              <div className="pvp-actions-col">
                <GameButton
                  variant="primary"
                  size="lg"
                  className="g-full-width"
                  onClick={beginNewMatch}
                >
                  Find a rival
                </GameButton>
                <GameButton
                  variant="secondary"
                  size="lg"
                  className="g-full-width"
                  onClick={() => setScreen('home')}
                >
                  Back to PvP
                </GameButton>
              </div>
            </>
          )}
          {racePhase === 'error' && (
            <>
              <Notice tone="error">
                Could not load this race. Check your connection and try again.
              </Notice>
              <div className="pvp-actions-col">
                <GameButton
                  variant="primary"
                  size="lg"
                  className="g-full-width"
                  onClick={retryRace}
                >
                  Retry
                </GameButton>
                <GameButton
                  variant="secondary"
                  size="lg"
                  className="g-full-width"
                  onClick={() => setScreen('home')}
                >
                  Back to PvP
                </GameButton>
              </div>
            </>
          )}
        </>
      )
    } else if (ended) {
      const rivalName = mySide(race, userId).opponentName
      const rivalHero = mySide(race, userId).opponentHero
      const rid = mySide(race, userId).opponentId
      body = (
        <>
          <div className={`pvp-ended is-${ended.kind}`} data-testid="pvp-ended">
            <span className="pvp-ended-icon" aria-hidden="true">
              {ended.kind === 'expired' ? <IconClock /> : <IconClose />}
            </span>
            <h2 className="pvp-screen-title pvp-display">{ended.title}</h2>
            <p className="pvp-sentence is-strong">{ended.message}</p>
            {ended.kind === 'declined' && rid && (
              <RivalHero
                hero={heroFor(rid, rivalHero)}
                loading={heroLoading(rid, rivalHero)}
                catalog={heroCatalog}
                name={rivalName || 'Rival'}
                size={56}
              />
            )}
          </div>
          <div className="pvp-actions-col">
            <GameButton
              variant="primary"
              size="lg"
              className="g-full-width"
              onClick={beginNewMatch}
            >
              Find another rival
            </GameButton>
            <GameButton
              variant="secondary"
              size="lg"
              className="g-full-width"
              onClick={() => setScreen('home')}
            >
              Back to PvP
            </GameButton>
          </div>
        </>
      )
    } else {
      const side = mySide(race, userId)
      const needsMyOk = race.status === 'PENDING' && !side.confirmed
      const canRun = race.status === 'IN_PROGRESS' && !side.myRunId
      const done = !isLive(race)
      const tl = raceStep(race, side)
      const outcome = raceOutcome(race, userId)
      const rival = side.opponentName || 'A rival'
      const note = needsMyOk
        ? race.source === 'QUEUE'
          ? 'Rival found! Accept to lock in your stake.'
          : `${rival} wants to race you.`
        : race.status === 'PENDING'
          ? `Waiting for ${rival} to accept…`
          : canRun
            ? `Stakes are locked. Run ${modeLabel(race)} before time runs out. The fastest runner wins.`
            : race.status === 'IN_PROGRESS'
              ? side.theirRunId
                ? 'Both runs are in. Results are coming…'
                : `Your run is in. Waiting for ${rival}…`
              : null
      body = (
        <>
          {done ? (
            <ResultHero outcome={outcome} />
          ) : (
            <h2 className="pvp-screen-title pvp-display">Your race</h2>
          )}
          <VsStage
            you={youFigure(done ? 56 : 68)}
            rival={
              <RivalHero
                hero={heroFor(side.opponentId, side.opponentHero)}
                loading={heroLoading(side.opponentId, side.opponentHero)}
                catalog={heroCatalog}
                name={rival}
                size={done ? 56 : 68}
              />
            }
            youLabel={me}
            rivalLabel={rival}
            compact={done}
          />
          <div className="pvp-terms">
            <span className="pvp-term">
              <span className="pvp-term-label">Distance</span>
              <span className="pvp-term-value pvp-display pvp-num">
                {modeLabel(race)}
              </span>
            </span>
            <span className="pvp-term">
              <span className="pvp-term-label">Pot</span>
              <span className="pvp-term-value pvp-display pvp-num">
                <Coin /> {race.stakeAmount * 2}
              </span>
            </span>
            {!done && (
              <span className="pvp-term">
                <span className="pvp-term-label">Time left</span>
                <span className="pvp-term-value pvp-display pvp-num">
                  {timeLeftLabel(race.expiresAt) || '-'}
                </span>
              </span>
            )}
          </div>

          {!done && (
            <ol className="pvp-timeline">
              {TIMELINE.map((label, i) => (
                <li
                  key={label}
                  className={`${i < tl ? 'is-done' : ''} ${i === tl ? 'is-now' : ''}`}
                >
                  <span className="pvp-timeline-dot" />
                  {label}
                </li>
              ))}
            </ol>
          )}

          {!done && note && <p className="pvp-sentence is-strong">{note}</p>}

          <div className="pvp-actions-col">
            {needsMyOk && (
              <>
                <GameButton
                  variant="success"
                  size="lg"
                  className="g-full-width"
                  onClick={() => pvp.review(race, true)}
                  loading={busy === `review-${race.id}`}
                >
                  Accept and lock stake
                </GameButton>
                <GameButton
                  variant="danger"
                  size="lg"
                  className="g-full-width"
                  onClick={() => {
                    declinedByMe.current.add(race.id)
                    pvp.review(race, false)
                  }}
                  disabled={busy === `review-${race.id}`}
                >
                  Decline
                </GameButton>
              </>
            )}
            {race.status === 'PENDING' && !needsMyOk && (
              <GameButton
                variant="secondary"
                size="lg"
                className="g-full-width"
                onClick={() => pvp.cancel(race)}
                loading={busy === `cancel-${race.id}`}
              >
                Cancel challenge
              </GameButton>
            )}
            {canRun && (
              <>
                <GameButton
                  variant="success"
                  size="lg"
                  className="g-full-width pvp-run-btn"
                  icon={<IconRunning />}
                  onClick={() => onStartRace(race)}
                  disabled={racing}
                >
                  {racing ? 'Run in progress' : 'Start the race'}
                </GameButton>
                {/* Concede: only while live and my run isn't in (server
                    rule), not mid-run. Two taps. */}
                <GameButton
                  variant="danger"
                  size="lg"
                  className={`g-full-width pvp-forfeit-btn${confirmForfeitId === race.id ? ' is-confirming' : ''}`}
                  icon={<IconFlag />}
                  onClick={() => forfeit(race)}
                  onBlur={() =>
                    setConfirmForfeitId((id) => (id === race.id ? null : id))
                  }
                  loading={busy === `forfeit-${race.id}`}
                  disabled={racing}
                >
                  {confirmForfeitId === race.id ? (
                    <>
                      Give up <Coin /> {race.stakeAmount}?
                    </>
                  ) : (
                    'Forfeit'
                  )}
                </GameButton>
              </>
            )}
            {done && (
              <>
                {['win', 'loss', 'draw'].includes(outcome.kind) && (
                  <GameButton
                    variant="success"
                    size="lg"
                    className="g-full-width"
                    onClick={() => rematch(race)}
                    loading={busy === `challenge-${rivalId(race, userId)}`}
                  >
                    Rematch
                  </GameButton>
                )}
                <GameButton
                  variant="secondary"
                  size="lg"
                  className="g-full-width"
                  onClick={() => setScreen('home')}
                >
                  Done
                </GameButton>
              </>
            )}
          </div>
          {errorLine}
        </>
      )
    }
  }

  // --- History ---
  else if (screen === 'history') {
    body = (
      <>
        <h2 className="pvp-screen-title pvp-display">Race history</h2>
        {past.length === 0 ? (
          <p className="pvp-sentence">No finished races yet.</p>
        ) : (
          <ul className="pvp-rival-list">
            {past.map((c) => (
              <li key={c.id}>
                <PastRaceRow
                  c={c}
                  userId={userId}
                  onOpen={openRace}
                  heroCatalog={heroCatalog}
                  rivalHeroes={rivalHeroes}
                />
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  // --- Hub ---
  else {
    // Real record, computed from actual match history - the backend has no
    // rank/rating system, so this shows the one thing that IS real: how the
    // player has actually done. A race only counts once it was played out
    // (resolutionType set); declined/cancelled/expired ones never ran.
    const played = challenges.filter((c) => c.resolutionType)
    const wins = played.filter((c) => c.winnerId === userId).length
    const losses = played.filter(
      (c) => c.winnerId && c.winnerId !== userId
    ).length
    const draws = played.length - wins - losses
    // The next rival = the opponent of the race that is due soonest (not yet
    // finished); nobody yet -> the "?" silhouette, as before.
    const nextRival = [...active]
      .filter((c) => c.status === 'PENDING' || c.status === 'IN_PROGRESS')
      .sort(
        (a, b) =>
          new Date(a.expiresAt || 8.64e15) - new Date(b.expiresAt || 8.64e15)
      )
      .map((c) => mySide(c, userId))
      .find((side) => side.opponentName)
    body = (
      <>
        <section className="pvp-banner" aria-label="You against a rival">
          <VsStage
            you={youFigure(72)}
            rival={
              <RivalHero
                hero={heroFor(nextRival?.opponentId, nextRival?.opponentHero)}
                loading={heroLoading(
                  nextRival?.opponentId,
                  nextRival?.opponentHero
                )}
                catalog={heroCatalog}
                name={nextRival?.opponentName}
                size={72}
                unknown={!nextRival}
              />
            }
            youLabel={me}
            rivalLabel={nextRival?.opponentName || 'Your next rival'}
          />
          <p className="pvp-sentence">
            Pick a distance, find a rival. The fastest runner takes the pot.
          </p>
        </section>

        <div className="pvp-stats">
          <StatChip
            icon={<IconTrophy />}
            label="Record"
            value={recordLabel(wins, losses, draws)}
          />
          <StatChip
            icon={<IconBolt />}
            label="Win rate"
            value={winRateLabel(wins, played.length)}
            muted={played.length === 0}
          />
          <StatChip
            icon={<IconRunning />}
            label="Races"
            value={played.length}
          />
        </div>

        <section className="pvp-section">
          <h2 className="pvp-section-title pvp-display">Active races</h2>
          {!challengesLoaded ? (
            <p className="pvp-sentence">Loading races…</p>
          ) : active.length === 0 ? (
            <div className="pvp-empty">
              <ArenaEmptyArt />
              <h3 className="pvp-empty-title pvp-display">
                No races on right now
              </h3>
              <p className="pvp-sentence">
                Challenge a runner and settle it on the road.
              </p>
              <GameButton
                variant="secondary"
                size="sm"
                className="pvp-empty-btn"
                onClick={beginNewMatch}
              >
                Find a rival
              </GameButton>
            </div>
          ) : (
            <ul className="pvp-rival-list">
              {active.map((c) => {
                const side = mySide(c, userId)
                const needsMe =
                  (c.status === 'PENDING' && !side.confirmed) ||
                  (c.status === 'IN_PROGRESS' && !side.myRunId)
                const chip = statusChip(c, needsMe)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`pvp-rival pvp-race${needsMe ? ' needs-me' : ''}`}
                      onClick={() => openRace(c.id)}
                    >
                      <RivalHero
                        hero={heroFor(side.opponentId, side.opponentHero)}
                        loading={heroLoading(
                          side.opponentId,
                          side.opponentHero
                        )}
                        catalog={heroCatalog}
                        name={side.opponentName || 'Rival'}
                        size={34}
                        photoFallback
                      />
                      <span className="pvp-rival-info">
                        <span className="pvp-rival-name pvp-display">
                          vs {side.opponentName || 'a rival'}
                        </span>
                        <span className="pvp-rival-meta">
                          <span className="pvp-num">{modeLabel(c)}</span>
                          <span>
                            <Coin />{' '}
                            <span className="pvp-num">{c.stakeAmount * 2}</span>{' '}
                            pot
                          </span>
                          <span>{timeLeftLabel(c.expiresAt)}</span>
                        </span>
                      </span>
                      <StatusChip label={chip.label} tone={chip.tone} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="pvp-section">
            <div className="pvp-section-head">
              <h2 className="pvp-section-title pvp-display">Recent races</h2>
              <button
                type="button"
                className="pvp-link"
                onClick={() => setScreen('history')}
              >
                View all ({past.length}) <IconChevronRight />
              </button>
            </div>
            <ul className="pvp-rival-list">
              {past.slice(0, 3).map((c) => (
                <li key={c.id}>
                  <PastRaceRow
                    c={c}
                    userId={userId}
                    onOpen={openRace}
                    heroCatalog={heroCatalog}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {errorLine}
      </>
    )
  }

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.18, ease: 'easeOut' },
      }

  const isHub =
    !queueScreen &&
    !['distance', 'opponent', 'nearby', 'race', 'history'].includes(screen)

  return (
    <div className={`pvp-arena${isHub ? ' has-cta' : ''}`}>
      {!isHub && <BackRow onBack={goBack} />}
      {step != null && <StepRail step={step} />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} className="pvp-screen" {...motionProps}>
          {body}
        </motion.div>
      </AnimatePresence>
      {isHub && (
        <div className="pvp-cta-bar">
          <GameButton
            variant="success"
            size="lg"
            className="g-full-width pvp-battle-btn"
            icon={<IconSwords />}
            onClick={beginNewMatch}
          >
            Battle
          </GameButton>
        </div>
      )}
    </div>
  )
}

// One finished race: rival, distance, the outcome chip and the coins it moved.
function PastRaceRow({ c, userId, onOpen, heroCatalog, rivalHeroes }) {
  const side = mySide(c, userId)
  const o = raceOutcome(c, userId)
  return (
    <button type="button" className="pvp-rival" onClick={() => onOpen(c.id)}>
      <RivalHero
        hero={side.opponentHero || rivalHeroes?.[side.opponentId] || null}
        loading={
          !side.opponentHero &&
          Boolean(side.opponentId) &&
          rivalHeroes?.[side.opponentId] === undefined
        }
        catalog={heroCatalog}
        name={side.opponentName || 'Rival'}
        size={34}
        photoFallback
      />
      <span className="pvp-rival-info">
        <span className="pvp-rival-name pvp-display">
          vs {side.opponentName || 'a rival'}
        </span>
        <span className="pvp-rival-meta">
          <span className="pvp-num">{modeLabel(c)}</span>
          {o.detail && <span>{o.detail}</span>}
        </span>
      </span>
      <span className="pvp-past-end">
        <span className={`pvp-outcome is-${o.kind}`}>{o.headline}</span>
        {o.coins !== 0 && (
          <span className={`pvp-delta ${o.coins > 0 ? 'is-plus' : 'is-minus'}`}>
            {o.coins > 0 ? '+' : '−'}
            <span className="pvp-num">{Math.abs(o.coins)}</span> <Coin />
          </span>
        )}
      </span>
    </button>
  )
}

// Result banner: Victory / Defeat / Draw ribbon and the payout counting up.
function ResultHero({ outcome }) {
  const coins = Math.abs(outcome.coins)
  // Count up from 0 to the payout shortly after arriving (the hook skips its
  // animation on first mount, so it mounts at 0 and is moved once).
  const [target, setTarget] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setTarget(coins), 250)
    return () => clearTimeout(id)
  }, [coins])
  const counted = useNumberRollup(target, { duration: 700 })
  return (
    <div className={`pvp-result is-${outcome.kind}`}>
      <h2 className="pvp-result-ribbon pvp-display">{outcome.headline}</h2>
      {outcome.detail && <p className="pvp-sentence">{outcome.detail}</p>}
      {outcome.coins !== 0 && (
        <p className="pvp-payout">
          <span className={outcome.coins > 0 ? 'is-plus' : 'is-minus'}>
            {outcome.coins > 0 ? '+' : '−'}
            <CoinAmount className="pvp-num" value={counted} />
          </span>{' '}
          <Coin />
        </p>
      )}
      {outcome.coins === 0 && outcome.kind === 'draw' && (
        <p className="pvp-sentence is-strong">Your coins were returned.</p>
      )}
    </div>
  )
}
