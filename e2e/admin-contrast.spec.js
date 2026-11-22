import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Admin pages put text on white "paper" cards. The text must be explicit dark
// ink (never the dark page theme's light --text) with >= 4.5:1 contrast, in
// both themes and in hover/focus states.
const ADMIN = { ...VETERAN, user: { ...VETERAN.user, userType: 'ADMIN' } }

const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const day = (n) => iso(new Date(today.getTime() - n * 864e5))

const VIEWS = [0, 1, 2, 3, 4].map((n) => ({
  date: day(4 - n),
  leaderboardType: 'INDIVIDUAL',
  views: 40 + n * 7,
}))
const VISITS = [
  {
    partnerId: 'p1',
    partnerName: 'Everest Energy',
    linkIndex: 1,
    visits: 42,
    uniqueUsers: 30,
  },
  {
    partnerId: 'p2',
    partnerName: 'Himal Gear',
    linkIndex: 1,
    visits: 18,
    uniqueUsers: 15,
  },
  {
    partnerId: 'p3',
    partnerName: 'Old Sponsor',
    linkIndex: 1,
    visits: 3,
    uniqueUsers: 3,
  },
]
const PARTNERS = [
  { id: 'p1', name: 'Everest Energy', active: true },
  { id: 'p2', name: 'Himal Gear', active: true },
  { id: 'p3', name: 'Old Sponsor', active: false },
]
const FLAGS = {
  content: ['PENDING', 'CONFIRMED', 'DISMISSED'].map((status, i) => ({
    id: `f${i}`,
    status,
    userId: `u${i}`,
    userName: `Runner ${i}`,
    reason: 'Impossible pace on a recorded run',
    createdAt: today.toISOString(),
  })),
  totalPages: 1,
  pageNumber: 1,
}

// In the page: every text element inside `root`, its colour, the first opaque
// background up the tree, and the contrast ratio.
function audit(rootSel) {
  const lum = (c) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number)
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c.length === 3 || (c.length === 4 && c[3] === 1)) return c
    }
    return [255, 255, 255]
  }
  const out = []
  for (const el of document.querySelector(rootSel).querySelectorAll('*')) {
    if (el.closest('svg')) continue
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim()
    )
    if (!own) continue
    const cs = getComputedStyle(el)
    const [a, b] = [lum(parse(cs.color)), lum(bgOf(el))].sort((x, y) => y - x)
    out.push({
      text: el.textContent.trim().slice(0, 30),
      ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100,
      cls: el.className || el.tagName,
    })
  }
  return out
}
const bad = (rows) => rows.filter((r) => r.ratio < 4.5)

async function setup(page, theme) {
  await seedSession(page, ADMIN)
  // ThemeContext reads the theme from this key (and rewrites data-theme).
  await page.addInitScript(
    (t) => localStorage.setItem('fahhkit-theme', t),
    theme
  )
  await page.route('**/v1/user/find/logged-in', (r) =>
    r.fulfill(ok(ADMIN.user))
  )
  await page.route('**/v1/moderator/report/leaderboard-views*', (r) =>
    r.fulfill(ok(VIEWS))
  )
  await page.route('**/v1/moderator/report/partner-link-visits*', (r) =>
    r.fulfill(ok(VISITS))
  )
  await page.route('**/v1/partner/current', (r) => r.fulfill(ok(PARTNERS)))
  await page.route('**/v1/fraud-flag/find*', (r) => r.fulfill(ok(FLAGS)))
}

for (const theme of ['dark', 'light']) {
  test(`Sponsor report: every text on the cards is AA (${theme} theme)`, async ({
    mockedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'one viewport is enough')
    await setup(page, theme)
    await page.goto('/admin/sponsor-report')
    await expect(page.getByText('Leaderboard views').first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.locator('.sponsor-report-table tbody tr')).toHaveCount(3)
    await page.waitForTimeout(600)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    // Labels + numbers are dark ink on white.
    const stat = page.locator('.sponsor-report-stat').first()
    await expect(stat.locator('strong')).toHaveCSS('color', 'rgb(27, 21, 18)')
    await expect(stat.locator('span')).toHaveCSS('color', 'rgb(107, 98, 91)')
    await expect(stat).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(page.locator('.sponsor-report-card h2').first()).toHaveCSS(
      'color',
      'rgb(27, 21, 18)'
    )
    await expect(page.locator('.sponsor-report-table td').first()).toHaveCSS(
      'color',
      'rgb(27, 21, 18)'
    )
    await expect(page.locator('.sponsor-report-table th').first()).toHaveCSS(
      'text-transform',
      'uppercase'
    )
    // Status chips read as active / inactive.
    await expect(page.locator('.sponsor-report-chip.on')).toHaveCount(2)
    await expect(page.locator('.sponsor-report-chip:not(.on)')).toHaveText(
      'Inactive'
    )

    const rows = await page.evaluate(audit, '.sponsor-report-wrap')
    expect(bad(rows), JSON.stringify(bad(rows))).toEqual([])

    // Hover row, keyboard focus on a sort header, the active preset.
    await page.locator('.sponsor-report-table tbody tr').nth(1).hover()
    const hov = await page.evaluate(audit, '.sponsor-report-table')
    expect(bad(hov), JSON.stringify(bad(hov))).toEqual([])
    await page.locator('.sponsor-report-table th button').first().focus()
    await expect(
      page.locator('.sponsor-report-table th button').first()
    ).toHaveCSS('outline-style', 'solid')

    // Custom range inputs are readable too.
    await page.getByRole('button', { name: /custom/i }).click()
    await expect(
      page.locator('.sponsor-report-custom input').first()
    ).toBeVisible()
    const ctl = await page.evaluate(audit, '.sponsor-report-controls')
    expect(bad(ctl), JSON.stringify(bad(ctl))).toEqual([])
  })

  test(`Fraud flags: card text is AA (${theme} theme)`, async ({
    mockedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'one viewport is enough')
    await setup(page, theme)
    await page.goto('/admin/fraud-flags')
    await expect(page.locator('.fraud-flag-card').first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const rows = await page.evaluate(audit, '.fraud-wrap')
    expect(bad(rows), JSON.stringify(bad(rows))).toEqual([])
    await page.locator('.fraud-flag-main').first().hover()
    const hov = await page.evaluate(audit, '.fraud-flag-list')
    expect(bad(hov), JSON.stringify(bad(hov))).toEqual([])
  })
}
