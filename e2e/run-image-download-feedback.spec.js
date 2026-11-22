import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Download-button feedback (idle / loading / success / error) at 390px.
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

test.describe('Run image download feedback', () => {
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

  // Slow down (and optionally fail) the canvas export so the states can be seen.
  async function mockExport(page, { fail }) {
    await page.evaluate((shouldFail) => {
      const orig = HTMLCanvasElement.prototype.toBlob
      HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) {
        setTimeout(() => {
          if (shouldFail) cb(null)
          else orig.call(this, cb, ...rest)
        }, 1200)
      }
    }, fail)
  }
  const DIR = 'screenshots/download-feedback'

  test('idle -> loading -> success, with toast', async ({
    mockedPage: page,
  }) => {
    await mockExport(page, { fail: false })
    const btn = page.getByTestId('download-transparent')
    await expect(btn).toHaveAttribute('data-state', 'idle')
    await page.waitForTimeout(800) // the modal's scale-in has settled
    const idleBox = await btn.boundingBox()
    await page.screenshot({ path: `${DIR}/1-idle.png` })
    await btn.click()
    await expect(btn).toHaveAttribute('data-state', 'loading')
    await expect(btn).toBeDisabled()
    await expect(btn).toContainText('Saving...')
    expect((await btn.boundingBox()).height).toBe(idleBox.height)
    await page.screenshot({ path: `${DIR}/2-loading.png` })
    await expect(btn).toHaveAttribute('data-state', 'success', {
      timeout: 5000,
    })
    await expect(btn).toContainText('Downloaded')
    await expect(page.getByTestId('export-toast')).toContainText('Downloaded')
    await page.screenshot({ path: `${DIR}/3-success.png` })
    await expect(btn).toHaveAttribute('data-state', 'idle', { timeout: 4000 })
    await expect(page.getByTestId('export-toast')).toHaveCount(0)
  })

  test('failure shows the red state and re-enables the button', async ({
    mockedPage: page,
  }) => {
    await mockExport(page, { fail: true })
    const btn = page.getByTestId('download-transparent')
    await btn.click()
    await expect(btn).toHaveAttribute('data-state', 'error', { timeout: 5000 })
    // The button becomes Retry; the plain reason sits under it and a short
    // toast confirms.
    await expect(btn).toContainText('Retry')
    await expect(btn).toBeEnabled()
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't save. Check Photos permission and try again."
    )
    await expect(page.getByTestId('export-toast')).toBeVisible()
    await page.screenshot({ path: `${DIR}/4-error.png` })
  })
})
