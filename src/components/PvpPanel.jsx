/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { IconBolt, IconFlagCheckered, IconRunning } from './GameIcons'
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

// Head-to-head race tab. Two ways into a race here: the live/pending list at
// the top (accept, run, cancel) and quick match (the server pairs you with
// anyone queued for the same distance, fixed stake). Direct challenges to
// nearby runners live in the Settings tab (see NearbyRunners.jsx).
export default function PvpPanel({
  pvp,
  userId,
  balance,
  onStartRace,
  racing,
}) {
  const [mode, setMode] = useState(PVP_MODES[1].id)

  const { challenges, challengesLoaded, queueEntry, busy, error } = pvp

  const live = challenges.filter(
    (c) => c.status === 'PENDING' || c.status === 'IN_PROGRESS'
  )
  const past = challenges
    .filter((c) => c.status !== 'PENDING' && c.status !== 'IN_PROGRESS')
    .slice(0, 8)
  const inQueue = queueEntry?.status === 'WAITING'
  const selectedMode = PVP_MODES.find((m) => m.id === mode)

  return (
    <div className="pvp-panel game-cards">
      <section className="game-card game-card-dark">
        <p className="game-menu-section-title">
          <IconBolt /> Your Races
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
                        <IconRunning />{' '}
                        {racing ? 'Run in progress' : 'Start Race Run'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="pvp-card">
        <p className="game-menu-section-title">
          <IconFlagCheckered /> Pick a Distance
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

      {error && (
        <p className="game-controls-hint game-controls-hint-error">{error}</p>
      )}

      {past.length > 0 && (
        <section className="game-card game-card-dark">
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
        </section>
      )}
    </div>
  )
}
