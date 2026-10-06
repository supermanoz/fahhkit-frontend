import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError, isAdmin } from '../api/client'
import { publishBroadcast } from '../api/mail'
import {
  getEnabledCities,
  setCityRolloutEnabled,
} from '../api/territoryRollout'
import { useCurrentUser } from '../hooks/useCurrentUser'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './GameMechanicsPage.css'

const INITIAL_NEWS_FORM = { title: '', body: '' }

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

  const [cities, setCities] = useState([])
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [citiesError, setCitiesError] = useState(null)
  const [newCityId, setNewCityId] = useState('')
  const [cityBusyId, setCityBusyId] = useState(null)
  const [cityActionError, setCityActionError] = useState(null)

  useEffect(() => {
    if (userLoading || !isAdmin(user)) {
      setCitiesLoading(false)
      return
    }
    getEnabledCities()
      .then((data) => setCities(data || []))
      .catch((err) =>
        setCitiesError(
          err instanceof ApiError
            ? err.message
            : 'Could not load enabled cities.'
        )
      )
      .finally(() => setCitiesLoading(false))
  }, [userLoading, user])

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

  async function handleDisableCity(city) {
    setCityActionError(null)
    setCityBusyId(city.cityId)
    try {
      await setCityRolloutEnabled(city.cityId, false)
      setCities((prev) => prev.filter((c) => c.cityId !== city.cityId))
    } catch (err) {
      setCityActionError(
        err instanceof ApiError ? err.message : 'Could not update that city.'
      )
    } finally {
      setCityBusyId(null)
    }
  }

  async function handleEnableCity(e) {
    e.preventDefault()
    const cityId = Number(newCityId)
    if (!cityId) return
    setCityActionError(null)
    setCityBusyId(cityId)
    try {
      await setCityRolloutEnabled(cityId, true)
      const refreshed = await getEnabledCities()
      setCities(refreshed || [])
      setNewCityId('')
    } catch (err) {
      setCityActionError(
        err instanceof ApiError ? err.message : 'Could not enable that city.'
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
          <p>Territory Run admin tools - news and city rollout.</p>
        </header>

        <section className="glass-card game-mechanics-section">
          <h2>Publish News</h2>
          <p className="game-mechanics-hint">
            Shows up in every player&apos;s in-game mailbox under News.
          </p>
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
        </section>

        <section className="glass-card game-mechanics-section">
          <h2>Territory Rollout</h2>
          <p className="game-mechanics-hint">
            Which cities currently have territory-capture turned on.
            There&apos;s no city search yet - enabling a new one needs its
            numeric city id.
          </p>
          {cityActionError && (
            <div className="banner error">{cityActionError}</div>
          )}
          {citiesError && <div className="banner error">{citiesError}</div>}
          {citiesLoading ? (
            <p className="game-mechanics-muted">Loading…</p>
          ) : cities.length === 0 ? (
            <p className="game-mechanics-muted">No cities enabled yet.</p>
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
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={cityBusyId === city.cityId}
                    onClick={() => handleDisableCity(city)}
                  >
                    {cityBusyId === city.cityId ? 'Working…' : 'Disable'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="game-mechanics-add-city" onSubmit={handleEnableCity}>
            <input
              type="number"
              placeholder="City id"
              value={newCityId}
              onChange={(e) => setNewCityId(e.target.value)}
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!newCityId || cityBusyId != null}
            >
              Enable
            </button>
          </form>
        </section>
      </div>
      <Footer />
    </div>
  )
}
