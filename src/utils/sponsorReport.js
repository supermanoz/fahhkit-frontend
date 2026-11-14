// Pure helpers for the admin Sponsor report (no React/DOM - unit-testable).
//
// Data comes from two backend reports (/v1/moderator/report):
//  - partner-link-visits: clicks on a sponsor banner's "View" (per partner link)
//  - leaderboard-views: how often the leaderboard (where the banner carousel
//    sits) was opened, per day
// The backend has no per-banner impression counter, so a banner's CTR is
// clicks / leaderboard views in the range.

function pad(n) {
  return String(n).padStart(2, '0')
}

export function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Preset ranges, both ends inclusive and ending today.
export function presetRange(preset, now = new Date()) {
  const days = { today: 0, '7d': 6, '30d': 29 }[preset]
  const from = new Date(now)
  from.setDate(from.getDate() - (days ?? 0))
  return { from: toDateKey(from), to: toDateKey(now) }
}

export function isValidRange(from, to) {
  return Boolean(from && to && from <= to)
}

// clicks / views, 0 when there are no views.
export function ctr(clicks, views) {
  return views > 0 ? clicks / views : 0
}

export function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}

// Several rows can share a date (one per leaderboard type) - fold them into
// one point per day, oldest first.
export function dailyViewSeries(rows) {
  const byDate = new Map()
  for (const r of rows || []) {
    const cur = byDate.get(r.date) || { date: r.date, views: 0 }
    cur.views += r.views || 0
    byDate.set(r.date, cur)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// One table row per partner link, joined with the partner's active flag.
export function buildBannerRows(visits, partners, totalViews) {
  const byId = new Map((partners || []).map((p) => [p.id, p]))
  return (visits || []).map((v) => {
    const partner = byId.get(v.partnerId)
    return {
      key: `${v.partnerId}:${v.linkIndex}`,
      banner: v.partnerName,
      link: v.linkIndex,
      status: partner ? (partner.active ? 'Active' : 'Inactive') : '—',
      clicks: v.visits || 0,
      uniqueClickers: v.uniqueUsers || 0,
      ctr: ctr(v.visits || 0, totalViews),
    }
  })
}

export function summarize(visits, viewRows) {
  const views = (viewRows || []).reduce((sum, r) => sum + (r.views || 0), 0)
  const clicks = (visits || []).reduce((sum, v) => sum + (v.visits || 0), 0)
  return { views, clicks, ctr: ctr(clicks, views) }
}

export function sortRows(rows, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
    return cmp * sign
  })
}

function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows, { from, to, views }) {
  const lines = [
    `Sponsor report,${from},${to}`,
    `Leaderboard views,${views}`,
    '',
    'Banner,Link,Status,Clicks,Unique clickers,CTR',
    ...rows.map((r) =>
      [
        r.banner,
        r.link,
        r.status,
        r.clicks,
        r.uniqueClickers,
        formatPercent(r.ctr),
      ]
        .map(csvCell)
        .join(',')
    ),
  ]
  return lines.join('\n')
}
