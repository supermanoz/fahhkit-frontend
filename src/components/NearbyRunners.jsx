/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { IconCrosshairs } from './GameIcons'
import { PVP_MODES } from '../api/pvp'
import './PvpPanel.css'
import { playerNameOf } from '../utils/playerName'

// Nearby Runners card (Race tab): scan for other opted-in runners close by
// and send one a direct race challenge with your own stake. The opt-in
// itself is the Visibility switch in the Settings tab.
export default function NearbyRunners({ pvp, balance }) {
  const { discoverable, nearby, busy, error } = pvp
  const [challengeTarget, setChallengeTarget] = useState(null)
  const [mode, setMode] = useState(PVP_MODES[1].id)
  const [stake, setStake] = useState('')
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
    <div className="pvp-card">
      <p className="pvp-card-title">
        <IconCrosshairs /> Nearby Runners
      </p>
      <p className="game-menu-list-meta">
        {discoverable
          ? "You're visible - nearby runners can challenge you too."
          : "You're hidden. Turn on Visibility in Settings so others can find you."}
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
                    <span className="game-menu-list-area">
                      {playerNameOf(p)}
                    </span>
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
                  <>
                    <div className="game-menu-subtabs">
                      {PVP_MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`game-menu-subtab ${mode === m.id ? 'active' : ''}`}
                          onClick={() => setMode(m.id)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
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
                  </>
                )}
              </li>
            ))}
          </ul>
        ))}

      {error && (
        <p className="game-controls-hint game-controls-hint-error">{error}</p>
      )}
    </div>
  )
}
