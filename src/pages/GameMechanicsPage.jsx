/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { FaChevronDown, FaSearch } from 'react-icons/fa'
import { ApiError, isAdmin } from '../api/client'
import { publishBroadcast } from '../api/mail'
import {
  findTerritoryCities,
  setCityRolloutEnabled,
} from '../api/territoryRollout'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import HeroAdminPanel from '../components/HeroAdminPanel'
import MailToolsPanel from '../components/MailToolsPanel'
import './GameMechanicsPage.css'

const INITIAL_NEWS_FORM = { title: '', body: '' }
const CITY_PAGE_SIZE = 8

// A collapsible section wrapper - each admin tool on this page folds shut
// independently so the page stays scannable as more tools land here (see
// the toggle buttons below) instead of it turning into one long scroll of
// every control at once.
function Section({ title, hint, open, onToggle, children }) {
  return (
    <section className="glass-card game-mechanics-section">
      <button
        type="button"
        className="game-mechanics-section-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>
          <h2>{title}</h2>
          {hint && <p className="game-mechanics-hint">{hint}</p>}
        </span>
        <FaChevronDown
          className={`game-mechanics-section-chevron ${open ? 'is-open' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="game-mechanics-section-body">{children}</div>}
    </section>
  )
}

// Admin-only control panel for the Territory Run game (/game) - the stuff
// that isn't a per-player setting: publishing news every player sees in
// their in-game mailbox, and which cities currently have territory-capture
// turned on. Same shape as the other /admin/* pages (ModeratorsPage etc.):
// gate both the data fetch and the render on isAdmin(user), redirect home
// otherwise.
export default function GameMechanicsPage() {
  const { user, loading: userLoading } = useCurrentUser()

  const [newsForm, setNewsForm] = useState(INITIAL_NEWS_FORM)
  const [newsImage, setNewsImage] = useState(null)
  const [publishingNews, setPublishingNews] = useState(false)
  const [newsBanner, setNewsBanner] = useState(null)
  const [newsOpen, setNewsOpen] = useState(true)
  const [heroesOpen, setHeroesOpen] = useState(false)
  const [mailToolsOpen, setMailToolsOpen] = useState(false)

  const [cities, setCities] = useState([])
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [citiesError, setCitiesError] = useState(null)
  const [cityBusyId, setCityBusyId] = useState(null)
  const [cityActionError, setCityActionError] = useState(null)
  const [rolloutOpen, setRolloutOpen] = useState(true)
  const [citySearch, setCitySearch] = useState('')
  const debouncedCitySearch = useDebouncedValue(citySearch)
  const [cityPage, setCityPage] = useState(1)
  const [cityTotalPages, setCityTotalPages] = useState(1)

  // Every imported city, not just the enabled ones - findTerritoryCities
  // hits the server's paginated, name-searchable browse endpoint (see
  // api/territoryRollout.js) so a moderator can find and toggle any city
  // instead of needing its numeric id memorized.
  useEffect(() => {
    setCityPage(1)
  }, [debouncedCitySearch])

  useEffect(() => {
    if (userLoading || !isAdmin(user)) {
      setCitiesLoading(false)
      return
    }
    setCitiesLoading(true)
    setCitiesError(null)
    findTerritoryCities(cityPage, CITY_PAGE_SIZE, debouncedCitySearch)
      .then((page) => {
        setCities(page?.content || [])
        setCityTotalPages(Math.max(1, page?.totalPages || 1))
      })
      .catch((err) =>
        setCitiesError(
          err instanceof ApiError ? err.message : 'Could not load cities.'
        )
      )
      .finally(() => setCitiesLoading(false))
  }, [userLoading, user, cityPage, debouncedCitySearch])

  if (userLoading) {
    return (
      <div className="game-mechanics-page">
        <Navbar />
        <div className="game-mechanics-wrap">
          <p>Loading...</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!isAdmin(user)) {
    return <Navigate to="/" replace />
  }

  async function handlePublishNews(e) {
    e.preventDefault()
    setNewsBanner(null)
    if (!e.target.reportValidity()) return
    setPublishingNews(true)
    try {
      await publishBroadcast(newsForm.title, newsForm.body, newsImage)
      setNewsForm(INITIAL_NEWS_FORM)
      setNewsImage(null)
      e.target.reset()
      setNewsBanner({ kind: 'success', message: 'Published to every player.' })
    } catch (err) {
      setNewsBanner({
        kind: 'error',
        message:
          err instanceof ApiError
            ? err.message
            : 'Could not publish that. Please try again.',
      })
    } finally {
      setPublishingNews(false)
    }
  }

  async function handleToggleCity(city) {
    setCityActionError(null)
    setCityBusyId(city.cityId)
    try {
      await setCityRolloutEnabled(city.cityId, !city.enabled)
      setCities((prev) =>
        prev.map((c) =>
          c.cityId === city.cityId ? { ...c, enabled: !city.enabled } : c
        )
      )
    } catch (err) {
      setCityActionError(
        err instanceof ApiError ? err.message : 'Could not update that city.'
      )
    } finally {
      setCityBusyId(null)
    }
  }

  return (
    <div className="game-mechanics-page">
      <Navbar />
      <div className="game-mechanics-wrap">
        <header className="game-mechanics-header" data-aos="fade-down">
          <h1>Game Mechanics</h1>
          <p>
            Territory Run admin tools - news, city rollout, heroes and player
            mail.
          </p>
        </header>

        <Section
          title="Publish News"
          hint="Shows up in every player's in-game mailbox under News."
          open={newsOpen}
          onToggle={() => setNewsOpen((o) => !o)}
        >
          {newsBanner && (
            <div className={`banner ${newsBanner.kind}`}>
              {newsBanner.message}
            </div>
          )}
          <form onSubmit={handlePublishNews} noValidate>
            <div className="field full">
              <label htmlFor="news-title">Title</label>
              <input
                id="news-title"
                type="text"
                required
                value={newsForm.title}
                onChange={(e) =>
                  setNewsForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="news-body">Body</label>
              <textarea
                id="news-body"
                rows={4}
                required
                value={newsForm.body}
                onChange={(e) =>
                  setNewsForm((prev) => ({ ...prev, body: e.target.value }))
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="news-image">
                Image <span className="opt">(optional)</span>
              </label>
              <input
                id="news-image"
                type="file"
                accept="image/*"
                onChange={(e) => setNewsImage(e.target.files[0] || null)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={publishingNews}
            >
              {publishingNews ? 'Publishing…' : 'Publish'}
            </button>
          </form>
        </Section>

        <Section
          title="Territory Rollout"
          hint="Every imported city - search by name and flip territory-capture on or off."
          open={rolloutOpen}
          onToggle={() => setRolloutOpen((o) => !o)}
        >
          <div className="game-mechanics-search-box">
            <FaSearch className="game-mechanics-search-icon" />
            <input
              type="text"
              placeholder="Search cities…"
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
            />
          </div>
          {cityActionError && (
            <div className="banner error">{cityActionError}</div>
          )}
          {citiesError && <div className="banner error">{citiesError}</div>}
          {citiesLoading ? (
            <p className="game-mechanics-muted">Loading…</p>
          ) : cities.length === 0 ? (
            <p className="game-mechanics-muted">
              {citySearch
                ? `No cities match "${citySearch}".`
                : 'No cities found.'}
            </p>
          ) : (
            <ul className="game-mechanics-city-list">
              {cities.map((city) => (
                <li key={city.cityId}>
                  <span className="game-mechanics-city-name">
                    {city.cityName}
                    <span className="game-mechanics-city-country">
                      {city.countryName}
                    </span>
                  </span>
                  <span
                    className={`game-mechanics-city-status ${city.enabled ? 'is-enabled' : ''}`}
                  >
                    {city.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={cityBusyId === city.cityId}
                    onClick={() => handleToggleCity(city)}
                  >
                    {cityBusyId === city.cityId
                      ? 'Working…'
                      : city.enabled
                        ? 'Disable'
                        : 'Enable'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cityTotalPages > 1 && (
            <div className="game-mechanics-pagination">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCityPage((p) => Math.max(1, p - 1))}
                disabled={cityPage <= 1 || citiesLoading}
              >
                Prev
              </button>
              <span className="game-mechanics-pagination-info">
                Page {cityPage} of {cityTotalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  setCityPage((p) => Math.min(cityTotalPages, p + 1))
                }
                disabled={cityPage >= cityTotalPages || citiesLoading}
              >
                Next
              </button>
            </div>
          )}
        </Section>

        <Section
          title="Heroes"
          hint="Create and edit the hero codex - name, tagline, backstory, portrait and score abilities."
          open={heroesOpen}
          onToggle={() => setHeroesOpen((o) => !o)}
        >
          <HeroAdminPanel />
        </Section>

        <Section
          title="Player Mail"
          hint="Send a single player a gifted item or a one-off notice - the private counterparts to Publish News above."
          open={mailToolsOpen}
          onToggle={() => setMailToolsOpen((o) => !o)}
        >
          <MailToolsPanel />
        </Section>
      </div>
      <Footer />
    </div>
  )
}
