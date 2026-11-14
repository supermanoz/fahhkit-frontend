import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError, canManageEvents } from '../api/client'
import {
  getCurrentSeasonPartners,
  getLeaderboardViewReport,
  getPartnerLinkVisitReport,
} from '../api/sponsorPartners'
import { useCurrentUser } from '../hooks/useCurrentUser'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import {
  buildBannerRows,
  dailyViewSeries,
  formatPercent,
  isValidRange,
  presetRange,
  sortRows,
  summarize,
  toCsv,
} from '../utils/sponsorReport'
import './SponsorReportPage.css'
import { formatNumber } from '../utils/format'

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'custom', label: 'Custom' },
]

const COLUMNS = [
  { key: 'banner', label: 'Banner' },
  { key: 'status', label: 'Status' },
  { key: 'clicks', label: 'Clicks', numeric: true },
  { key: 'uniqueClickers', label: 'Unique clickers', numeric: true },
  { key: 'ctr', label: 'CTR', numeric: true },
]

function downloadCsv(csv, from, to) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `sponsor-report_${from}_${to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Moderator/admin sponsor-banner report: how often the leaderboard (where the
// banner carousel sits) was opened, and how many times each sponsor's "View"
// was tapped. Both counters are already kept by the backend
// (/v1/moderator/report/*). There is no per-banner impression counter, so CTR
// is clicks / leaderboard views.
export default function SponsorReportPage() {
  const { user, loading: userLoading } = useCurrentUser()
  const allowed = canManageEvents(user)

  const [preset, setPreset] = useState('7d')
  const [range, setRange] = useState(() => presetRange('7d'))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sort, setSort] = useState({ key: 'clicks', dir: 'desc' })

  const load = useCallback(async (r) => {
    if (!isValidRange(r.from, r.to)) return
    setLoading(true)
    setError(null)
    try {
      const [visits, views, partners] = await Promise.all([
        getPartnerLinkVisitReport(r.from, r.to),
        getLeaderboardViewReport(r.from, r.to),
        getCurrentSeasonPartners().catch(() => []),
      ])
      setData({ visits: visits || [], views: views || [], partners })
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load the report.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (allowed) load(range)
  }, [allowed, range, load])

  function choosePreset(id) {
    setPreset(id)
    if (id !== 'custom') setRange(presetRange(id))
  }

  const summary = useMemo(
    () => (data ? summarize(data.visits, data.views) : null),
    [data]
  )
  const rows = useMemo(
    () =>
      data
        ? sortRows(
            buildBannerRows(data.visits, data.partners, summary.views),
            sort.key,
            sort.dir
          )
        : [],
    [data, summary, sort]
  )
  const series = useMemo(
    () => (data ? dailyViewSeries(data.views) : []),
    [data]
  )

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'banner' || key === 'status' ? 'asc' : 'desc' }
    )
  }

  if (userLoading) {
    return (
      <div className="sponsor-report-page">
        <Navbar />
        <div className="sponsor-report-wrap">
          <p className="moderators-muted">Loading…</p>
        </div>
        <Footer />
      </div>
    )
  }
  if (!allowed) return <Navigate to="/" replace />

  return (
    <div className="sponsor-report-page">
      <Navbar />
      <div className="sponsor-report-wrap">
        <header className="moderators-header">
          <div>
            <h1>Sponsor report</h1>
            <p>Leaderboard views and sponsor banner clicks.</p>
          </div>
          <button
            type="button"
            className="sponsor-report-export"
            disabled={!data || rows.length === 0}
            onClick={() =>
              downloadCsv(
                toCsv(rows, { ...range, views: summary.views }),
                range.from,
                range.to
              )
            }
          >
            Export CSV
          </button>
        </header>

        <div className="sponsor-report-controls">
          <div
            className="sponsor-report-presets"
            role="group"
            aria-label="Date range"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`sponsor-report-preset ${preset === p.id ? 'active' : ''}`}
                aria-pressed={preset === p.id}
                onClick={() => choosePreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="sponsor-report-custom">
              <label>
                From
                <input
                  type="date"
                  value={range.from}
                  max={range.to || undefined}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, from: e.target.value }))
                  }
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={range.to}
                  min={range.from || undefined}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, to: e.target.value }))
                  }
                />
              </label>
            </div>
          )}
        </div>

        {error && (
          <p className="sponsor-report-error" role="alert">
            {error}
          </p>
        )}
        {!isValidRange(range.from, range.to) && (
          <p className="moderators-muted">Pick a valid date range.</p>
        )}
        {loading && !data && <p className="moderators-muted">Loading…</p>}

        {data && summary && (
          <>
            <div className="sponsor-report-summary">
              <div className="sponsor-report-stat" data-testid="stat-views">
                <span>Leaderboard views</span>
                <strong>{formatNumber(summary.views)}</strong>
              </div>
              <div className="sponsor-report-stat" data-testid="stat-clicks">
                <span>Banner clicks</span>
                <strong>{formatNumber(summary.clicks)}</strong>
              </div>
              <div className="sponsor-report-stat" data-testid="stat-ctr">
                <span>CTR</span>
                <strong>{formatPercent(summary.ctr)}</strong>
              </div>
            </div>

            <div className="sponsor-report-card">
              <h2>Daily leaderboard views</h2>
              {series.length === 0 ? (
                <p className="moderators-muted">No views in this range.</p>
              ) : (
                <div className="sponsor-report-chart">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="views"
                        name="Views"
                        stroke="#dd571c"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="sponsor-report-card">
              <h2>Banners</h2>
              {rows.length === 0 ? (
                <p className="moderators-muted">
                  No banner clicks in this range.
                </p>
              ) : (
                <div className="sponsor-report-table-wrap">
                  <table className="sponsor-report-table">
                    <thead>
                      <tr>
                        {COLUMNS.map((c) => (
                          <th
                            key={c.key}
                            className={c.numeric ? 'num' : ''}
                            aria-sort={
                              sort.key === c.key
                                ? sort.dir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(c.key)}
                            >
                              {c.label}
                              {sort.key === c.key &&
                                (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key}>
                          <td>{r.banner}</td>
                          <td>{r.status}</td>
                          <td className="num">{formatNumber(r.clicks)}</td>
                          <td className="num">
                            {formatNumber(r.uniqueClickers)}
                          </td>
                          <td className="num">{formatPercent(r.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="sponsor-report-note">
                CTR = banner clicks ÷ leaderboard views. Unique clickers counts
                logged-in players only.
              </p>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
