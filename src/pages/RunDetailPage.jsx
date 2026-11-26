import { runExtraStats } from '../utils/runMetrics'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FaMapMarkerAlt } from 'react-icons/fa'
import { ApiError } from '../api/client'
import { getRun } from '../api/runs'
import RunMap from '../components/RunMap'
import { isIndoorRun } from '../utils/indoorRuns'
import ShareRunCarousel from '../components/ShareRunCarousel'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatRunDate,
} from '../utils/run'
import './RunDetailPage.css'

export default function RunDetailPage() {
  const { id } = useParams()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getRun(id)
      .then(setRun)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load this run. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="run-detail-page">
      <Navbar />
      <div className="run-detail-wrap">
        <Link to="/history" className="run-detail-back-link">
          &larr; Back to History
        </Link>

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="run-detail-muted">Loading...</p>}

        {!loading && run && (
          <>
            <header className="run-detail-header">
              <h1>{formatRunDate(run.startedAt)}</h1>
            </header>

            <ShareRunCarousel run={run} />

            <dl className="run-detail-stats glass-card">
              <div>
                <dt>Distance</dt>
                <dd>{formatDistance(run.distance)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(run.duration)}</dd>
              </div>
              <div>
                <dt>Avg Pace</dt>
                <dd>{formatPace(run.avgPace)}</dd>
              </div>
              {runExtraStats(run).map((row) => (
                <div key={row.key} data-testid={`run-stat-${row.key}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>

            {/* An indoor (treadmill) run has no route: no map, no button. */}
            {!isIndoorRun(run) && (
              <div className="run-detail-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowMap((v) => !v)}
                >
                  <FaMapMarkerAlt /> {showMap ? 'Hide Map' : 'View Map'}
                </button>
              </div>
            )}

            {showMap && !isIndoorRun(run) && <RunMap points={run.points} />}
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
