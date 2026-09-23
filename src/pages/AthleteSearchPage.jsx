import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaCity,
  FaEnvelope,
  FaPhone,
  FaUser,
} from 'react-icons/fa'
import { ApiError, canManageEvents, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { formatName } from '../utils/format'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import SearchFilters from '../components/SearchFilters'
import {
  emptyFilterValues,
  hasActiveFilters,
  toBackendDate,
} from '../utils/searchFilters'
import './AthleteSearchPage.css'

const PAGE_SIZE = 30

const ATHLETE_FILTER_FIELDS = [
  {
    key: 'name',
    label: 'Athlete name',
    placeholder: 'e.g. Sita Rai',
    icon: FaUser,
  },
  {
    key: 'phone',
    label: 'Phone number',
    type: 'tel',
    placeholder: 'e.g. 98XXXXXXXX',
    icon: FaPhone,
  },
  {
    key: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'e.g. sita@mail.com',
    icon: FaEnvelope,
  },
  {
    key: 'city',
    label: 'City',
    placeholder: 'e.g. Kathmandu',
    icon: FaCity,
  },
  {
    key: 'joinedOn',
    label: 'Joined on',
    type: 'date',
    icon: FaCalendarAlt,
  },
]

// actionType FILTER ANDs every entry together (see the backend's
// DynamicWhereClause), so each filled-in box narrows the list further. Name,
// phone, email and joined date live on the joined User; city is on Athlete.
// Gender/status aren't offered: the join filter is a LIKE, so "MALE" would
// also match "FEMALE" and "ACTIVE" would match "INACTIVE".
function buildAthleteSearch(filters) {
  const search = []
  const userLike = (field, value) => ({
    field,
    value,
    type: 'object',
    object: 'user',
  })
  const name = filters.name.trim()
  const phone = filters.phone.trim()
  const email = filters.email.trim()
  const city = filters.city.trim()
  if (name) search.push(userLike('fullName', name))
  if (phone) search.push(userLike('mobileNumber', phone))
  if (email) search.push(userLike('email', email))
  if (city) search.push({ field: 'city', value: city })
  if (filters.joinedOn) {
    search.push({
      ...userLike('joinedDate', toBackendDate(filters.joinedOn)),
      subType: 'date',
    })
  }
  return search
}

export default function AthleteSearchPage() {
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const [athletes, setAthletes] = useState([])
  const [filters, setFilters] = useState(() =>
    emptyFilterValues(ATHLETE_FILTER_FIELDS)
  )
  // Debounced so typing in a box doesn't fire a request per keystroke.
  const debouncedFilters = useDebouncedValue(filters)
  const filtering = hasActiveFilters(debouncedFilters)
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

  // A new set of filters invalidates the current page.
  useEffect(() => {
    setPage(1)
  }, [debouncedFilters])

  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    postJson('/v1/athlete/find', {
      pageNumber: page,
      noOfRecords: PAGE_SIZE,
      actionType: 'FILTER',
      search: buildAthleteSearch(debouncedFilters),
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
  }, [userLoading, allowed, page, debouncedFilters])

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

        <SearchFilters
          fields={ATHLETE_FILTER_FIELDS}
          values={filters}
          onChange={setFilters}
          title="Find an athlete"
          idPrefix="athlete-filter"
          quickField="name"
        />

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="athlete-search-muted">Loading athletes...</p>}
        {!loading && !error && athletes.length === 0 && (
          <p className="athlete-search-muted">
            {filtering
              ? 'No athletes match those filters. Try loosening one up.'
              : 'No athletes found.'}
          </p>
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
