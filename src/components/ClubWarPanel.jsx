/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useState } from 'react'
import { IconCheck, IconRunning, IconSwords, IconTrophy } from './GameIcons'
import { ApiError, resolveFileUrl } from '../api/client'
import {
  CLUB_WAR_BATTLE_HOURS,
  CLUB_WAR_ENTRY_FEE,
  CLUB_WAR_MAX_QUEUE_HOURS,
  CLUB_WAR_PREP_HOURS,
  CLUB_WAR_REWARDS,
  CLUB_WAR_SQUAD_SIZES,
  cancelClubWarQueue,
  getActiveClubWar,
  getClubWar,
  getClubWarQueueStatus,
  getClubWarRoster,
  lockInClubWarHero,
  queueClubWar,
} from '../api/clubWar'
import { isPlaceholderHero } from '../utils/hero'
import './GameCards.css'
import './ClubPanel.css'
import { playerNameOf } from '../utils/playerName'

// While queued or at war, re-check this often - matching and the phase
// changes happen server-side on a schedule, with no push event for them.
const POLL_MS = 20000

// The backend only exposes the *current* war, so the last war seen is
// remembered here (per club) to show its result once it's over.
function lastWarKey(clubId) {
  return `fahhkit_club_war_last_${clubId}`
}

function loadLastWarId(clubId) {
  try {
    return localStorage.getItem(lastWarKey(clubId))
  } catch {
    return null
  }
}

function saveLastWarId(clubId, warId) {
  try {
    if (warId) localStorage.setItem(lastWarKey(clubId), warId)
    else localStorage.removeItem(lastWarKey(clubId))
  } catch {
    // Storage blocked - the result card just won't show after the war.
  }
}

function errorText(err, fallback) {
  return err instanceof ApiError ? err.message : fallback
}

