/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useState } from 'react'
import {
  IconCheck,
  IconClose,
  IconHelmet,
  IconLock,
  IconRunning,
  IconSwords,
} from './GameIcons'
import ClubTrophyIcon from './ClubTrophyIcon'
import ClubBadge from './ClubBadge'
import HeroFigure from './HeroFigure'
import { getHeroSprite } from '../utils/heroSprites'
import { ApiError, resolveFileUrl } from '../api/client'
import {
  CLUB_WAR_BATTLE_HOURS,
  CLUB_WAR_ENTRY_FEE,
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
const FAST_POLL_MS = 5000
const NEAR_FLIP_WINDOW_MS = 60 * 1000

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

// Mirrors ClubWarErrorCode.ALREADY_HAS_ACTIVE_WAR_PROCESS server-side. Hit
// when the client's view of the club's war state is stale (e.g. a
// co-leader queued moments earlier) - rather than surface the raw error
// on the now-wrong squad-picker screen, refresh() so the already-built
// queued/war screen takes over instead.
const ALREADY_AT_WAR_MESSAGE =
  'Your club already has a queued, in-preparation, or in-battle war!'

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
  onViewProfile,
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
  // Set when the server rejects a queue attempt as a duplicate (see
  // ALREADY_AT_WAR_MESSAGE below) but a refresh still can't find that war
  // or queue entry to show instead - a stuck/orphaned state the leader
  // can't act past, so it gets its own screen rather than silently
  // dumping them back on the (still-queueable-looking) squad picker.
  const [warConflict, setWarConflict] = useState(false)

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
      return { war: shownWar, queueEntry: queued }
    } catch (err) {
      setLoadError(errorText(err, 'Could not load club wars.'))
      return { war: null, queueEntry: null }
    } finally {
      setLoading(false)
    }
  }, [club.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Poll while something's in motion; tick the countdowns every 30s. No
  // socket push exists for wars and the server flips phases once a minute,
  // so from a minute before the prep/battle deadline until the flip lands,
  // poll (and tick) every 5s - the result shows up within seconds.
  const inMotion = Boolean(queueEntry) || (war && war.status !== 'COMPLETED')
  const phaseDeadline =
    war && war.status !== 'COMPLETED'
      ? new Date(
          war.status === 'PREPARING' ? war.prepEndsAt : war.battleEndsAt
        ).getTime()
      : null
  const nearFlip =
    phaseDeadline != null && now > phaseDeadline - NEAR_FLIP_WINDOW_MS
  useEffect(() => {
    if (!inMotion) return undefined
    const poll = setInterval(refresh, nearFlip ? FAST_POLL_MS : POLL_MS)
    return () => clearInterval(poll)
  }, [inMotion, nearFlip, refresh])
  useEffect(() => {
    const tick = setInterval(
      () => setNow(Date.now()),
      nearFlip ? FAST_POLL_MS : 30000
    )
    return () => clearInterval(tick)
  }, [nearFlip])

  async function runAction(key, action, fallback) {
    setBusy(key)
    setActionError(null)
    setWarConflict(false)
    try {
      await action()
      await refresh()
      return true
    } catch (err) {
      if (err instanceof ApiError && err.message === ALREADY_AT_WAR_MESSAGE) {
        const found = await refresh()
        setWarConflict(!found.war && !found.queueEntry)
        return false
      }
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

  const heroAssetUrl = (storeItemId) => {
    const item =
      storeCatalog.find((i) => i.id === storeItemId) ||
      ownedItems.find((o) => o.storeItem.id === storeItemId)?.storeItem
    return item?.assetUrl ? resolveFileUrl(item.assetUrl) : null
  }

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
          <span className="club-perk-icon tone-gold club-perk-icon-trophy">
            <ClubTrophyIcon size={26} />
          </span>
          Winners: system-assigned trophies, and {CLUB_WAR_REWARDS.winXp} XP +{' '}
          {CLUB_WAR_REWARDS.winCoins} Fahhcoin for everyone who ran.
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
      <ul className="game-rows club-war-roster">
        {squad.map((p, i) => {
          const isMe = p.userId === userId
          const avatarUrl =
            !masked && p.lockedHeroStoreItemId
              ? heroAssetUrl(p.lockedHeroStoreItemId)
              : null
          const openProfile = () =>
            onViewProfile?.({
              userId: p.userId,
              fullName: p.fullName,
              nickname: p.nickname,
            })
          return (
            <li key={p.userId}>
              <div
                className={`game-row club-war-row game-row-clickable ${isMe ? 'is-me' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`View ${isMe ? 'your' : `${playerNameOf(p)}'s`} profile`}
                onClick={openProfile}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openProfile()
                  }
                }}
              >
                <span className="club-war-rank">{i + 1}</span>
                <span
                  className={`club-war-avatar ${masked ? 'is-masked' : ''} ${!masked && !p.lockedHeroStoreItemId ? 'is-empty' : ''}`}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : masked ? (
                    <IconLock />
                  ) : (
                    <IconHelmet />
                  )}
                </span>
                <span className="game-row-info">
                  <span className="game-row-name">
                    {isMe ? 'You' : playerNameOf(p)}
                  </span>
                  <span className="game-row-meta">
                    {masked
                      ? 'Hero hidden until battle'
                      : p.lockedHeroStoreItemId
                        ? `${heroName(p.lockedHeroStoreItemId)} locked in`
                        : 'No hero yet'}
                  </span>
                </span>
                {war.status !== 'PREPARING' && (
                  <span
                    className={`club-war-run-badge ${p.runId ? 'is-done' : completed ? 'is-missed' : 'is-pending'}`}
                    title={
                      p.runId ? 'Ran' : completed ? "Didn't run" : 'No run yet'
                    }
                  >
                    {p.runId ? <IconCheck /> : completed ? <IconClose /> : '·'}
                  </span>
                )}
                {completed && (
                  <span className="club-war-points">
                    {formatScore(p.contributedScore)}
                  </span>
                )}
              </div>
            </li>
          )
        })}
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
              <ClubBadge name={ours.name} size={56} />
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
              <ClubBadge name={theirs.name} size={56} />
              <span className="game-row-name">{theirs.name}</span>
              <span className="game-row-meta">🏆 {theirs.trophies ?? 0}</span>
              {completed && (
                <span className="club-war-score">
                  {formatScore(theirs.score)}
                </span>
              )}
            </div>
          </div>
          {completed && (ours.score > 0 || theirs.score > 0) && (
            <div className="club-war-score-bar" aria-hidden="true">
              <div
                className="club-war-score-bar-fill"
                style={{
                  width: `${(ours.score / (ours.score + theirs.score || 1)) * 100}%`,
                }}
              />
            </div>
          )}
          <p className="game-row-meta club-war-sub">
            {war.squadSize} vs {war.squadSize}
            {completed && won
              ? ` · system-assigned trophies, and ${CLUB_WAR_REWARDS.winXp} XP + ${CLUB_WAR_REWARDS.winCoins} Fahhcoin to every runner`
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
                <div className="club-war-mine-head">
                  <h3 className="game-card-title game-card-title-sm club-war-mine-title">
                    Lock In Your Hero
                  </h3>
                  <span className="club-war-prep-progress">
                    {ourSquad.filter((p) => p.lockedHeroStoreItemId).length}/
                    {ourSquad.length} ready
                  </span>
                </div>
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
                      const animated = Boolean(getHeroSprite(o.storeItem.name))
                      return (
                        <button
                          key={o.storeItem.id}
                          type="button"
                          className={`game-menu-avatar-card ${locked ? 'is-selected' : ''} ${animated ? 'is-animated' : ''}`}
                          disabled={locked || busy === 'lock'}
                          onClick={() =>
                            runAction(
                              'lock',
                              () => lockInClubWarHero(war.id, o.storeItem.id),
                              'Could not lock in that hero.'
                            )
                          }
                        >
                          {animated ? (
                            <span className="club-war-hero-figure">
                              <HeroFigure
                                hero={{ name: o.storeItem.name }}
                                pose="idle"
                                height={88}
                              />
                            </span>
                          ) : (
                            o.storeItem.assetUrl && (
                              <img
                                src={resolveFileUrl(o.storeItem.assetUrl)}
                                alt=""
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            )
                          )}
                          <span className="game-menu-avatar-name">
                            {o.storeItem.name}
                          </span>
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
          <ClubBadge
            name={club.name}
            size={84}
            className="club-war-searching"
          />
          <p className="game-row-meta club-war-sub">
            {queueEntry.squadSize}-member squad
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

  // --- Server says a war is already queued/active, but neither endpoint
  // shows us which one (a stuck queue entry, most likely) - don't leave
  // the leader back on the squad picker looking like nothing happened. ---
  if (warConflict) {
    return (
      <div className="game-cards">
        <section className="game-card game-card-dark club-war-banner">
          <ClubBadge name={club.name} size={84} />
          <h3 className="game-card-title">War Already Underway</h3>
          <p className="game-row-meta club-war-sub">
            The server says {club.name} already has a war queued, in prep, or in
            battle - it just isn&apos;t showing up here yet. Try refreshing in a
            moment; if it still won&apos;t show, contact support.
          </p>
          <button
            type="button"
            className="game-btn game-btn-wood"
            onClick={async () => {
              setBusy('recheck')
              const found = await refresh()
              setWarConflict(!found.war && !found.queueEntry)
              setBusy(null)
            }}
            disabled={busy === 'recheck'}
          >
            {busy === 'recheck' ? 'Checking…' : 'Refresh'}
          </button>
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
          <ClubBadge name={club.name} size={84} />
          <h3 className="game-card-title">No War Right Now</h3>
          <p className="game-row-meta club-war-sub">
            Your club captain picks the squad and starts the search. If
            you&apos;re picked, lock in a hero during prep and get your run in
            during battle!
          </p>
        </section>
      ) : eligibleSizes.length === 0 ? (
        <section className="game-card game-card-dark club-war-banner">
          <ClubBadge name={club.name} size={84} />
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
