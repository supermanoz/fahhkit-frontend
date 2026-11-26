/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import CoinAmount from './CoinAmount'
import { formatCoins } from '../utils/format'
import { applyDelta, refresh as refreshCoins } from '../state/coins'
import { useEffect, useState } from 'react'
import {
  IconChevronRight,
  IconCoins,
  IconEnvelope,
  IconFlag,
  IconSearch,
  IconSwords,
  IconUsers,
} from './GameIcons'
import ClubTrophyIcon from './ClubTrophyIcon'
import { ApiError } from '../api/client'
import {
  CLUB_CREATION_COST,
  CLUB_MAX_MEMBERS,
  createClub,
  demoteClubMember,
  donateToClubTreasury,
  findClubs,
  findPendingJoinRequests,
  getClubById,
  getClubRoster,
  getClubTreasury,
  getMyClub,
  inviteToClub,
  kickClubMember,
  leaveClub,
  promoteClubMember,
  requestToJoinClub,
  reviewJoinRequest,
  searchClubsByName,
  transferClubLeadership,
  updateClubDescription,
} from '../api/club'
import { findIndividualLeaderboard } from '../api/territory'
import { findPlayerByNickname } from '../api/user'
import { findNearbyPlayers } from '../api/pvp'
import { findClubRoutes } from '../api/routes'
import { resolveFileUrl } from '../api/client'
import { formatDistance } from '../utils/run'
import Tabs from '../game/ui/Tabs'
import Avatar from '../game/ui/Avatar'
import { GameActions, GameModal } from '../game/ui/GameModal'
import ClubWarPanel from './ClubWarPanel'
import { ClubError } from './ClubStates'
import ClubBadge from './ClubBadge'
import { getDisplayName, playerNameOf } from '../utils/playerName'
import './GameCards.css'
import './game-auth/GameAuth.css'
import './ClubPanel.css'
import './ClubRedesign.css'
import GameButton from './ui/GameButton'

// How much of the season leaderboard the invite search scans. Name search
// filters leaderboard pages client-side (/v1/athlete/find and /v1/user/find
// are moderator-only), so it only finds players holding territory this
// season - plus an exact nickname lookup (/v1/user/search-by-nickname),
// which finds anyone.
const INVITE_SEARCH_PAGE_SIZE = 100
const INVITE_SEARCH_MAX_PAGES = 3

const ROLE_LABEL = {
  LEADER: 'Captain',
  CO_LEADER: 'Vice-Captain',
  MEMBER: 'Member',
}

function ClubSkeleton() {
  return (
    <div className="game-cards club-page" aria-hidden="true">
      <span className="g-skeleton club-sk-tabs" />
      <span className="g-skeleton club-sk-banner" />
      <span className="g-skeleton club-sk-row" />
      <span className="g-skeleton club-sk-row" />
      <span className="g-skeleton club-sk-row" />
    </div>
  )
}

function RoleChip({ role }) {
  return (
    <span className={`club-role role-${role.toLowerCase()}`}>
      {ROLE_LABEL[role]}
    </span>
  )
}

function errorText(err, fallback) {
  return err instanceof ApiError ? err.message : fallback
}

