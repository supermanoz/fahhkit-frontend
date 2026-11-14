import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Leaderboard sponsor banner: tapping the card pings the backend's tracked
// redirect (GET /v1/partner/{id}/link/1) in the background, once, and the
// partner link still opens. A failing ping must be invisible to the player.
const PARTNER = {
  id: 'partner-1',
  name: 'Acme Running Co',
  email: 'acme@example.com',
  seasonNumber: 1,
  active: true,
  imageUrl: 'https://example.com/acme.png',
  socialLink1: 'https://example.com/acme',
}

test.describe('Sponsor banner click tracking', () => {
  let hits
  let linkStatus

  test.beforeEach(async ({ mockedPage: page, context }) => {
    hits = 0
    linkStatus = 302
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.route('**/v1/partner/current', (r) => r.fulfill(ok([PARTNER])))
    await page.route('**/v1/partner/partner-1/link/1', (r) => {
      hits += 1
      return r.fulfill({
        status: linkStatus,
        headers: { location: PARTNER.socialLink1 },
      })
    })
    // The partner's own site: a stub page, so opening it needs no real network.
    await page.route('https://example.com/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<h1>Acme</h1>' })
    )
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  })

  test('a tap counts once and still opens the partner link', async ({
    mockedPage: page,
    context,
  }) => {
    const card = page.getByRole('link', { name: 'Sponsor: Acme Running Co' })
    await expect(card).toBeVisible()
    await page.screenshot({
      path: 'screenshots/sponsor-report/banner-before-tap.png',
    })

    const popupPromise = context.waitForEvent('page')
    await card.click()
    // A quick second tap (double-tap) must not count twice.
    await card.click({ force: true }).catch(() => {})
    const popup = await popupPromise
    await expect(popup).toHaveURL('https://example.com/acme')
    await page.screenshot({
      path: 'screenshots/sponsor-report/banner-after-tap.png',
    })

    await expect.poll(() => hits).toBe(1)
  })

  test('a failing tracking call is silent and the link still opens', async ({
    mockedPage: page,
    context,
  }) => {
    linkStatus = 404
    const popupPromise = context.waitForEvent('page')
    await page.getByRole('link', { name: 'Sponsor: Acme Running Co' }).click()
    const popup = await popupPromise
    await expect(popup).toHaveURL('https://example.com/acme')
    await expect.poll(() => hits).toBe(1)
    // No error UI in the game (the fixture also fails on console/page errors).
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
