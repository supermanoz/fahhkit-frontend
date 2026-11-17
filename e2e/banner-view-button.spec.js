import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Leaderboard banner carousel: the "View" button sits clear of the bottom
// edge and the pagination dots, for banners of different aspect ratios.
const OUT = 'screenshots/banner-view-button'
const art = (w, h, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#2d6a4f"/><text x="50%" y="50%" font-size="${h / 6}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`
const PARTNERS = [
  ['wide', 4000, 800, 'WIDE PARTNER'],
  ['season', 1983, 793, 'SEASON ART'],
  ['tall', 800, 1200, 'TALL PARTNER'],
].map(([k, w, h, label], i) => ({
  id: `p-${k}`,
  name: `Partner ${k}`,
  email: 'p@example.com',
  seasonNumber: 1,
  active: true,
  imageUrl: `https://img.test/${k}.svg`,
  socialLink1: 'https://example.com/x',
  _art: art(w, h, label),
  _i: i,
}))

test('View button clears the bottom edge and the dots', async ({
  mockedPage: page,
  context,
}, testInfo) => {
  fs.mkdirSync(OUT, { recursive: true })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.route('**/v1/partner/current', (r) =>
    r.fulfill(
      ok(PARTNERS.map((p) => ({ ...p, _art: undefined, _i: undefined })))
    )
  )
  for (const p of PARTNERS) {
    await page.route(p.imageUrl, (r) =>
      r.fulfill({ contentType: 'image/svg+xml', body: p._art })
    )
  }
  await page.goto('/game')
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  const dots = page.locator('.sponsor-banner-dot')
  await expect(dots.first()).toBeVisible()
  const n = await dots.count()
  for (let i = 0; i < n; i++) {
    await dots.nth(i).click()
    await page.waitForTimeout(500)
    const m = await page.evaluate(() => {
      const vp = document.querySelector('.sponsor-banner-viewport')
      const v = vp.getBoundingClientRect()
      const mid = v.left + v.width / 2
      const li = [...document.querySelectorAll('.sponsor-banner-slide')].find(
        (l) => {
          const r = l.getBoundingClientRect()
          return r.left <= mid && r.right >= mid
        }
      )
      const btn = li.querySelector('.sponsor-banner-view-btn')
      if (!btn) return null // the season slide has no View button
      const card = li.querySelector('.sponsor-banner-card')
      const d = document.querySelector('.sponsor-banner-dots')
      const c = card.getBoundingClientRect()
      const b = btn.getBoundingClientRect()
      return {
        cardH: c.height,
        bottomGap: c.bottom - b.bottom,
        dotsGap: d.getBoundingClientRect().top - b.bottom,
        topPct: (b.top - c.top) / c.height,
        botPct: (b.bottom - c.top) / c.height,
      }
    })
    if (m) {
      // Box-to-box gap; the button's hard shadow adds 3px on top of this.
      expect(m.bottomGap).toBeGreaterThanOrEqual(28)
      expect(m.dotsGap - 3).toBeGreaterThanOrEqual(9)
    }
    const name = i === 0 ? 'season-banner' : PARTNERS[i - 1].id
    console.log(testInfo.project.name, name, JSON.stringify(m))
    await page.locator('.sponsor-banner-viewport').screenshot({
      path: `${OUT}/${i + 1}-${name}-${testInfo.project.name}.png`,
    })
  }
})