// Club tab, styled after Clash of Clans' clan screens: chunky dark/cream
// cards, outlined titles, fat green/red buttons (see ClubPanel.css).
// Not in a club: create one, or browse/search and request to join.
// In a club: its details, the shared treasury (donate Fahhcoin), the roster
// with each member's role, leader/co-leader tooling (review join requests,
// kick, promote/demote, transfer leadership - the backend enforces who may
// do what, this only hides buttons that could never work), and leaving.
export default function ClubPanel({
  hasClub,
  userId,
  balance = 0,
  onClubChanged,
  onViewProfile,
  ownedItems,
  storeCatalog,
  // Player's current level (profile.level) - Club War hero lock-in gating.
  level,
  onEquipHero,
  onStartWarRun,
  racing,
  // Tapping a shared route row - GamePage fetches the full point list and
  // draws it on the map (see Me > My Routes, same callback shape).
  onViewRoute,
  // Opens the existing Fahhcoin shop (same flow as the PvP screen).
  onGetCoins,
  // Set by GamePage when a leaderboard club row is tapped - jumps straight
  // to that club's info (own club: its normal "mine" view; any other club:
  // the same public info/roster view browsing uses). Cleared right away via
  // onOpenClubHandled so it only fires once per tap.
  openClubId,
  onOpenClubHandled,
}) {
  // In a club: 'mine' (the club itself), 'wars' (Club Wars), or 'routes'
  // (routes clubmates have shared).
  const [clubSection, setClubSection] = useState('mine')
  const [sharedRoutes, setSharedRoutes] = useState([])
  const [sharedRoutesLoaded, setSharedRoutesLoaded] = useState(false)
  const [sharedRoutesError, setSharedRoutesError] = useState(null)
  const [loadingRouteId, setLoadingRouteId] = useState(null)
  const [myClub, setMyClub] = useState(null)
  const [loadingMyClub, setLoadingMyClub] = useState(true)
  const [myClubError, setMyClubError] = useState(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState(null)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  // Leader/co-leader editing the club description (null = not editing).
  const [descDraft, setDescDraft] = useState(null)
  const [savingDesc, setSavingDesc] = useState(false)
  const [descError, setDescError] = useState(null)

  const [roster, setRoster] = useState([])
  const [rosterError, setRosterError] = useState(null)
  const [joinRequests, setJoinRequests] = useState([])
  const [treasury, setTreasury] = useState(null)
  const [donateAmount, setDonateAmount] = useState('')
  const [donating, setDonating] = useState(false)
  const [donateError, setDonateError] = useState(null)
  // Invite Players: search results (leaderboard name matches, or players
  // nearby) and each row's invite state, keyed by userId.
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState(null)
  const [inviteSource, setInviteSource] = useState(null)
  const [inviteSearching, setInviteSearching] = useState(false)
  const [inviteSearchError, setInviteSearchError] = useState(null)
  const [inviteStates, setInviteStates] = useState({})
  // The member (or join request) an action is in flight for.
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const [searchText, setSearchText] = useState('')
  const [clubs, setClubs] = useState([])
  const [loadingClubs, setLoadingClubs] = useState(false)
  const [browseError, setBrowseError] = useState(null)
  const [joiningId, setJoiningId] = useState(null)
  const [joinError, setJoinError] = useState(null)
  const [joinedRequestIds, setJoinedRequestIds] = useState([])

  // Browse -> tap a club: its public info and roster, before joining.
  const [viewingClub, setViewingClub] = useState(null)
  const [viewingRoster, setViewingRoster] = useState([])
  const [viewingError, setViewingError] = useState(null)

  async function loadMyClub() {
    setLoadingMyClub(true)
    setMyClubError(null)
    try {
      const club = await getMyClub()
      setMyClub(club)
      if (club) await loadClubDetails(club.id)
      return club
    } catch (err) {
      setMyClubError(
        err instanceof ApiError ? err.message : 'Could not load your club.'
      )
    } finally {
      setLoadingMyClub(false)
    }
  }

  // Roster and treasury are open to every member; pending join requests
  // only to the leader/co-leaders, so that call is only made for them.
  async function loadClubDetails(clubId) {
    setRosterError(null)
    const [rosterResult, treasuryResult] = await Promise.allSettled([
      getClubRoster(clubId),
      getClubTreasury(),
    ])
    const members =
      rosterResult.status === 'fulfilled'
        ? rosterResult.value?.content || []
        : []
    if (rosterResult.status === 'rejected') {
      setRosterError(errorText(rosterResult.reason, 'Could not load members.'))
    }
    setRoster(members)
    setTreasury(
      treasuryResult.status === 'fulfilled' ? treasuryResult.value : null
    )
    const role = members.find((m) => m.userId === userId)?.role
    if (role === 'LEADER' || role === 'CO_LEADER') {
      try {
        const page = await findPendingJoinRequests()
        setJoinRequests(page?.content || [])
      } catch {
        setJoinRequests([])
      }
    } else {
      setJoinRequests([])
    }
  }

  // Runs one leader/co-leader action for a member or join request, then
  // reloads the roster/requests so roles and counts stay in step.
  async function runAction(id, action, fallback) {
    setBusyId(id)
    setActionError(null)
    try {
      await action()
      await loadClubDetails(myClub.id)
    } catch (err) {
      setActionError(errorText(err, fallback))
    } finally {
      setBusyId(null)
    }
  }

  // What the viewer may do to one roster member, as buttons for the
  // member's profile panel (see AthleteTerritoryProfilePanel `actions`).
  // Each run() throws on failure so the panel can show the error; on success
  // the roster reloads. Leader acts on anyone else; a co-leader only kicks
  // members. The backend enforces all of this - these only hide buttons
  // that could never work.
  function memberActions(member) {
    if (!myClub) return []
    const isLeaderViewer =
      roster.find((m) => m.userId === userId)?.role === 'LEADER'
    const isCoLeaderViewer =
      roster.find((m) => m.userId === userId)?.role === 'CO_LEADER'
    if (member.userId === userId) return []
    const act = (call) => async () => {
      await call()
      await loadClubDetails(myClub.id)
    }
    const actions = []
    if (isLeaderViewer && member.role === 'MEMBER') {
      actions.push({
        id: 'promote',
        label: 'Promote to Vice-Captain',
        tone: 'green',
        run: act(() => promoteClubMember(myClub.id, member.userId)),
      })
    }
    if (isLeaderViewer && member.role === 'CO_LEADER') {
      actions.push(
        {
          id: 'leader',
          label: 'Make Captain',
          tone: 'wood',
          confirm: 'Hand over the armband?',
          run: act(() => transferClubLeadership(myClub.id, member.userId)),
        },
        {
          id: 'demote',
          label: 'Demote to Member',
          tone: 'wood',
          run: act(() => demoteClubMember(myClub.id, member.userId)),
        }
      )
    }
    const canKick =
      member.role !== 'LEADER' &&
      (isLeaderViewer || (isCoLeaderViewer && member.role === 'MEMBER'))
    if (canKick) {
      actions.push({
        id: 'kick',
        label: 'Kick from Club',
        tone: 'red',
        confirm: 'Really kick them?',
        run: act(() => kickClubMember(myClub.id, member.userId)),
      })
    }
    return actions
  }

  async function searchPlayersByName(e) {
    e?.preventDefault()
    const text = inviteQuery.trim().toLowerCase()
    if (!text) return
    setInviteSearching(true)
    setInviteSearchError(null)
    try {
      // Exact nickname hit (any player) runs alongside the leaderboard scan.
      const nicknameHitPromise = findPlayerByNickname(inviteQuery.trim())
      const entries = []
      for (let page = 1; page <= INVITE_SEARCH_MAX_PAGES; page++) {
        const result = await findIndividualLeaderboard(
          page,
          INVITE_SEARCH_PAGE_SIZE
        )
        entries.push(...(result?.content || []))
        if (!result || result.last !== false) break
      }
      const nameMatches = entries
        .filter((entry) =>
          [entry.fullName, entry.nickname]
            .join(' ')
            .toLowerCase()
            .includes(text)
        )
        .map((entry) => ({
          userId: entry.userId,
          fullName: entry.fullName,
          nickname: entry.nickname,
          meta: `#${entry.rank} on the leaderboard`,
        }))
      const nicknameHit = await nicknameHitPromise
      setInviteResults(
        nicknameHit && nicknameHit.id !== userId
          ? [
              {
                userId: nicknameHit.id,
                fullName: nicknameHit.fullName,
                nickname: nicknameHit.nickname,
                meta: `@${nicknameHit.nickname}`,
              },
              ...nameMatches.filter((m) => m.userId !== nicknameHit.id),
            ]
          : nameMatches
      )
      setInviteSource('search')
    } catch (err) {
      setInviteSearchError(errorText(err, 'Could not search players.'))
    } finally {
      setInviteSearching(false)
    }
  }

  // Only players who've switched on PvP discovery and pinged a location
  // recently show up here (see PvpPanel).
  async function findPlayersNearby() {
    setInviteSearching(true)
    setInviteSearchError(null)
    try {
      const players = (await findNearbyPlayers()) || []
      setInviteResults(
        players.map((p) => ({
          userId: p.userId,
          fullName: p.fullName,
          nickname: p.nickname,
          meta: `${p.level != null ? `Level ${p.level} · ` : ''}${
            p.distanceMeters >= 1000
              ? `${(p.distanceMeters / 1000).toFixed(1)} km`
              : `${Math.round(p.distanceMeters)} m`
          } away`,
        }))
      )
      setInviteSource('nearby')
    } catch (err) {
      setInviteSearchError(errorText(err, 'Could not find nearby players.'))
    } finally {
      setInviteSearching(false)
    }
  }

  async function handleInvite(player) {
    setInviteStates((prev) => ({ ...prev, [player.userId]: 'sending' }))
    try {
      await inviteToClub(myClub.id, player.userId)
      setInviteStates((prev) => ({ ...prev, [player.userId]: 'sent' }))
    } catch (err) {
      // e.g. "You are already a member of a club!" - shown on that row.
      setInviteStates((prev) => ({
        ...prev,
        [player.userId]: errorText(err, 'Could not invite.'),
      }))
    }
  }

  async function handleSaveDescription(e) {
    e.preventDefault()
    if (savingDesc || descDraft === null) return
    setSavingDesc(true)
    setDescError(null)
    try {
      const description = descDraft.trim()
      const updated = await updateClubDescription(myClub.id, description)
      setMyClub((prev) => ({ ...prev, ...(updated || {}), description }))
      setDescDraft(null)
    } catch (err) {
      setDescError(errorText(err, 'Could not save the description.'))
    } finally {
      setSavingDesc(false)
    }
  }

  async function handleDonate(e) {
    e.preventDefault()
    const amount = Math.floor(Number(donateAmount))
    if (!amount || amount < 1) return
    setDonating(true)
    setDonateError(null)
    try {
      setTreasury(await donateToClubTreasury(amount))
      setDonateAmount('')
      // The donation came out of the player's own balance.
      applyDelta(-amount, 'club-donate')
      refreshCoins({ force: true })
      onClubChanged?.()
    } catch (err) {
      setDonateError(errorText(err, 'Could not donate right now.'))
    } finally {
      setDonating(false)
    }
  }

  async function loadClubs(text) {
    setLoadingClubs(true)
    setBrowseError(null)
    try {
      // Typed text goes through the partial-match search ("run" finds
      // "Night Runners"); the plain list is only for the empty-box browse.
      if (text) {
        setClubs((await searchClubsByName(text)) || [])
      } else {
        const page = await findClubs(1, 20)
        setClubs(page?.content || [])
      }
    } catch (err) {
      setBrowseError(
        err instanceof ApiError ? err.message : 'Could not load clubs.'
      )
    } finally {
      setLoadingClubs(false)
    }
  }

  // Always ask the server which club (if any) the player is in, rather than
  // trusting the cached profile's clubName (hasClub) - a stale profile
  // would otherwise show the browse view, with no way to leave. hasClub
  // only re-triggers the check when the profile says membership changed.
  useEffect(() => {
    loadMyClub().then((club) => {
      if (!club) loadClubs('')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasClub])

  async function handleCreate(e) {
    e.preventDefault()
    if (!createName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await createClub(createName.trim(), createDescription.trim())
      setCreateName('')
      setCreateDescription('')
      applyDelta(-CLUB_CREATION_COST, 'club-create')
      refreshCoins({ force: true })
      onClubChanged?.()
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Could not create that club.'
      )
    } finally {
      setCreating(false)
    }
  }

  async function openClubInfo(club) {
    // Show what the list already knows right away; fill in the rest.
    setViewingClub(club)
    setViewingRoster([])
    setViewingError(null)
    const [details, roster] = await Promise.allSettled([
      getClubById(club.id),
      getClubRoster(club.id),
    ])
    if (details.status === 'fulfilled' && details.value) {
      setViewingClub(details.value)
    }
    if (roster.status === 'fulfilled') {
      setViewingRoster(roster.value?.content || [])
    } else {
      setViewingError(errorText(roster.reason, 'Could not load members.'))
    }
  }

  // Waits for loadMyClub's mount effect to settle so "it's my own club" can
  // be told apart from "some other club" - the former just shows the normal
  // member view instead of the join-request browse card.
  useEffect(() => {
    if (!openClubId || loadingMyClub) return
    if (myClub && myClub.id === openClubId) {
      setViewingClub(null)
      setClubSection('mine')
    } else {
      openClubInfo({ id: openClubId })
    }
    onOpenClubHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openClubId, loadingMyClub])

  useEffect(() => {
    if (clubSection !== 'routes' || sharedRoutesLoaded) return
    let cancelled = false
    setSharedRoutesError(null)
    findClubRoutes(1, 50)
      .then((page) => {
        if (!cancelled) setSharedRoutes(page?.content || [])
      })
      .catch((err) => {
        if (!cancelled) {
          setSharedRoutesError(errorText(err, 'Could not load shared routes.'))
        }
      })
      .finally(() => {
        if (!cancelled) setSharedRoutesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [clubSection, sharedRoutesLoaded])

  async function handleViewSharedRoute(routeId) {
    setLoadingRouteId(routeId)
    try {
      await onViewRoute?.(routeId)
    } finally {
      setLoadingRouteId(null)
    }
  }

  async function handleJoin(club) {
    setJoiningId(club.id)
    setJoinError(null)
    try {
      await requestToJoinClub(club.id)
      setJoinedRequestIds((prev) => [...prev, club.id])
    } catch (err) {
      setJoinError(
        err instanceof ApiError
          ? err.message
          : 'Could not send that join request.'
      )
    } finally {
      setJoiningId(null)
    }
  }

  async function handleLeave() {
    if (!myClub) return
    setLeaving(true)
    setLeaveError(null)
    try {
      await leaveClub(myClub.id)
      setMyClub(null)
      setConfirmingLeave(false)
      loadClubs('')
      onClubChanged?.()
    } catch (err) {
      setLeaveError(
        err instanceof ApiError ? err.message : 'Could not leave the club.'
      )
    } finally {
      setLeaving(false)
    }
  }

  if (loadingMyClub) {
    return <ClubSkeleton />
  }
  if (myClubError) {
    return (
      <ClubError
        message={myClubError}
        onRetry={() =>
          loadMyClub().then((club) => {
            if (!club) loadClubs('')
          })
        }
      />
    )
  }

  // Guarded by !viewingClub: tapping a club leaderboard row (or any other
  // club) sets viewingClub even while the player has their own club, and
  // that other-club view (below) must win over the "my club" view.
  if (myClub && !viewingClub) {
    const myRole = roster.find((m) => m.userId === userId)?.role
    const isLeader = myRole === 'LEADER'
    const canManage = isLeader || myRole === 'CO_LEADER'
    const coLeaderCount = roster.filter((m) => m.role === 'CO_LEADER').length
    // Mirrors ClubServiceImpl.leaveClub: a leader with other members and no
    // co-leader to succeed them has to hand over leadership first.
    const leaderMustTransfer =
      isLeader && roster.length > 1 && coLeaderCount === 0
    const donateValue = Math.floor(Number(donateAmount))

    return (
      <div className="game-cards club-page">
        <Tabs
          accent="shop"
          className="club-section-tabs"
          ariaLabel="Club sections"
          value={clubSection}
          onChange={setClubSection}
          tabs={[
            { id: 'mine', label: 'My Club' },
            { id: 'wars', label: 'Club Wars' },
            { id: 'routes', label: 'Shared Routes' },
          ]}
        />

        {clubSection === 'routes' ? (
          <section className="game-card club-card">
            <h3 className="game-card-title game-card-title-sm">
              Shared Routes
            </h3>
            {sharedRoutesError ? (
              <ClubError
                message={sharedRoutesError}
                onRetry={() => {
                  setSharedRoutesError(null)
                  setSharedRoutesLoaded(false)
                }}
              />
            ) : !sharedRoutesLoaded ? (
              <span className="g-skeleton club-sk-row" aria-hidden="true" />
            ) : sharedRoutes.length === 0 ? (
              <p className="club-state-text">
                No one&apos;s shared a route with the club yet. Share one from
                Me → My Routes and it shows up here.
              </p>
            ) : (
              <ul className="game-rows club-shared-route-list">
                {sharedRoutes.map((route) => (
                  <li key={route.id}>
                    <button
                      type="button"
                      className="game-row game-row-clickable club-shared-route-row"
                      disabled={loadingRouteId === route.id}
                      onClick={() => handleViewSharedRoute(route.id)}
                    >
                      <span className="game-row-info">
                        <span className="game-row-name">{route.name}</span>
                      </span>
                      <span className="club-shared-route-distance">
                        {loadingRouteId === route.id
                          ? '…'
                          : formatDistance(route.distanceMeters)}
                      </span>
                      <IconChevronRight
                        className="club-shared-route-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : clubSection === 'wars' ? (
          <ClubWarPanel
            club={myClub}
            roster={roster}
            userId={userId}
            myRole={myRole}
            treasuryBalance={treasury?.balance ?? 0}
            ownedItems={ownedItems}
            storeCatalog={storeCatalog}
            level={level}
            onEquipHero={onEquipHero}
            onStartWarRun={onStartWarRun}
            racing={racing}
            onTreasuryChanged={() => loadClubDetails(myClub.id)}
            onViewProfile={onViewProfile}
          />
        ) : (
          <div className="game-cards">
            <section className="game-card club-card club-banner">
              <div className="club-banner-top">
                <ClubBadge name={myClub.name} size={72} />
                <div className="club-banner-info">
                  <h3 className="game-card-title">{myClub.name}</h3>
                  <p className="game-row-meta">
                    Captain{' '}
                    {getDisplayName({
                      nickname: myClub.leaderNickname,
                      fullName: myClub.leaderName,
                    })}
                  </p>
                  {myRole && (
                    <span className={`club-role role-${myRole.toLowerCase()}`}>
                      You: {ROLE_LABEL[myRole]}
                    </span>
                  )}
                </div>
              </div>
              <div className="club-stats">
                <div className="club-stat">
                  <span className="club-stat-value">
                    {myClub.memberCount}/{CLUB_MAX_MEMBERS}
                  </span>
                  <span className="club-stat-label">Members</span>
                </div>
                <div className="club-stat">
                  <span className="club-stat-value">
                    {treasury ? treasury.balance : '—'}
                  </span>
                  <span className="club-stat-label">Treasury</span>
                </div>
              </div>
              {descDraft !== null ? (
                <form
                  className="club-desc-edit"
                  onSubmit={handleSaveDescription}
                >
                  <textarea
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="game-club-input club-desc-input"
                    placeholder="Tell runners what your crew is about…"
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    maxLength={200}
                    rows={3}
                    autoFocus
                  />
                  <div className="club-desc-actions">
                    <span className="game-row-meta">
                      {descDraft.length}/200
                    </span>
                    <GameButton
                      variant="neutral"
                      size="sm"
                      onClick={() => {
                        setDescDraft(null)
                        setDescError(null)
                      }}
                      disabled={savingDesc}
                    >
                      Cancel
                    </GameButton>
                    <GameButton
                      type="submit"
                      size="sm"
                      disabled={
                        savingDesc ||
                        descDraft.trim() === (myClub.description ?? '').trim()
                      }
                    >
                      {savingDesc ? 'Saving…' : 'Save'}
                    </GameButton>
                  </div>
                  {descError && (
                    <p className="game-controls-hint game-controls-hint-error">
                      {descError}
                    </p>
                  )}
                </form>
              ) : (
                (myClub.description || canManage) && (
                  <div className="club-desc-row">
                    <p
                      className={`club-description ${myClub.description ? '' : 'club-description-empty'}`}
                    >
                      {myClub.description ||
                        'No motto yet - give your crew a battle cry!'}
                    </p>
                    {canManage && (
                      <button
                        type="button"
                        className="club-desc-edit-btn"
                        onClick={() => setDescDraft(myClub.description ?? '')}
                        aria-label="Edit club description"
                      >
                        ✎ Edit
                      </button>
                    )}
                  </div>
                )
              )}

              <div className="club-treasury">
                <div className="club-treasury-balance">
                  <span className="club-coin">
                    <IconCoins />
                  </span>
                  <span>
                    <CoinAmount
                      className="club-treasury-value"
                      text={treasury ? formatCoins(treasury.balance) : '—'}
                    />
                    <span className="game-row-meta">Club treasury</span>
                  </span>
                </div>
                <form className="club-donate" onSubmit={handleDonate}>
                  <input
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    type="number"
                    className="game-club-input"
                    placeholder={`Amount (you have ${balance})`}
                    min={1}
                    max={balance}
                    step={1}
                    value={donateAmount}
                    onChange={(e) => setDonateAmount(e.target.value)}
                  />
                  <GameButton
                    type="submit"

                    disabled={
                      donating ||
                      !donateValue ||
                      donateValue < 1 ||
                      donateValue > balance
                    }
                  >
                    {donating ? '…' : 'Donate'}
                  </GameButton>
                </form>
                {donateError && (
                  <p className="game-controls-hint game-controls-hint-error">
                    {donateError}
                  </p>
                )}
              </div>
            </section>

            {canManage && joinRequests.length > 0 && (
              <section className="game-card club-card">
                <h3 className="game-card-title game-card-title-sm">
                  Join Requests ({joinRequests.length})
                </h3>
                <ul className="game-rows">
                  {joinRequests.map((req) => {
                    const openProfile = () =>
                      onViewProfile?.({
                        userId: req.requesterId,
                        fullName: req.requesterName,
                        nickname: req.requesterNickname,
                        fromJoinRequest: true,
                      })
                    return (
                      <li key={req.id}>
                        {/* The whole row opens the requester's game profile
                          (level, territory, medals) before deciding. */}
                        <div
                          className="game-row game-row-clickable"
                          role="button"
                          tabIndex={0}
                          aria-label={`View ${getDisplayName({
                            nickname: req.requesterNickname,
                            fullName: req.requesterName,
                          })}'s profile`}
                          onClick={openProfile}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openProfile()
                            }
                          }}
                        >
                          <span className="game-row-name">
                            {getDisplayName({
                              nickname: req.requesterNickname,
                              fullName: req.requesterName,
                            })}
                          </span>
                          <span
                            className="game-row-actions"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <GameButton
                              size="sm"
                              disabled={busyId === req.id}
                              onClick={() =>
                                runAction(
                                  req.id,
                                  () => reviewJoinRequest(req.id, true),
                                  'Could not accept that request.'
                                )
                              }
                            >
                              Accept
                            </GameButton>
                            <GameButton
                              variant="neutral"
                              size="sm"
                              disabled={busyId === req.id}
                              onClick={() =>
                                runAction(
                                  req.id,
                                  () => reviewJoinRequest(req.id, false),
                                  'Could not decline that request.'
                                )
                              }
                            >
                              Decline
                            </GameButton>
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {canManage && (
              <section className="game-card club-card">
                <h3 className="game-card-title game-card-title-sm">
                  Invite Players
                </h3>
                <form className="club-search" onSubmit={searchPlayersByName}>
                  <IconSearch className="club-search-icon" />
                  <input
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    type="text"
                    className="game-club-input"
                    placeholder="Search by name or exact nickname"
                    value={inviteQuery}
                    onChange={(e) => setInviteQuery(e.target.value)}
                  />
                  <GameButton
                    type="submit"
                    variant="accent"
                    disabled={inviteSearching || !inviteQuery.trim()}
                  >
                    Search
                  </GameButton>
                </form>
                <GameButton
                  variant="accent"
                  size="sm"
                  className="club-nearby-btn"
                  onClick={findPlayersNearby}
                  disabled={inviteSearching}
                >
                  Find runners near me
                </GameButton>

                {inviteSearchError ? (
                  <p className="game-card-empty">{inviteSearchError}</p>
                ) : inviteSearching ? (
                  <p className="game-card-empty">Searching…</p>
                ) : inviteResults === null ? null : (
                  (() => {
                    const memberIds = new Set(roster.map((m) => m.userId))
                    const candidates = inviteResults.filter(
                      (p) => p.userId !== userId && !memberIds.has(p.userId)
                    )
                    if (candidates.length === 0) {
                      return (
                        <p className="game-card-empty">
                          {inviteSource === 'nearby'
                            ? 'No runners nearby right now.'
                            : 'No runners found - only players holding territory this season show up.'}
                        </p>
                      )
                    }
                    return (
                      <ul className="game-rows">
                        {candidates.map((player) => {
                          const state = inviteStates[player.userId]
                          const failed =
                            state && state !== 'sending' && state !== 'sent'
                          const openProfile = () =>
                            onViewProfile?.({
                              userId: player.userId,
                              fullName: player.fullName,
                              nickname: player.nickname,
                              profilePictureUrl: player.profilePictureUrl,
                              // The row's own Invite button covers inviting.
                              fromJoinRequest: true,
                            })
                          return (
                            <li key={player.userId}>
                              <div
                                className="game-row game-row-clickable"
                                role="button"
                                tabIndex={0}
                                aria-label={`View ${playerNameOf(player)}'s profile`}
                                onClick={openProfile}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    openProfile()
                                  }
                                }}
                              >
                                <span className="game-row-info">
                                  <span className="game-row-name">
                                    {playerNameOf(player)}
                                  </span>
                                  <span
                                    className={`game-row-meta ${failed ? 'is-error' : ''}`}
                                  >
                                    {failed ? state : player.meta}
                                  </span>
                                </span>
                                <GameButton
                                  size="sm"
                                  disabled={
                                    state === 'sending' || state === 'sent'
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleInvite(player)
                                  }}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  {state === 'sent'
                                    ? 'Invited ✓'
                                    : state === 'sending'
                                      ? 'Sending…'
                                      : 'Invite'}
                                </GameButton>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )
                  })()
                )}
              </section>
            )}

            <section className="game-card club-card">
              <h3 className="game-card-title game-card-title-sm">
                Members ({roster.length})
              </h3>
              {rosterError ? (
                <ClubError
                  message={rosterError}
                  onRetry={() => loadClubDetails(myClub.id)}
                />
              ) : (
                <ul className="game-rows club-member-rows">
                  {roster.map((member, index) => {
                    const isMe = member.userId === userId
                    const actions = memberActions(member)
                    const openProfile = () =>
                      onViewProfile?.({
                        userId: member.userId,
                        fullName: member.fullName,
                        nickname: member.nickname,
                        profilePictureUrl: member.profilePictureUrl,
                        clubRole: member.role,
                        clubActions: actions,
                      })
                    return (
                      <li key={member.userId}>
                        {/* Tap a member to open their profile - promote /
                            demote / make leader / kick live there, not on
                            the row. */}
                        <div
                          className={`game-row game-row-clickable ${isMe ? 'is-me' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`View ${isMe ? 'your' : `${playerNameOf(member)}'s`} profile`}
                          onClick={openProfile}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openProfile()
                            }
                          }}
                        >
                          <span className="club-rank">{index + 1}</span>
                          <Avatar
                            src={resolveFileUrl(member.profilePictureUrl)}
                            name={playerNameOf(member)}
                            size={40}
                          />
                          <span className="game-row-info">
                            <span className="game-row-name">
                              {playerNameOf(member)}
                              {isMe && (
                                <span className="club-you-tag">You</span>
                              )}
                            </span>
                            <span className="game-row-meta">
                              <RoleChip role={member.role} />
                            </span>
                          </span>
                          {actions.length > 0 && (
                            <span className="club-row-more" aria-hidden="true">
                              ⋯
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {actionError && (
                <p className="game-controls-hint game-controls-hint-error">
                  {actionError}
                </p>
              )}
            </section>

            <div className="club-leave">
              {leaderMustTransfer ? (
                <p className="club-state-text">
                  You&apos;re the captain - promote a member to vice-captain
                  (they take over when you leave) or make someone captain before
                  leaving.
                </p>
              ) : (
                <button
                  type="button"
                  className="club-leave-btn"
                  onClick={() => setConfirmingLeave(true)}
                >
                  Leave Club
                </button>
              )}
              {leaveError && !confirmingLeave && (
                <p className="game-controls-hint game-controls-hint-error">
                  {leaveError}
                </p>
              )}
            </div>
            <GameModal
              open={confirmingLeave && !leaderMustTransfer}
              onClose={() => !leaving && setConfirmingLeave(false)}
              tone="danger"
              title={
                isLeader && roster.length === 1
                  ? 'Disband club?'
                  : 'Leave club?'
              }
            >
              <p className="club-confirm-text">
                {isLeader && roster.length === 1
                  ? `You're the only member - leaving disbands ${myClub.name}.`
                  : `Leave ${myClub.name}?`}
              </p>
              {leaveError && (
                <p className="game-controls-hint game-controls-hint-error">
                  {leaveError}
                </p>
              )}
              <GameActions>
                <GameButton
                  variant="neutral"
                  onClick={() => setConfirmingLeave(false)}
                  disabled={leaving}
                >
                  Stay
                </GameButton>
                <GameButton
                  variant="danger"
                  onClick={handleLeave}
                  disabled={leaving}
                >
                  {leaving ? 'Leaving…' : 'Yes, leave'}
                </GameButton>
              </GameActions>
            </GameModal>
          </div>
        )}
      </div>
    )
  }

  if (viewingClub) {
    const requested = joinedRequestIds.includes(viewingClub.id)
    const full = viewingClub.memberCount >= CLUB_MAX_MEMBERS
    return (
      <div className="game-cards club-page">
        <GameButton
          variant="neutral"
          className="club-back"
          onClick={() => setViewingClub(null)}
        >
          ‹ All Clubs
        </GameButton>

        <section className="game-card club-card club-banner">
          <div className="club-banner-top">
            <ClubBadge name={viewingClub.name} size={72} />
            <div className="club-banner-info">
              <h3 className="game-card-title">{viewingClub.name}</h3>
              {viewingClub.leaderName && (
                <p className="game-row-meta">
                  Captain{' '}
                  {getDisplayName({
                    nickname: viewingClub.leaderNickname,
                    fullName: viewingClub.leaderName,
                  })}
                </p>
              )}
            </div>
          </div>
          <div className="club-stats">
            <div className="club-stat">
              <span className="club-stat-value">
                {viewingClub.memberCount}/{CLUB_MAX_MEMBERS}
              </span>
              <span className="club-stat-label">Members</span>
            </div>
          </div>
          {viewingClub.description && (
            <p className="club-description">{viewingClub.description}</p>
          )}
          <GameButton
            size="lg"
            fullWidth
            onClick={() => handleJoin(viewingClub)}
            disabled={joiningId === viewingClub.id || requested || full}
          >
            {requested
              ? 'Request Sent'
              : full
                ? 'Club Full'
                : joiningId === viewingClub.id
                  ? 'Sending…'
                  : 'Request to Join'}
          </GameButton>
          {joinError && (
            <p className="game-controls-hint game-controls-hint-error">
              {joinError}
            </p>
          )}
        </section>

        <section className="game-card club-card">
          <h3 className="game-card-title game-card-title-sm">
            Members ({viewingRoster.length || viewingClub.memberCount})
          </h3>
          {viewingError ? (
            <ClubError
              message={viewingError}
              onRetry={() => openClubInfo(viewingClub)}
            />
          ) : viewingRoster.length === 0 ? (
            <span className="g-skeleton club-sk-row" aria-hidden="true" />
          ) : (
            <ul className="game-rows club-member-rows">
              {viewingRoster.map((member, index) => {
                const openProfile = () =>
                  onViewProfile?.({
                    userId: member.userId,
                    fullName: member.fullName,
                    nickname: member.nickname,
                    profilePictureUrl: member.profilePictureUrl,
                  })
                return (
                  <li key={member.userId}>
                    <div
                      className="game-row game-row-clickable"
                      role="button"
                      tabIndex={0}
                      aria-label={`View ${playerNameOf(member)}'s profile`}
                      onClick={openProfile}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openProfile()
                        }
                      }}
                    >
                      <span className="club-rank">{index + 1}</span>
                      <Avatar
                        src={resolveFileUrl(member.profilePictureUrl)}
                        name={playerNameOf(member)}
                        size={40}
                      />
                      <span className="game-row-info">
                        <span className="game-row-name">
                          {playerNameOf(member)}
                        </span>
                        <span className="game-row-meta">
                          <RoleChip role={member.role} />
                        </span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="game-cards club-page">
      <div className="club-cards">
        <section className="game-card club-card">
          <span className="club-emblem club-emblem-lg">
            <IconUsers />
          </span>
          <h3 className="game-card-title">Unlock Clubs</h3>
          <ul className="club-perks">
            <li>
              <span className="club-perk-icon tone-gold">
                <IconCoins />
              </span>
              Pool Fahhcoin in a shared treasury!
            </li>
            <li>
              <span className="club-perk-icon tone-green">
                <IconFlag />
              </span>
              Claim territory together and climb the club leaderboard!
            </li>
            <li>
              <span className="club-perk-icon tone-gold club-perk-icon-trophy">
                <ClubTrophyIcon size={26} />
              </span>
              Win club medals every season!
            </li>
            <li>
              <span className="club-perk-icon tone-red">
                <IconSwords />
              </span>
              Battle rival clubs in Club Wars!
            </li>
            <li>
              <span className="club-perk-icon tone-stone">
                <IconEnvelope />
              </span>
              Recruit runners and invite your friends!
            </li>
          </ul>
        </section>

        <section className="game-card club-card club-create-card">
          <h3 className="game-card-title game-card-title-sm club-create-title">
            Create a Club
          </h3>
          <form className="club-create" onSubmit={handleCreate}>
            <div className="game-auth-field">
              <label className="game-auth-label" htmlFor="club-create-name">
                Club name
              </label>
              <input
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                id="club-create-name"
                type="text"
                className="game-auth-input"
                placeholder="e.g. Night Owls"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={60}
              />
              <p className="club-counter">{createName.length}/60</p>
            </div>
            <div className="game-auth-field">
              <label className="game-auth-label" htmlFor="club-create-desc">
                Description (optional)
              </label>
              <input
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                id="club-create-desc"
                type="text"
                className="game-auth-input"
                placeholder="A short battle cry for your crew"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                maxLength={200}
              />
              <p className="club-counter">{createDescription.length}/200</p>
            </div>
            {!createName.trim() && (
              <p className="club-hint">Give your club a name to continue.</p>
            )}
            <GameButton
              type="submit"
              size="lg"
              fullWidth
              className="club-create-btn"
              disabled={
                creating || !createName.trim() || balance < CLUB_CREATION_COST
              }
            >
              {creating ? (
                'Creating…'
              ) : (
                <>
                  Create Club ·{' '}
                  <span className="game-coin" aria-hidden="true" />
                  {CLUB_CREATION_COST}
                </>
              )}
            </GameButton>
            {balance < CLUB_CREATION_COST && (
              <div className="club-need-coins">
                <p className="game-card-empty">
                  Starting a club costs {CLUB_CREATION_COST} Fahhcoin - you have{' '}
                  {balance}.
                </p>
                {onGetCoins && (
                  <GameButton variant="gold" size="sm" onClick={onGetCoins}>
                    Get Fahhcoin
                  </GameButton>
                )}
              </div>
            )}
            {createError && (
              <p className="game-controls-hint game-controls-hint-error">
                {createError}
              </p>
            )}
          </form>
        </section>
      </div>

      <section className="game-card club-card">
        <h3 className="game-card-title game-card-title-sm">Browse Clubs</h3>
        <div className="club-search">
          <IconSearch className="club-search-icon" />
          <input
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            type="text"
            className="game-club-input"
            placeholder="Search by name"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadClubs(searchText.trim())
            }}
          />
          <GameButton
            variant="accent"
            onClick={() => loadClubs(searchText.trim())}
            disabled={loadingClubs}
          >
            Search
          </GameButton>
        </div>

        {browseError ? (
          <ClubError
            message={browseError}
            onRetry={() => loadClubs(searchText.trim())}
          />
        ) : loadingClubs ? (
          <>
            <span className="g-skeleton club-sk-row" aria-hidden="true" />
            <span className="g-skeleton club-sk-row" aria-hidden="true" />
          </>
        ) : clubs.length === 0 ? (
          <p className="club-state-text">
            No clubs found - try another name, or start your own above.
          </p>
        ) : (
          <ul className="game-rows">
            {clubs.map((club) => {
              const requested = joinedRequestIds.includes(club.id)
              return (
                <li key={club.id}>
                  {/* Tapping the club opens its info page; Join works
                      straight from the row too. */}
                  <div
                    className="game-row game-row-clickable"
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${club.name}`}
                    onClick={() => openClubInfo(club)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openClubInfo(club)
                      }
                    }}
                  >
                    <ClubBadge name={club.name} size={44} />
                    <span className="game-row-info">
                      <span className="game-row-name">{club.name}</span>
                      <span className="game-row-meta">
                        {club.memberCount} / {CLUB_MAX_MEMBERS} members
                      </span>
                    </span>
                    <GameButton
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleJoin(club)
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      disabled={joiningId === club.id || requested}
                    >
                      {requested
                        ? 'Requested'
                        : joiningId === club.id
                          ? 'Sending…'
                          : 'Join'}
                    </GameButton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {joinError && (
          <p className="game-controls-hint game-controls-hint-error">
            {joinError}
          </p>
        )}
      </section>
    </div>
  )
}
