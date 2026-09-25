/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import {
  FaBolt,
  FaCrosshairs,
  FaFlagCheckered,
  FaRunning,
} from 'react-icons/fa'
import { PVP_MODES, getPvpModeByMeters } from '../api/pvp'
import { mySide } from '../hooks/usePvp'
import './PvpPanel.css'

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

const RESOLUTION_COPY = {
  WIN_BY_TIME: 'on time',
  WIN_BY_FORFEIT: 'by forfeit',
  MUTUAL_FORFEIT_REFUND: 'nobody finished, stakes refunded',
  TIE_REFUND: 'dead heat, stakes refunded',
}

function resultLine(challenge, userId) {
  if (challenge.status === 'DECLINED') return 'Declined'
  if (challenge.status === 'CANCELLED') return 'Cancelled'
  if (challenge.status === 'EXPIRED') return 'Expired'
  const how = RESOLUTION_COPY[challenge.resolutionType] || ''
  if (!challenge.winnerId) return how ? `Draw · ${how}` : 'Draw'
  // Winner is paid the whole pot (both stakes), so net it's +stake.
  const won = challenge.winnerId === userId
  return won
    ? `Won ${how} · +${challenge.stakeAmount} 🪙`
    : `Lost ${how} · −${challenge.stakeAmount} 🪙`
}

