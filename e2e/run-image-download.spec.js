import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// The web "Download" button on a History run image is unchanged by the
// native save-to-Photos work: it still triggers a normal browser download of
// the right file, and the native-only Share button / permission message do
// not appear. (The native branch is unit-tested in
// src/utils/saveImage.test.js with the plugins mocked.)
const POINTS = Array.from({ length: 40 }, (_, i) => {
  const t = (i / 39) * Math.PI * 2
  return {
    lat: 27.7172 + Math.sin(t) * 0.0025,
    lng: 85.324 + Math.cos(t) * 0.0032,
  }
})
const RUN = {
  id: 'run-1',
  distance: 5200,
  duration: 1800,
  avgPace: 346,
  startedAt: '2026-11-01T06:30:00',
  points: POINTS,
}

test.describe('Run image download (web)', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.setTimeout(150_000)

  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
      page.getByText('Not now').click()
    )
    await page.route('**/v1/run/find', (route) =>
      route.fulfill(
        ok({
          content: [RUN],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 10,
        })
      )
    )
    await page.route(/\/v1\/run\/run-1$/, (route) => route.fulfill(ok(RUN)))
    await page.goto('/game')
    await expect(page.locator('.game-hud-level')).toBeVisible({
      timeout: 90_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Me', exact: true }).click()
    await page.locator('.game-me-history-row').first().click()
    await expect(page.locator('.share-carousel')).toBeVisible()
  })

  test('Download PNG saves a file named after the run; no native UI', async ({
    mockedPage: page,
  }) => {
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0)
    await expect(page.locator('.share-carousel-permission')).toHaveCount(0)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download PNG' }).first().click(),
    ])
    expect(download.suggestedFilename()).toBe('run-conquest-hero-run-1.png')
    await page.screenshot({ path: 'screenshots/run-image-download/web.png' })
  })

  test('the Overlay card is the third slide and downloads as run-conquest-overlay-<id>.png', async ({
    mockedPage: page,
  }) => {
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Next style' }).click()
    }
    await expect(page.getByText('Overlay', { exact: true })).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download PNG' }).nth(2).click(),
    ])
    expect(download.suggestedFilename()).toBe('run-conquest-overlay-run-1.png')
  })

  test('the map card still downloads as a JPG', async ({
    mockedPage: page,
  }) => {
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Next style' }).click()
    }
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download JPG' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('run-conquest-run-run-1-map.jpg')
  })
})
