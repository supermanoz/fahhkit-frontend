import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Admin "Sponsor report" page, against mocked /v1/moderator/report/* data.
const ADMIN = {
  ...VETERAN,
  user: { ...VETERAN.user, userType: 'ADMIN' },
}

const VISITS = [
  {
    partnerId: 'p1',
    partnerName: 'Acme Running Co',
    linkIndex: 1,
    visits: 12,
    uniqueUsers: 6,
  },
  {
    partnerId: 'p2',
    partnerName: 'Bolt, Inc',
    linkIndex: 1,
    visits: 30,
    uniqueUsers: 20,
  },
]
const VIEWS = [
  { date: '2026-11-11', views: 40, uniqueViewers: 15 },
  { date: '2026-11-12', views: 60, uniqueViewers: 22 },
  { date: '2026-11-13', views: 100, uniqueViewers: 30 },
]
const PARTNERS = [
  { id: 'p1', name: 'Acme Running Co', active: true },
  { id: 'p2', name: 'Bolt, Inc', active: false },
]

test.describe('Sponsor report page', () => {
  let visitQueries

  test.beforeEach(async ({ mockedPage: page }) => {
    visitQueries = []
    await seedSession(page, ADMIN)
    await page.route('**/v1/user/find/logged-in', (r) =>
      r.fulfill(ok(ADMIN.user))
    )
    await page.route('**/v1/moderator/report/partner-link-visits*', (r) => {
      visitQueries.push(new URL(r.request().url()).searchParams.toString())
      return r.fulfill(ok(VISITS))
    })
    await page.route('**/v1/moderator/report/leaderboard-views*', (r) =>
      r.fulfill(ok(VIEWS))
    )
    await page.route('**/v1/partner/current', (r) => r.fulfill(ok(PARTNERS)))
    await page.goto('/admin/sponsor-report')
    await expect(
      page.getByRole('heading', { name: 'Sponsor report' })
    ).toBeVisible()
  })

  test('shows the summary, banner table and chart', async ({
    mockedPage: page,
  }) => {
    await expect(page.getByTestId('stat-views')).toContainText('200')
    await expect(page.getByTestId('stat-clicks')).toContainText('42')
    await expect(page.getByTestId('stat-ctr')).toContainText('21.0%')

    const rows = page.locator('.sponsor-report-table tbody tr')
    await expect(rows).toHaveCount(2)
    // Default sort: most clicks first.
    await expect(rows.nth(0)).toContainText('Bolt, Inc')
    await expect(rows.nth(0)).toContainText('Inactive')
    await expect(rows.nth(0)).toContainText('15.0%')
    await expect(rows.nth(1)).toContainText('Acme Running Co')
    await expect(page.locator('.sponsor-report-chart')).toBeVisible()
    await page.screenshot({
      path: 'screenshots/sponsor-report/report-page.png',
      fullPage: true,
    })
  })

  test('sorts when a column header is clicked', async ({
    mockedPage: page,
  }) => {
    await page.getByRole('button', { name: /^Banner/ }).click()
    await expect(
      page.locator('.sponsor-report-table tbody tr').first()
    ).toContainText('Acme Running Co')
  })

  test('range presets and custom dates refetch with from/to', async ({
    mockedPage: page,
  }) => {
    await page.getByRole('button', { name: '30 days' }).click()
    await expect.poll(() => visitQueries.length).toBeGreaterThan(1)
    await page.getByRole('button', { name: 'Custom' }).click()
    await page.getByLabel('From', { exact: true }).fill('2026-11-01')
    await page.getByLabel('To', { exact: true }).fill('2026-11-05')
    await expect
      .poll(() => visitQueries.at(-1))
      .toBe('from=2026-11-01&to=2026-11-05')
  })

  test('exports the table as CSV', async ({ mockedPage: page }) => {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^sponsor-report_.*\.csv$/)
    const fs = await import('node:fs/promises')
    const csv = await fs.readFile(await download.path(), 'utf8')
    expect(csv).toContain('Banner,Link,Status,Clicks,Unique clickers,CTR')
    expect(csv).toContain('"Bolt, Inc",1,Inactive,30,20,15.0%')
  })
})

test.describe('Sponsor report access', () => {
  test('is not available to a normal player', async ({ mockedPage: page }) => {
    await seedSession(page, VETERAN)
    await page.goto('/admin/sponsor-report')
    await expect(page).not.toHaveURL(/sponsor-report/)
    await expect(
      page.getByRole('heading', { name: 'Sponsor report' })
    ).toHaveCount(0)
  })
})