// Head-to-head race tab. Three ways into a race: the live/pending list at
// the top (accept, run, cancel), quick match (the server pairs you with
// anyone queued for the same distance, fixed stake) and nearby runners
// (direct challenge with your own stake - they have to be opted in too).
export default function PvpPanel({
  pvp,
  userId,
  balance,
  onStartRace,
  racing,
}) {
  const [mode, setMode] = useState(PVP_MODES[1].id)
  const [challengeTarget, setChallengeTarget] = useState(null)
  const [stake, setStake] = useState('')

  const {
    challenges,
    challengesLoaded,
    queueEntry,
    discoverable,
    nearby,
    busy,
    error,
  } = pvp

  const live = challenges.filter(
    (c) => c.status === 'PENDING' || c.status === 'IN_PROGRESS'
  )
  const past = challenges
    .filter((c) => c.status !== 'PENDING' && c.status !== 'IN_PROGRESS')
    .slice(0, 8)
  const inQueue = queueEntry?.status === 'WAITING'
  const selectedMode = PVP_MODES.find((m) => m.id === mode)

  function openChallenge(player) {
    setChallengeTarget(player)
    setStake(String(selectedMode.queueStake))
  }

  async function sendChallenge(e) {
    e.preventDefault()
    const amount = Number(stake)
    if (!challengeTarget || !Number.isInteger(amount) || amount < 1) return
    const created = await pvp.challengePlayer(
      challengeTarget.userId,
      mode,
      amount
    )
    if (created) setChallengeTarget(null)
  }

  return (
    <div className="pvp-panel">
      <p className="game-menu-section-title">
        <FaBolt /> Your Races
      </p>
      {!challengesLoaded ? (
        <p className="game-menu-empty">Loading races…</p>
      ) : live.length === 0 ? (
        <p className="game-menu-empty">
          No races on. Pick a fight below. Politely. 🏁
        </p>
      ) : (
        <ul className="game-menu-list">
          {live.map((c) => {
            const side = mySide(c, userId)
            const needsMyOk = c.status === 'PENDING' && !side.confirmed
            const canRun = c.status === 'IN_PROGRESS' && !side.myRunId
            return (
              <li key={c.id} className="pvp-race">
                <div className="pvp-race-head">
                  <span className="game-store-item-info">
                    <span className="game-menu-list-area">
                      vs {side.opponentName || 'a rival'}
                    </span>
                    <span className="game-menu-list-meta">
                      {modeLabel(c)} · {c.stakeAmount} 🪙 each ·{' '}
                      {timeLeft(c.expiresAt)}
                    </span>
                  </span>
                  <span className={`pvp-race-status status-${c.status}`}>
                    {c.status === 'PENDING' ? 'Pending' : 'Live'}
                  </span>
                </div>
                <p className="pvp-race-note">
                  {needsMyOk
                    ? c.source === 'QUEUE'
                      ? 'Matched! Confirm to lock in your stake.'
                      : `${side.opponentName} wants to race you.`
                    : c.status === 'PENDING'
                      ? `Waiting for ${side.opponentName} to confirm…`
                      : canRun
                        ? `Stakes locked. Run ${modeLabel(c)} before the clock runs out — fastest time wins.`
                        : side.theirRunId
                          ? 'Both runs in — results incoming…'
                          : `Your run is in. Waiting on ${side.opponentName}…`}
                </p>
                <div className="pvp-race-actions">
                  {needsMyOk && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => pvp.review(c, true)}
                        disabled={busy === `review-${c.id}`}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => pvp.review(c, false)}
                        disabled={busy === `review-${c.id}`}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {c.status === 'PENDING' && !needsMyOk && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => pvp.cancel(c)}
                      disabled={busy === `cancel-${c.id}`}
                    >
                      Cancel
                    </button>
                  )}
                  {canRun && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => onStartRace(c)}
                      disabled={racing}
                    >
                      <FaRunning />{' '}
                      {racing ? 'Run in progress' : 'Start Race Run'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="game-menu-section-title">
        <FaFlagCheckered /> Pick a Distance
      </p>
      <div className="game-menu-subtabs">
        {PVP_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`game-menu-subtab ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
            disabled={inQueue}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="pvp-card">
        <p className="pvp-card-title">Quick Match</p>
        <p className="game-menu-list-meta">
          Get paired with any runner queued for {selectedMode.label}. Stake:{' '}
          {selectedMode.queueStake} 🪙 each, winner takes the pot.
        </p>
        {inQueue ? (
          <>
            <p className="pvp-searching">
              <span className="pvp-searching-dot" /> Searching for a rival (
              {queueEntry.mode === mode
                ? selectedMode.label
                : PVP_MODES.find((m) => m.id === queueEntry.mode)?.label}
              )…
            </p>
            <button
              type="button"
              className="btn btn-outline"
              onClick={pvp.leaveQueue}
              disabled={busy === 'queue'}
            >
              Leave Queue
            </button>
          </>
        ) : (
          <>
            {queueEntry?.status === 'EXPIRED' && (
              <p className="game-menu-list-meta">
                Nobody bit last time. Try again?
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => pvp.joinQueue(mode)}
              disabled={busy === 'queue' || balance < selectedMode.queueStake}
            >
              {balance < selectedMode.queueStake
                ? `Need ${selectedMode.queueStake} 🪙`
                : 'Find a Match'}
            </button>
          </>
        )}
      </div>

      <div className="pvp-card">
        <p className="pvp-card-title">
          <FaCrosshairs /> Nearby Runners
        </p>
        <label className="pvp-toggle">
          <input
            type="checkbox"
            checked={discoverable}
            onChange={(e) => pvp.toggleDiscoverable(e.target.checked)}
            disabled={busy === 'discoverable'}
          />
          <span>Let runners near me challenge me</span>
        </label>
        <p className="game-menu-list-meta">
          Shares your rough location with nearby players while this is on.
        </p>
        <button
          type="button"
          className="btn btn-outline"
          onClick={pvp.scanNearby}
          disabled={busy === 'nearby'}
        >
          {busy === 'nearby' ? 'Scanning…' : 'Scan Nearby'}
        </button>

        {nearby &&
          (nearby.length === 0 ? (
            <p className="game-menu-empty">
              Nobody around (who&apos;s up for it) right now.
            </p>
          ) : (
            <ul className="game-menu-list">
              {nearby.map((p) => (
                <li key={p.userId} className="pvp-nearby">
                  <div className="pvp-race-head">
                    <span className="game-store-item-info">
                      <span className="game-menu-list-area">{p.fullName}</span>
                      <span className="game-menu-list-meta">
                        {p.level != null ? `Lv ${p.level} · ` : ''}
                        {p.distanceMeters < 1000
                          ? `${Math.round(p.distanceMeters)} m away`
                          : `${(p.distanceMeters / 1000).toFixed(1)} km away`}
                      </span>
                    </span>
                    {challengeTarget?.userId !== p.userId && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openChallenge(p)}
                      >
                        Challenge
                      </button>
                    )}
                  </div>
                  {challengeTarget?.userId === p.userId && (
                    <form
                      className="pvp-challenge-form"
                      onSubmit={sendChallenge}
                    >
                      <span className="game-menu-list-meta">
                        {selectedMode.label} race · stake
                      </span>
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
                      <span className="game-menu-list-meta">🪙</span>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={
                          busy === `challenge-${p.userId}` ||
                          !(Number(stake) >= 1) ||
                          Number(stake) > balance
                        }
                      >
                        Send
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setChallengeTarget(null)}
                      >
                        ✕
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </div>

      {error && (
        <p className="game-controls-hint game-controls-hint-error">{error}</p>
      )}

      {past.length > 0 && (
        <>
          <p className="game-menu-section-title">Recent Results</p>
          <ul className="game-menu-list">
            {past.map((c) => {
              const side = mySide(c, userId)
              const won = c.winnerId && c.winnerId === userId
              const lost = c.winnerId && c.winnerId !== userId
              return (
                <li key={c.id}>
                  <span className="game-store-item-info">
                    <span className="game-menu-list-area">
                      vs {side.opponentName || 'a rival'} · {modeLabel(c)}
                    </span>
                    <span
                      className={`game-menu-list-meta ${won ? 'pvp-won' : lost ? 'pvp-lost' : ''}`}
                    >
                      {resultLine(c, userId)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