function formatCountdown(until, now) {
  const ms = new Date(until).getTime() - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'any moment now'
  const totalMins = Math.ceil(ms / 60000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function formatScore(score) {
  return score == null ? '—' : Math.round(score).toLocaleString()
}

// Club Wars tab inside the Club tab. Covers the whole backend flow (see
// api/clubWar.js): the leader picks a squad and queues (fee from the
// treasury) or cancels; squad members lock in a hero while PREPARING and run
// once during BATTLE; everyone sees both squads' progress, and the result
// once the war is resolved.
export default function ClubWarPanel({
  club,
  roster,
  userId,
  myRole,
  treasuryBalance,
  ownedItems = [],
  storeCatalog = [],
  onEquipHero,
  onStartWarRun,
  racing,
  onTreasuryChanged,
}) {
  const isLeader = myRole === 'LEADER'
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [queueEntry, setQueueEntry] = useState(null)
  const [war, setWar] = useState(null)
  const [warRoster, setWarRoster] = useState([])
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  // Squad picker (leader, before queueing).
  const eligibleSizes = CLUB_WAR_SQUAD_SIZES.filter((n) => n <= roster.length)
  const [squadSize, setSquadSize] = useState(null)
  const [selected, setSelected] = useState([])
  const size = squadSize ?? eligibleSizes[0] ?? null

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const [activeWar, queued] = await Promise.all([
        getActiveClubWar(),
        getClubWarQueueStatus(),
      ])
      let shownWar = activeWar
      if (activeWar) {
        saveLastWarId(club.id, activeWar.id)
      } else if (!queued) {
        // No war on - show the last one's result if we saw it running.
        const lastId = loadLastWarId(club.id)
        if (lastId) {
          try {
            const last = await getClubWar(lastId)
            if (last?.status === 'COMPLETED') shownWar = last
            else if (!last) saveLastWarId(club.id, null)
          } catch {
            saveLastWarId(club.id, null)
          }
        }
      }
      setQueueEntry(queued)
      setWar(shownWar)
      setWarRoster(shownWar ? (await getClubWarRoster(shownWar.id)) || [] : [])
    } catch (err) {
      setLoadError(errorText(err, 'Could not load club wars.'))
    } finally {
      setLoading(false)
    }
  }, [club.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Poll while something's in motion; tick the countdowns every 30s.
  const inMotion = Boolean(queueEntry) || (war && war.status !== 'COMPLETED')
  useEffect(() => {
    if (!inMotion) return undefined
    const poll = setInterval(refresh, POLL_MS)
    return () => clearInterval(poll)
  }, [inMotion, refresh])
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(tick)
  }, [])

  async function runAction(key, action, fallback) {
    setBusy(key)
    setActionError(null)
    try {
      await action()
      await refresh()
      return true
    } catch (err) {
      setActionError(errorText(err, fallback))
      return false
    } finally {
      setBusy(null)
    }
  }

  function toggleMember(memberId) {
    setSelected((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : prev.length < size
          ? [...prev, memberId]
          : prev
    )
  }

  async function handleQueue() {
    const ok = await runAction(
      'queue',
      () => queueClubWar(selected),
      'Could not start the war search.'
    )
    if (ok) {
      setSelected([])
      onTreasuryChanged?.()
    }
  }

  async function handleCancelQueue() {
    const ok = await runAction(
      'cancel',
      cancelClubWarQueue,
      'Could not cancel the search.'
    )
    if (ok) onTreasuryChanged?.()
  }

  if (loading) {
    return <p className="game-menu-empty">Scouting the battlefield…</p>
  }
  if (loadError) {
    return <p className="game-menu-empty">{loadError}</p>
  }

  const heroName = (storeItemId) =>
    storeCatalog.find((item) => item.id === storeItemId)?.name ||
    ownedItems.find((o) => o.storeItem.id === storeItemId)?.storeItem.name ||
    'Hero'

  const rules = (
    <section className="game-card game-card-dark">
      <h3 className="game-card-title game-card-title-sm">How Club Wars Work</h3>
      <ul className="club-perks">
        <li>
          <span className="club-perk-icon tone-red">
            <IconSwords />
          </span>
          The captain sends a squad of 10-50 members. Entry fee comes from the
          club treasury.
        </li>
        <li>
          <span className="club-perk-icon tone-stone">
            <IconCheck />
          </span>
          {CLUB_WAR_PREP_HOURS}h prep: every squad member locks in a hero.
        </li>
        <li>
          <span className="club-perk-icon tone-green">
            <IconRunning />
          </span>
          {CLUB_WAR_BATTLE_HOURS}h battle: one run each, with your locked hero
          equipped. Pace + effort points add up for the team.
        </li>
        <li>
          <span className="club-perk-icon tone-gold">
            <IconTrophy />
          </span>
          Winners: +{CLUB_WAR_REWARDS.winTrophies} trophies, and{' '}
          {CLUB_WAR_REWARDS.winXp} XP + {CLUB_WAR_REWARDS.winCoins} Fahhcoin for
          everyone who ran.
        </li>
      </ul>
    </section>
  )

  // --- A war is on (or just finished) ---
  if (war) {
    const weAreA = war.clubAId === club.id
    const ours = {
      name: weAreA ? war.clubAName : war.clubBName,
      trophies: weAreA ? war.clubATrophiesSnapshot : war.clubBTrophiesSnapshot,
      score: weAreA ? war.clubAScore : war.clubBScore,
    }
    const theirs = {
      id: weAreA ? war.clubBId : war.clubAId,
      name: weAreA ? war.clubBName : war.clubAName,
      trophies: weAreA ? war.clubBTrophiesSnapshot : war.clubATrophiesSnapshot,
      score: weAreA ? war.clubBScore : war.clubAScore,
    }
    const ourSquad = warRoster.filter((p) => p.clubId === club.id)
    const theirSquad = warRoster.filter((p) => p.clubId === theirs.id)
    const me = ourSquad.find((p) => p.userId === userId)
    const completed = war.status === 'COMPLETED'
    const won = completed && war.winnerClubId === club.id
    const lost = completed && war.winnerClubId && !won

    const ownedHeroes = ownedItems.filter(
      (o) =>
        o.storeItem.category === 'HERO' && !isPlaceholderHero(o.storeItem.name)
    )
    const equippedHero = ownedItems.find(
      (o) => o.equipped && o.storeItem.category === 'HERO'
    )
    const lockedHeroOwned = me?.lockedHeroStoreItemId
      ? ownedItems.find((o) => o.storeItem.id === me.lockedHeroStoreItemId)
      : null
    const lockedHeroEquipped =
      equippedHero?.storeItem.id === me?.lockedHeroStoreItemId

    const squadList = (squad, masked) => (
      <ul className="game-rows">
        {squad.map((p) => (
          <li key={p.userId}>
            <div className={`game-row ${p.userId === userId ? 'is-me' : ''}`}>
              <span className="game-row-info">
                <span className="game-row-name">
                  {p.userId === userId ? 'You' : playerNameOf(p)}
                </span>
                <span className="game-row-meta">
                  {masked
                    ? 'Hero hidden until battle'
                    : p.lockedHeroStoreItemId
                      ? `${heroName(p.lockedHeroStoreItemId)} locked in`
                      : 'No hero yet'}
                  {war.status !== 'PREPARING' &&
                    (p.runId
                      ? ' · ran ✓'
                      : completed
                        ? " · didn't run"
                        : ' · no run yet')}
                </span>
              </span>
              {completed && (
                <span className="club-war-points">
                  {formatScore(p.contributedScore)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    )

    return (
      <div className="game-cards">
        <section className="game-card game-card-dark club-war-banner">
          <span className={`club-war-phase phase-${war.status.toLowerCase()}`}>
            {completed
              ? won
                ? 'Victory!'
                : lost
                  ? 'Defeat'
                  : 'Draw'
              : war.status === 'PREPARING'
                ? `Prep · battle in ${formatCountdown(war.prepEndsAt, now)}`
                : `Battle · ends in ${formatCountdown(war.battleEndsAt, now)}`}
          </span>
          <div className="club-war-vs">
            <div className="club-war-side">
              <span className="club-emblem">
                <IconSwords />
              </span>
              <span className="game-row-name">{ours.name}</span>
              <span className="game-row-meta">🏆 {ours.trophies ?? 0}</span>
              {completed && (
                <span className="club-war-score">
                  {formatScore(ours.score)}
                </span>
              )}
            </div>
            <span className="game-card-title club-war-vs-label">VS</span>
            <div className="club-war-side">
              <span className="club-emblem club-emblem-enemy">
                <IconSwords />
              </span>
              <span className="game-row-name">{theirs.name}</span>
              <span className="game-row-meta">🏆 {theirs.trophies ?? 0}</span>
              {completed && (
                <span className="club-war-score">
                  {formatScore(theirs.score)}
                </span>
              )}
            </div>
          </div>
          <p className="game-row-meta club-war-sub">
            {war.squadSize} vs {war.squadSize}
            {completed && won
              ? ` · +${CLUB_WAR_REWARDS.winTrophies} trophies, and ${CLUB_WAR_REWARDS.winXp} XP + ${CLUB_WAR_REWARDS.winCoins} Fahhcoin to every runner`
              : ''}
          </p>
          {completed && (
            <button
              type="button"
              className="game-btn game-btn-wood"
              onClick={() => {
                saveLastWarId(club.id, null)
                setWar(null)
                setWarRoster([])
              }}
            >
              Back to War Room
            </button>
          )}
        </section>

        {!completed && me && (
          <section className="game-card game-card-light club-war-mine">
            {war.status === 'PREPARING' ? (
              <>
                <h3 className="game-card-title game-card-title-sm club-war-mine-title">
                  Lock In Your Hero
                </h3>
                <p className="club-blurb">
                  {me.lockedHeroStoreItemId
                    ? `${heroName(me.lockedHeroStoreItemId)} is locked in. You can switch until the battle starts.`
                    : "Pick the hero you'll run with - you'll need it equipped for your war run."}
                </p>
                {ownedHeroes.length === 0 ? (
                  <p className="club-blurb">
                    You don&apos;t own a hero yet - grab one from the Shop.
                  </p>
                ) : (
                  <div className="club-war-heroes">
                    {ownedHeroes.map((o) => {
                      const locked = o.storeItem.id === me.lockedHeroStoreItemId
                      return (
                        <button
                          key={o.storeItem.id}
                          type="button"
                          className={`game-menu-avatar-card ${locked ? 'is-selected' : ''}`}
                          disabled={locked || busy === 'lock'}
                          onClick={() =>
                            runAction(
                              'lock',
                              () => lockInClubWarHero(war.id, o.storeItem.id),
                              'Could not lock in that hero.'
                            )
                          }
                        >
                          {o.storeItem.assetUrl && (
                            <img
                              src={resolveFileUrl(o.storeItem.assetUrl)}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          )}
                          <span className="game-menu-avatar-name">
                            {o.storeItem.name}
                          </span>
                          {locked && (
                            <span className="game-menu-avatar-tag">
                              <IconCheck /> Locked
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            ) : me.runId ? (
              <>
                <h3 className="game-card-title game-card-title-sm club-war-mine-title">
                  Run In ✓
                </h3>
                <p className="club-blurb">
                  Your war run is logged. Rally the rest of the squad!
                </p>
              </>
            ) : !me.lockedHeroStoreItemId ? (
              <>
                <h3 className="game-card-title game-card-title-sm club-war-mine-title">
                  No Hero Locked In
                </h3>
                <p className="club-blurb">
                  Heroes had to be locked in during prep, so this war can&apos;t
                  take a run from you. Cheer the squad on!
                </p>
              </>
            ) : (
              <>
                <h3 className="game-card-title game-card-title-sm club-war-mine-title">
                  Your War Run
                </h3>
                <p className="club-blurb">
                  One run, any distance - pace and effort both score. You ride
                  with {heroName(me.lockedHeroStoreItemId)}.
                </p>
                {!lockedHeroEquipped ? (
                  <button
                    type="button"
                    className="game-btn game-btn-wood game-btn-lg"
                    disabled={!lockedHeroOwned || busy === 'equip'}
                    onClick={() =>
                      runAction(
                        'equip',
                        () => onEquipHero(lockedHeroOwned.storeItem),
                        'Could not equip that hero.'
                      )
                    }
                  >
                    Equip {heroName(me.lockedHeroStoreItemId)} First
                  </button>
                ) : (
                  <button
                    type="button"
                    className="game-btn game-btn-green game-btn-lg"
                    disabled={racing}
                    onClick={() =>
                      onStartWarRun(war, {
                        ourName: ours.name,
                        theirName: theirs.name,
                      })
                    }
                  >
                    {racing ? 'Finish your current run first' : 'Start War Run'}
                  </button>
                )}
              </>
            )}
            {actionError && (
              <p className="game-controls-hint game-controls-hint-error">
                {actionError}
              </p>
            )}
          </section>
        )}

        <section className="game-card game-card-dark">
          <h3 className="game-card-title game-card-title-sm">
            {ours.name} ({ourSquad.length})
          </h3>
          {squadList(ourSquad, false)}
        </section>

        <section className="game-card game-card-dark">
          <h3 className="game-card-title game-card-title-sm">
            {theirs.name} ({theirSquad.length})
          </h3>
          {squadList(theirSquad, war.status === 'PREPARING')}
        </section>
      </div>
    )
  }

  // --- Queued, waiting for an opponent ---
  if (queueEntry) {
    return (
      <div className="game-cards">
        <section className="game-card game-card-dark club-war-banner">
          <span className="club-war-phase phase-searching">
            Searching for an opponent…
          </span>
          <span className="club-emblem club-emblem-lg club-war-searching">
            <IconSwords />
          </span>
          <p className="game-row-meta club-war-sub">
            {queueEntry.squadSize}-member squad · {queueEntry.entryFee} Fahhcoin
            paid · matched on 🏆 {queueEntry.trophySnapshot ?? 0}
          </p>
          <p className="game-row-meta club-war-sub">
            No match within {CLUB_WAR_MAX_QUEUE_HOURS}h and the fee comes back
            to the treasury
            {queueEntry.joinedAt
              ? ` (${formatCountdown(
                  new Date(
                    new Date(queueEntry.joinedAt).getTime() +
                      CLUB_WAR_MAX_QUEUE_HOURS * 3600000
                  ),
                  now
                )} left)`
              : ''}
            .
          </p>
          {isLeader && (
            <button
              type="button"
              className="game-btn game-btn-red"
              onClick={handleCancelQueue}
              disabled={busy === 'cancel'}
            >
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel & Refund'}
            </button>
          )}
          {actionError && (
            <p className="game-controls-hint game-controls-hint-error">
              {actionError}
            </p>
          )}
        </section>
        {rules}
      </div>
    )
  }

  // --- No war: the leader sets one up ---
  const fee = size ? CLUB_WAR_ENTRY_FEE[size] : null
  const canAfford = fee != null && treasuryBalance >= fee
  return (
    <div className="game-cards">
      {!isLeader ? (
        <section className="game-card game-card-dark club-war-banner">
          <span className="club-emblem club-emblem-lg">
            <IconSwords />
          </span>
          <h3 className="game-card-title">No War Right Now</h3>
          <p className="game-row-meta club-war-sub">
            Your club captain picks the squad and starts the search. If
            you&apos;re picked, lock in a hero during prep and get your run in
            during battle!
          </p>
        </section>
      ) : eligibleSizes.length === 0 ? (
        <section className="game-card game-card-dark club-war-banner">
          <span className="club-emblem club-emblem-lg">
            <IconSwords />
          </span>
          <h3 className="game-card-title">Recruit to Go to War</h3>
          <p className="game-row-meta club-war-sub">
            Wars need a squad of at least {CLUB_WAR_SQUAD_SIZES[0]}. You have{' '}
            {roster.length} member{roster.length === 1 ? '' : 's'} - invite a
            few more runners from My Club.
          </p>
        </section>
      ) : (
        <section className="game-card game-card-dark">
          <h3 className="game-card-title">Start a Club War</h3>
          <p className="game-menu-section-title">Squad Size</p>
          <div className="game-menu-subtabs">
            {eligibleSizes.map((n) => (
              <button
                key={n}
                type="button"
                className={`game-menu-subtab ${size === n ? 'active' : ''}`}
                onClick={() => {
                  setSquadSize(n)
                  setSelected((prev) => prev.slice(0, n))
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="game-row-meta">
            Entry fee {fee} Fahhcoin from the treasury (it has{' '}
            {treasuryBalance ?? 0}).
          </p>

          <div className="club-war-picker-head">
            <p className="game-menu-section-title">
              Pick the Squad ({selected.length}/{size})
            </p>
            <button
              type="button"
              className="game-btn game-btn-wood game-btn-sm"
              onClick={() =>
                setSelected(roster.slice(0, size).map((m) => m.userId))
              }
            >
              Auto-pick
            </button>
          </div>
          <ul className="game-rows">
            {roster.map((m) => {
              const picked = selected.includes(m.userId)
              return (
                <li key={m.userId}>
                  <div
                    className={`game-row game-row-clickable ${picked ? 'is-me' : ''}`}
                    role="checkbox"
                    aria-checked={picked}
                    tabIndex={0}
                    onClick={() => toggleMember(m.userId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleMember(m.userId)
                      }
                    }}
                  >
                    <span className={`club-war-check ${picked ? 'is-on' : ''}`}>
                      {picked && <IconCheck />}
                    </span>
                    <span className="game-row-name">
                      {m.userId === userId ? 'You' : playerNameOf(m)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            className="game-btn game-btn-green game-btn-lg"
            onClick={handleQueue}
            disabled={
              busy === 'queue' || selected.length !== size || !canAfford
            }
          >
            {busy === 'queue'
              ? 'Sending the squad…'
              : !canAfford
                ? `Treasury needs ${fee} Fahhcoin`
                : selected.length !== size
                  ? `Pick ${size - selected.length} more`
                  : `Find Opponent · ${fee} Fahhcoin`}
          </button>
          {actionError && (
            <p className="game-controls-hint game-controls-hint-error">
              {actionError}
            </p>
          )}
        </section>
      )}
      {rules}
    </div>
  )
}
