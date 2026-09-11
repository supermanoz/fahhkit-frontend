import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FaSearch } from 'react-icons/fa'
import { ApiError, canManageEvents, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { formatName } from '../utils/format'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './AthleteSearchPage.css'

const PAGE_SIZE = 30
const SEARCH_FIELDS = ['fullName', 'email', 'mobileNumber']

export default function AthleteSearchPage() {
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const [athletes, setAthletes] = useState([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()
  const [banner, setBanner] = useState(
    location.state?.message
      ? { kind: 'success', message: location.state.message }
      : null
  )

  const allowed = isAuthed && canManageEvents(user)

  useEffect(() => {
    if (location.state?.message) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!banner) return
    const timer = setTimeout(() => setBanner(null), 5000)
    return () => clearTimeout(timer)
  }, [banner])

  // Debounce the search box so we're not firing a request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => clearTimeout(timer)
  }, [query])

  // A new search term invalidates the current page.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    const search = debouncedQuery
      ? SEARCH_FIELDS.map((field) => ({
          field,
          object: 'user',
          type: 'object',
          value: debouncedQuery,
        }))
      : []
    postJson('/v1/athlete/find', {
      pageNumber: page,
      noOfRecords: PAGE_SIZE,
      actionType: debouncedQuery ? 'SEARCH' : 'FILTER',
      search,
      sort: [{ field: 'user.fullName', direction: 'asc' }],
    })
      .then((data) => {
        setAthletes(data?.content || [])
        setTotalPages(Math.max(1, data?.totalPages || 1))
        setTotalElements(data?.totalElements || 0)
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load athletes. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [userLoading, allowed, page, debouncedQuery])

  if (!userLoading && !allowed) {
    return (
      <div className="athlete-search-page">
        <Navbar />
        <div className="athlete-search-wrap">
          <div className="banner error">
            {isAuthed ? (
              "You don't have permission to view this page."
            ) : (
              <>
                <Link to="/login">Sign in</Link> as a moderator to search
                athletes.
              </>
            )}
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="athlete-search-page">
      <Navbar />
      <div className="athlete-search-wrap">
        <header className="athlete-search-header" data-aos="fade-down">
          <div>
            <h1>Search Athletes</h1>
            <p>Find an athlete to view their profile and run history.</p>
          </div>
        </header>

        {banner && (
          <div className={`banner ${banner.kind}`}>{banner.message}</div>
        )}

        <div className="athlete-search-box">
          <FaSearch className="athlete-search-icon" />
          <input
            type="text"
            placeholder="Search by name, email, or mobile number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="athlete-search-muted">Loading athletes...</p>}
        {!loading && !error && athletes.length === 0 && (
          <p className="athlete-search-muted">No athletes found.</p>
        )}

        <div className="athlete-search-list">
          {athletes.map((athlete) => (
            <Link
              to={`/athletes/${athlete.userId}`}
              className="athlete-search-card"
              key={athlete.userId}
              title={athlete.email || athlete.mobileNumber}
            >
              <span className="athlete-search-avatar">
                {(athlete.fullName || '?').charAt(0).toUpperCase()}
              </span>
              <span className="athlete-search-name">
                {formatName(athlete.fullName)}
              </span>
            </Link>
          ))}
        </div>

        {!loading && !error && totalElements > 0 && (
          <div className="athlete-search-pagination">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span className="athlete-search-pagination-info">
              Page {page} of {totalPages} &middot; {totalElements} athlete
              {totalElements === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
