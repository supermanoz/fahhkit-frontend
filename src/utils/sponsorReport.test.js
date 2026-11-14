import { describe, it, expect } from 'vitest'
import {
  ctr,
  presetRange,
  isValidRange,
  dailyViewSeries,
  buildBannerRows,
  summarize,
  sortRows,
  toCsv,
  formatPercent,
} from './sponsorReport'

describe('ctr', () => {
  it('is clicks / views', () => {
    expect(ctr(5, 20)).toBe(0.25)
  })
  it('is 0 when there are no views', () => {
    expect(ctr(5, 0)).toBe(0)
  })
})

describe('presetRange', () => {
  const now = new Date(2026, 10, 13)
  it('today', () => {
    expect(presetRange('today', now)).toEqual({
      from: '2026-11-13',
      to: '2026-11-13',
    })
  })
  it('7d includes today (7 days total)', () => {
    expect(presetRange('7d', now)).toEqual({
      from: '2026-11-07',
      to: '2026-11-13',
    })
  })
  it('30d crosses a month boundary', () => {
    expect(presetRange('30d', now).from).toBe('2026-10-15')
  })
})

describe('isValidRange', () => {
  it('needs both ends, in order', () => {
    expect(isValidRange('2026-11-01', '2026-11-02')).toBe(true)
    expect(isValidRange('2026-11-02', '2026-11-01')).toBe(false)
    expect(isValidRange('', '2026-11-01')).toBe(false)
  })
})

describe('report maths', () => {
  const viewRows = [
    { date: '2026-11-02', views: 30, uniqueViewers: 10 },
    { date: '2026-11-01', views: 20, uniqueViewers: 8 },
    { date: '2026-11-01', views: 10, uniqueViewers: 4 },
  ]
  const visits = [
    {
      partnerId: 'a',
      partnerName: 'Acme',
      linkIndex: 1,
      visits: 12,
      uniqueUsers: 6,
    },
    {
      partnerId: 'b',
      partnerName: 'Bolt, Inc',
      linkIndex: 1,
      visits: 3,
      uniqueUsers: 3,
    },
  ]

  it('folds rows per day, oldest first', () => {
    expect(dailyViewSeries(viewRows)).toEqual([
      { date: '2026-11-01', views: 30 },
      { date: '2026-11-02', views: 30 },
    ])
  })
  it('summarizes totals and CTR', () => {
    expect(summarize(visits, viewRows)).toEqual({
      views: 60,
      clicks: 15,
      ctr: 0.25,
    })
  })
  it('summary CTR is 0 with no views', () => {
    expect(summarize(visits, []).ctr).toBe(0)
  })
  it('builds rows with status and per-banner CTR', () => {
    const rows = buildBannerRows(
      visits,
      [
        { id: 'a', active: true },
        { id: 'b', active: false },
      ],
      60
    )
    expect(rows[0]).toMatchObject({
      banner: 'Acme',
      status: 'Active',
      clicks: 12,
      uniqueClickers: 6,
      ctr: 0.2,
    })
    expect(rows[1].status).toBe('Inactive')
  })
  it('unknown partner has no status', () => {
    expect(buildBannerRows(visits, [], 60)[0].status).toBe('—')
  })
  it('sorts numerically and by text', () => {
    const rows = buildBannerRows(visits, [], 60)
    expect(sortRows(rows, 'clicks', 'desc')[0].banner).toBe('Acme')
    expect(sortRows(rows, 'clicks', 'asc')[0].banner).toBe('Bolt, Inc')
    expect(sortRows(rows, 'banner', 'asc')[0].banner).toBe('Acme')
  })
  it('exports CSV with quoting', () => {
    const rows = buildBannerRows(visits, [], 60)
    const csv = toCsv(rows, { from: '2026-11-01', to: '2026-11-02', views: 60 })
    expect(csv).toContain('Banner,Link,Status,Clicks,Unique clickers,CTR')
    expect(csv).toContain('"Bolt, Inc",1,—,3,3,5.0%')
    expect(formatPercent(0.25)).toBe('25.0%')
  })
})
