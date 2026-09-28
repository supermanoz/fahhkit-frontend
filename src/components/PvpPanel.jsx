/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import {
  IconBolt,
  IconChevronLeft,
  IconChevronRight,
  IconCrosshairs,
  IconFlag,
  IconRunning,
  IconSwords,
} from './GameIcons'
import { PVP_MODES, getPvpMode, getPvpModeByMeters } from '../api/pvp'
import { mySide } from '../hooks/usePvp'
import { playerNameOf } from '../utils/playerName'
import './PvpPanel.css'

// PvP tab as a step-by-step flow instead of one cluttered page:
//   home → 1 distance → 2 opponent (quick match | nearby) → 3 searching /
//   pick a runner → 4 race screen (confirm, run, forfeit, result).
// Active races and history live on the home screen and open the same race
// screen. A queue match (or an accepted challenge prompt, via focusRaceId)
// jumps straight to its race screen.

const MODE_FLAVOR = {
  FIVE_HUNDRED_M: { tag: 'Sprint', line: 'All-out dash. Blink and it’s over.' },
  ONE_KM: { tag: 'Classic', line: 'The sweet spot - fast but tactical.' },
  FIVE_KM: { tag: 'Endurance', line: 'Pace yourself. Legends are made here.' },
}

const RESOLUTION_COPY = {
  WIN_BY_TIME: 'on time',
  WIN_BY_FORFEIT: 'by forfeit',
  MUTUAL_FORFEIT_REFUND: 'nobody finished, stakes refunded',
  TIE_REFUND: 'dead heat, stakes refunded',
}

// The game's gold coin (same face as the HUD's), inline with text.
function Coin() {
  return <span className="game-coin pvp-coin" aria-label="Fahhcoin" />
}

function modeLabel(challenge) {
  return (
    getPvpModeByMeters(challenge.distanceMeters)?.label ||
    `${challenge.distanceMeters} m`
  )
}

