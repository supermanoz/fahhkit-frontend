/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { FaSearch, FaUsers } from 'react-icons/fa'
import { ApiError } from '../api/client'
import {
  createClub,
  findClubs,
  getMyClub,
  leaveClub,
  requestToJoinClub,
} from '../api/club'

// Club tab, MVP scope: create a club (if you're not in one), browse/search
// existing clubs, request to join, leave your own. Leader/co-leader tooling
// (review requests, roster, kick/promote/demote/transfer) is a real backend
// feature (see ClubController) but has no UI here yet - a deliberate scope
// cut, not an oversight.
export default function ClubPanel({ hasClub, onClubChanged }) {
  const [myClub, setMyClub] = useState(null)
  const [loadingMyClub, setLoadingMyClub] = useState(true)
  const [myClubError, setMyClubError] = useState(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState(null)

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

  async function loadMyClub() {
    setLoadingMyClub(true)
    setMyClubError(null)
    try {
      const club = await getMyClub()
      setMyClub(club)
    } catch (err) {
      setMyClubError(
        err instanceof ApiError ? err.message : 'Could not load your club.'
      )
    } finally {
      setLoadingMyClub(false)
    }
  }

  async function loadClubs(text) {
    setLoadingClubs(true)
    setBrowseError(null)
    try {
      const page = await findClubs(1, 20, text)
      setClubs(page?.content || [])
    } catch (err) {
      setBrowseError(
        err instanceof ApiError ? err.message : 'Could not load clubs.'
      )
    } finally {
      setLoadingClubs(false)
    }
  }

  useEffect(() => {
    if (hasClub) {
      loadMyClub()
    } else {
      loadClubs('')
    }
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
      onClubChanged?.()
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Could not create that club.'
      )
    } finally {
      setCreating(false)
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
      onClubChanged?.()
    } catch (err) {
      setLeaveError(
        err instanceof ApiError ? err.message : 'Could not leave the club.'
      )
    } finally {
      setLeaving(false)
    }
  }

  if (hasClub) {
    if (loadingMyClub) {
      return <p className="game-menu-empty">Loading your club…</p>
    }
    if (myClubError) {
      return <p className="game-menu-empty">{myClubError}</p>
    }
    if (!myClub) {
      return <p className="game-menu-empty">You&apos;re not in a club yet.</p>
    }
    return (
      <div className="game-club-mine">
        <div className="game-club-mine-header">
          <FaUsers className="game-club-mine-icon" />
          <div>
            <p className="game-club-mine-name">{myClub.name}</p>
            <p className="game-menu-list-meta">
              {myClub.memberCount} member{myClub.memberCount === 1 ? '' : 's'} ·
              Led by {myClub.leaderName}
            </p>
          </div>
        </div>
        {myClub.description && (
          <p className="game-club-mine-description">{myClub.description}</p>
        )}
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleLeave}
          disabled={leaving}
        >
          {leaving ? 'Leaving…' : 'Leave Club'}
        </button>
        {leaveError && (
          <p className="game-controls-hint game-controls-hint-error">
            {leaveError}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="game-club-browse">
      <form className="game-club-create" onSubmit={handleCreate}>
        <p className="game-menu-section-title">Create a Club</p>
        <input
          type="text"
          className="game-club-input"
          placeholder="Club name"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          maxLength={60}
        />
        <input
          type="text"
          className="game-club-input"
          placeholder="Description (optional)"
          value={createDescription}
          onChange={(e) => setCreateDescription(e.target.value)}
          maxLength={200}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={creating || !createName.trim()}
        >
          {creating ? 'Creating…' : 'Create Club'}
        </button>
        {createError && (
          <p className="game-controls-hint game-controls-hint-error">
            {createError}
          </p>
        )}
      </form>

      <p className="game-menu-section-title">Browse Clubs</p>
      <div className="game-club-search">
        <FaSearch className="game-club-search-icon" />
        <input
          type="text"
          className="game-club-input"
          placeholder="Search by name"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadClubs(searchText.trim())
          }}
        />
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => loadClubs(searchText.trim())}
          disabled={loadingClubs}
        >
          Search
        </button>
      </div>

      {browseError ? (
        <p className="game-menu-empty">{browseError}</p>
      ) : loadingClubs ? (
        <p className="game-menu-empty">Loading clubs…</p>
      ) : clubs.length === 0 ? (
        <p className="game-menu-empty">No clubs found — be the first.</p>
      ) : (
        <ul className="game-menu-list">
          {clubs.map((club) => {
            const requested = joinedRequestIds.includes(club.id)
            return (
              <li key={club.id}>
                <div className="game-store-item">
                  <span className="game-store-item-info">
                    <span className="game-menu-list-area">{club.name}</span>
                    <span className="game-menu-list-meta">
                      {club.memberCount} member
                      {club.memberCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleJoin(club)}
                    disabled={joiningId === club.id || requested}
                  >
                    {requested
                      ? 'Requested'
                      : joiningId === club.id
                        ? 'Sending…'
                        : 'Join'}
                  </button>
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
    </div>
  )
}