function timeLeft(expiresAt) {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return 'expiring'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min left`
  const hours = Math.floor(mins / 60)
  return hours < 24 ? `${hours} h left` : `${Math.floor(hours / 24)} d left`
}

function resultLine(challenge, userId) {
  if (challenge.status === 'DECLINED') return 'Declined'
  if (challenge.status === 'CANCELLED') return 'Cancelled'
  if (challenge.status === 'EXPIRED') return 'Expired'
  const how = RESOLUTION_COPY[challenge.resolutionType] || ''
  if (!challenge.winnerId) return how ? `Draw · ${how}` : 'Draw'
  // Winner is paid the whole pot (both stakes), so net it's +stake.
  const won = challenge.winnerId === userId
  return (
    <>
      {won ? `Won ${how} · +` : `Lost ${how} · −`}
      {challenge.stakeAmount} <Coin />
    </>
  )
}

const isLive = (c) => c.status === 'PENDING' || c.status === 'IN_PROGRESS'

// Where a race stands for me, as one of four timeline steps.
function raceStep(c, side) {
  if (c.status === 'PENDING') return side.confirmed ? 1 : 0
  if (c.status === 'IN_PROGRESS') return side.myRunId ? 2 : 1
  return 3
}

const TIMELINE = ['Matched', 'Locked in', 'Run', 'Result']

// How long the searching screen shows "Rival found!" before the race.
const FOUND_FLASH_MS = 1500

// Back button + title, with step dots for the four flow steps.
function StepHeader({ title, step, onBack }) {
  return (
    <div className="pvp-step-head">
      <button
        type="button"
        className="pvp-back"
        onClick={onBack}
        aria-label="Back"
      >
        <IconChevronLeft />
      </button>
      <span className="pvp-step-title">{title}</span>
      {step != null && (
        <span className="pvp-step-dots" aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={`pvp-step-dot ${n <= step ? 'is-done' : ''}`}
            />
          ))}
        </span>
      )}
    </div>
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
}) {
  const [screen, setScreen] = useState('home')
  const [modeId, setModeId] = useState(null)
  const [raceId, setRaceId] = useState(null)
  // Nearby: the runner picked to challenge, and the stake being typed.
  const [target, setTarget] = useState(null)
  const [stake, setStake] = useState('')
  // Race id whose Forfeit button is waiting for the confirming second tap.
  const [confirmForfeitId, setConfirmForfeitId] = useState(null)

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
  const race = raceId ? challenges.find((c) => c.id === raceId) : null

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

  async function forfeit(c) {
    if (confirmForfeitId !== c.id) {
      setConfirmForfeitId(c.id)
      return
    }
    const done = await pvp.forfeit(c)
    setConfirmForfeitId(null)
    if (done) onForfeited?.(done)
  }

  const errorLine = error && (
    <p className="game-controls-hint game-controls-hint-error">{error}</p>
  )

  // --- 3a. Searching (queue) ---
  if (screen === 'queue' || (inQueue && screen !== 'race')) {
    const queuedMode = getPvpMode(queueEntry?.mode) || mode
    const expired = !inQueue && queueEntry?.status === 'EXPIRED'
    // Matched but the race screen hasn't taken over yet (race still loading).
    const found = !inQueue && queueEntry?.status === 'MATCHED'
    return (
      <div className="pvp-flow">
        <StepHeader
          title={
            expired
              ? 'No rival found'
              : found
                ? 'Rival found!'
                : 'Finding a rival'
          }
          step={3}
          onBack={inQueue ? cancelQueue : () => setScreen('opponent')}
        />
        <div className="pvp-radar-wrap">
          <div
            className={`pvp-radar ${expired ? 'is-idle' : ''} ${found ? 'is-found' : ''}`}
          >
            <span className="pvp-radar-sweep" />
            <span className="pvp-radar-ring" />
            <span className="pvp-radar-ring is-2" />
            <span className="pvp-radar-core">
              <IconSwords />
            </span>
          </div>
          <p className="pvp-big-line">
            {expired
              ? 'Nobody bit this time.'
              : found
                ? 'Rival locked on - loading the race…'
                : inQueue
                  ? 'Scanning for runners…'
                  : 'Joining the queue…'}
          </p>
          {queuedMode && (
            <p className="pvp-sub-line">
              {queuedMode.label} · {queuedMode.queueStake} <Coin /> each ·
              winner takes the pot
            </p>
          )}
        </div>
        {found ? (
          <button
            type="button"
            className="game-btn game-btn-green game-btn-lg"
            onClick={() => openRace(queueEntry.matchedChallengeId)}
            disabled={!queueEntry.matchedChallengeId}
          >
            Go to Race
          </button>
        ) : expired ? (
          <div className="pvp-actions-col">
            <button
              type="button"
              className="game-btn game-btn-green game-btn-lg"
              onClick={startQuickMatch}
              disabled={busy === 'queue' || !mode}
            >
              Try Again
            </button>
            <button
              type="button"
              className="game-btn game-btn-wood"
              onClick={goNearby}
              disabled={!mode}
            >
              Challenge Someone Nearby
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="game-btn game-btn-red"
            onClick={cancelQueue}
            disabled={busy === 'queue'}
          >
            Cancel Search
          </button>
        )}
        {errorLine}
      </div>
    )
  }

  // --- 1. Distance ---
  if (screen === 'distance') {
    return (
      <div className="pvp-flow">
        <StepHeader
          title="Pick a distance"
          step={1}
          onBack={() => setScreen('home')}
        />
        <div className="pvp-choice-list">
          {PVP_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pvp-choice pvp-mode-${m.id}`}
              onClick={() => pickMode(m.id)}
            >
              <span className="pvp-choice-big">{m.label}</span>
              <span className="pvp-choice-body">
                <span className="pvp-choice-title">
                  {MODE_FLAVOR[m.id]?.tag}
                </span>
                <span className="pvp-choice-line">
                  {MODE_FLAVOR[m.id]?.line}
                </span>
                <span className="pvp-choice-meta">
                  Quick match stake {m.queueStake} <Coin />
                </span>
              </span>
              <IconChevronRight />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // --- 2. Opponent ---
  if (screen === 'opponent' && mode) {
    const short = balance < mode.queueStake
    return (
      <div className="pvp-flow">
        <StepHeader
          title="Choose your rival"
          step={2}
          onBack={() => setScreen('distance')}
        />
        <p className="pvp-picked">
          <span className="pvp-picked-chip">{mode.label}</span>
          {MODE_FLAVOR[mode.id]?.tag}
        </p>
        <div className="pvp-choice-list">
          <button
            type="button"
            className="pvp-choice"
            onClick={startQuickMatch}
            disabled={short || busy === 'queue'}
          >
            <span className="pvp-choice-icon tone-gold">
              <IconBolt />
            </span>
            <span className="pvp-choice-body">
              <span className="pvp-choice-title">Quick Match</span>
              <span className="pvp-choice-line">
                Any runner out there, paired automatically.
              </span>
              <span className="pvp-choice-meta">
                {short ? (
                  <>
                    Need {mode.queueStake} <Coin /> - you have {balance}
                  </>
                ) : (
                  <>
                    Stake {mode.queueStake} <Coin /> each
                  </>
                )}
              </span>
            </span>
            <IconChevronRight />
          </button>
          <button type="button" className="pvp-choice" onClick={goNearby}>
            <span className="pvp-choice-icon tone-red">
              <IconCrosshairs />
            </span>
            <span className="pvp-choice-body">
              <span className="pvp-choice-title">Challenge Nearby</span>
              <span className="pvp-choice-line">
                Call out someone around you and set your own stake.
              </span>
              {!discoverable && (
                <span className="pvp-choice-meta">
                  Tip: turn on Visibility in Settings so they can find you too.
                </span>
              )}
            </span>
            <IconChevronRight />
          </button>
        </div>
        {errorLine}
      </div>
    )
  }

  // --- 3b. Pick a nearby runner ---
  if (screen === 'nearby' && mode) {
    const amount = Number(stake)
    return (
      <div className="pvp-flow">
        <StepHeader
          title={target ? 'Set the stake' : 'Runners near you'}
          step={3}
          onBack={() => (target ? setTarget(null) : setScreen('opponent'))}
        />
        {target ? (
          <form className="pvp-stake" onSubmit={sendChallenge}>
            <div className="pvp-versus is-compact">
              <span className="pvp-versus-side">You</span>
              <span className="pvp-versus-vs">VS</span>
              <span className="pvp-versus-side">{playerNameOf(target)}</span>
            </div>
            <p className="pvp-sub-line">
              {mode.label} race · each of you puts in
            </p>
            <div className="pvp-stake-input-row">
              <span className="game-coin pvp-stake-coin" aria-hidden="true" />
              <input
                type="number"
                min="1"
                step="1"
                max={balance || undefined}
                className="game-club-input pvp-stake-input"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                aria-label="Stake in Fahhcoin"
              />
            </div>
            <p className="pvp-sub-line">
              Winner takes {amount >= 1 ? amount * 2 : '—'} <Coin /> · you have{' '}
              {balance}
            </p>
            <button
              type="submit"
              className="game-btn game-btn-green game-btn-lg"
              disabled={
                busy === `challenge-${target.userId}` ||
                !(amount >= 1) ||
                amount > balance
              }
            >
              {busy === `challenge-${target.userId}`
                ? 'Sending…'
                : 'Send Challenge'}
            </button>
          </form>
        ) : (
          <>
            {busy === 'nearby' && !nearby ? (
              <p className="game-menu-empty">Looking around…</p>
            ) : !nearby || nearby.length === 0 ? (
              <p className="game-menu-empty">
                Nobody around (who&apos;s up for it) right now.
              </p>
            ) : (
              <ul className="pvp-runner-list">
                {nearby.map((p) => (
                  <li key={p.userId}>
                    <button
                      type="button"
                      className="pvp-runner"
                      onClick={() => pickTarget(p)}
                    >
                      <span className="pvp-runner-info">
                        <span className="pvp-runner-name">
                          {playerNameOf(p)}
                        </span>
                        <span className="pvp-runner-meta">
                          {p.level != null ? `Lv ${p.level} · ` : ''}
                          {p.distanceMeters < 1000
                            ? `${Math.round(p.distanceMeters)} m away`
                            : `${(p.distanceMeters / 1000).toFixed(1)} km away`}
                        </span>
                      </span>
                      <span className="game-btn game-btn-red game-btn-sm">
                        Challenge
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="game-btn game-btn-wood"
              onClick={pvp.scanNearby}
              disabled={busy === 'nearby'}
            >
              {busy === 'nearby' ? 'Scanning…' : 'Scan Again'}
            </button>
          </>
        )}
        {errorLine}
      </div>
    )
  }

  // --- 4. Race screen ---
  if (screen === 'race') {
    if (!race) {
      return (
        <div className="pvp-flow">
          <StepHeader title="Race" step={4} onBack={() => setScreen('home')} />
          <p className="game-menu-empty">Loading the match…</p>
        </div>
      )
    }
    const side = mySide(race, userId)
    const needsMyOk = race.status === 'PENDING' && !side.confirmed
    const canRun = race.status === 'IN_PROGRESS' && !side.myRunId
    const done = !isLive(race)
    const step = raceStep(race, side)
    const won = race.winnerId && race.winnerId === userId
    const lost = race.winnerId && race.winnerId !== userId
    const note = needsMyOk
      ? race.source === 'QUEUE'
        ? 'Rival found! Confirm to lock in your stake.'
        : `${side.opponentName} wants to race you.`
      : race.status === 'PENDING'
        ? `Waiting for ${side.opponentName} to confirm…`
        : canRun
          ? `Stakes locked. Run ${modeLabel(race)} before the clock runs out - fastest time wins.`
          : race.status === 'IN_PROGRESS'
            ? side.theirRunId
              ? 'Both runs in - results incoming…'
              : `Your run is in. Waiting on ${side.opponentName}…`
            : null

    return (
      <div className="pvp-flow">
        <StepHeader title="Race" step={4} onBack={() => setScreen('home')} />

        <div className="pvp-versus">
          <span className="pvp-versus-side">You</span>
          <span className="pvp-versus-vs">VS</span>
          <span className="pvp-versus-side">
            {side.opponentName || 'a rival'}
          </span>
        </div>
        <div className="pvp-race-terms">
          <span className="pvp-term">
            <span className="pvp-term-label">Distance</span>
            <span className="pvp-term-value">{modeLabel(race)}</span>
          </span>
          <span className="pvp-term">
            <span className="pvp-term-label">Pot</span>
            <span className="pvp-term-value">
              {race.stakeAmount * 2} <Coin />
            </span>
          </span>
          {!done && (
            <span className="pvp-term">
              <span className="pvp-term-label">Clock</span>
              <span className="pvp-term-value">{timeLeft(race.expiresAt)}</span>
            </span>
          )}
        </div>

        <ol className="pvp-timeline">
          {TIMELINE.map((label, i) => (
            <li
              key={label}
              className={`${i < step ? 'is-done' : ''} ${i === step ? 'is-now' : ''}`}
            >
              <span className="pvp-timeline-dot" />
              {label}
            </li>
          ))}
        </ol>

        {done ? (
          <p className={`pvp-result ${won ? 'is-won' : lost ? 'is-lost' : ''}`}>
            {resultLine(race, userId)}
          </p>
        ) : (
          note && <p className="pvp-big-line">{note}</p>
        )}

        <div className="pvp-actions-col">
          {needsMyOk && (
            <>
              <button
                type="button"
                className="game-btn game-btn-green game-btn-lg"
                onClick={() => pvp.review(race, true)}
                disabled={busy === `review-${race.id}`}
              >
                Accept & Lock Stake
              </button>
              <button
                type="button"
                className="game-btn game-btn-wood"
                onClick={() => pvp.review(race, false)}
                disabled={busy === `review-${race.id}`}
              >
                Decline
              </button>
            </>
          )}
          {race.status === 'PENDING' && !needsMyOk && (
            <button
              type="button"
              className="game-btn game-btn-wood"
              onClick={() => pvp.cancel(race)}
              disabled={busy === `cancel-${race.id}`}
            >
              Cancel Challenge
            </button>
          )}
          {canRun && (
            <>
              <button
                type="button"
                className="game-btn game-btn-green game-btn-lg pvp-run-btn"
                onClick={() => onStartRace(race)}
                disabled={racing}
              >
                <IconRunning /> {racing ? 'Run in progress' : 'Start Race Run'}
              </button>
              {/* Concede: only while live and my run isn't in (server
                  rule), not mid-run. Two taps. */}
              <button
                type="button"
                className={`game-btn game-btn-red pvp-forfeit-btn ${confirmForfeitId === race.id ? 'is-confirming' : ''}`}
                onClick={() => forfeit(race)}
                onBlur={() =>
                  setConfirmForfeitId((id) => (id === race.id ? null : id))
                }
                disabled={racing || busy === `forfeit-${race.id}`}
              >
                <IconFlag />{' '}
                {busy === `forfeit-${race.id}` ? (
                  'Forfeiting…'
                ) : confirmForfeitId === race.id ? (
                  <>
                    Give up {race.stakeAmount} <Coin />?
                  </>
                ) : (
                  'Forfeit'
                )}
              </button>
            </>
          )}
          {done && (
            <button
              type="button"
              className="game-btn game-btn-green"
              onClick={() => setScreen('distance')}
            >
              Race Again
            </button>
          )}
        </div>
        {errorLine}
      </div>
    )
  }

  // --- History ---
  if (screen === 'history') {
    return (
      <div className="pvp-flow">
        <StepHeader title="Race history" onBack={() => setScreen('home')} />
        {past.length === 0 ? (
          <p className="game-menu-empty">No finished races yet.</p>
        ) : (
          <ul className="pvp-runner-list">
            {past.map((c) => {
              const side = mySide(c, userId)
              const won = c.winnerId && c.winnerId === userId
              const lost = c.winnerId && c.winnerId !== userId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="pvp-runner"
                    onClick={() => openRace(c.id)}
                  >
                    <span className="pvp-runner-info">
                      <span className="pvp-runner-name">
                        vs {side.opponentName || 'a rival'}
                      </span>
                      <span
                        className={`pvp-runner-meta ${won ? 'pvp-won' : lost ? 'pvp-lost' : ''}`}
                      >
                        {modeLabel(c)} · {resultLine(c, userId)}
                      </span>
                    </span>
                    <IconChevronRight />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  // --- Home ---
  return (
    <div className="pvp-flow">
      <div className="pvp-hero">
        <span className="pvp-hero-emblem" aria-hidden="true">
          <IconSwords />
        </span>
        <p className="pvp-hero-title">Race a real runner</p>
        <p className="pvp-sub-line">
          Pick a distance, find a rival - fastest time takes the pot.
        </p>
        <button
          type="button"
          className="game-btn game-btn-green game-btn-lg pvp-hero-btn"
          onClick={() => setScreen('distance')}
        >
          Find a Race
        </button>
      </div>

      <p className="pvp-section-label">Your races</p>
      {!challengesLoaded ? (
        <p className="game-menu-empty">Loading races…</p>
      ) : active.length === 0 ? (
        <p className="game-menu-empty">No races on right now.</p>
      ) : (
        <ul className="pvp-runner-list">
          {active.map((c) => {
            const side = mySide(c, userId)
            const needsMe =
              (c.status === 'PENDING' && !side.confirmed) ||
              (c.status === 'IN_PROGRESS' && !side.myRunId)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`pvp-runner ${needsMe ? 'needs-me' : ''}`}
                  onClick={() => openRace(c.id)}
                >
                  <span className="pvp-runner-info">
                    <span className="pvp-runner-name">
                      vs {side.opponentName || 'a rival'}
                    </span>
                    <span className="pvp-runner-meta">
                      {modeLabel(c)} · pot {c.stakeAmount * 2} <Coin /> ·{' '}
                      {timeLeft(c.expiresAt)}
                    </span>
                  </span>
                  <span className={`pvp-race-status status-${c.status}`}>
                    {c.status === 'PENDING'
                      ? needsMe
                        ? 'Your call'
                        : 'Pending'
                      : needsMe
                        ? 'Run!'
                        : 'Live'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {past.length > 0 && (
        <button
          type="button"
          className="pvp-history-link"
          onClick={() => setScreen('history')}
        >
          Race history ({past.length}) <IconChevronRight />
        </button>
      )}
      {errorLine}
    </div>
  )
}
