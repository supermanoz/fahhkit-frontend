import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Tapping Training in the Play menu goes straight to the 3-2-1-GO countdown
// and then the Training run (no intermediate panel). Screenshots:
// ./screenshots/training-start/.
const SHOT_DIR = 'screenshots/training-start'

async function openGame(page) {
  await seedSession(page, VETERAN)
  // The idle "ready to run?" nudge pops up after ~7s of no taps and would
  // cover the Play button - dismiss it whenever it shows.
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  let goneSince = null
  await expect
    .poll(
      async () => {
        if ((await page.locator('.game-loading-overlay').count()) > 0) {
          goneSince = null
          return false
        }
        goneSince ??= Date.now()
        return Date.now() - goneSince > 2500
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe(true)
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 20_000 })
  await page
    .getByText('Not now')
    .click({ timeout: 2500 })
    .catch(() => {})
}

async function tapTraining(page) {
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Training', exact: true }).click()
}

test.describe('Training start', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.setTimeout(150_000)

  test('tap Training -> countdown -> Training run', async ({
    mockedPage: page,
    context,
  }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    // Playwright's own geolocation mock can time out under load (the app
    // then shows its "Could not get your location" prompt), so feed fixes
    // from a deterministic stub - every watch gets one right away and then
    // one a second, like a real phone.
    await page.addInitScript(() => {
      const fix = () => ({
        coords: {
          latitude: 27.7172,
          longitude: 85.324,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      })
      navigator.geolocation.getCurrentPosition = (ok) => ok(fix())
      navigator.geolocation.watchPosition = (ok) => {
        setTimeout(() => ok(fix()), 0)
        return setInterval(() => ok(fix()), 1000)
      }
      navigator.geolocation.clearWatch = (id) => clearInterval(id)
    })
    await openGame(page)
    await tapTraining(page)

    const overlay = page.locator('.game-countdown-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay.locator('.game-countdown-value')).toHaveText('3')
    // No Training panel in between, and the Play menu is closed.
    await expect(page.locator('.training-intro')).toHaveCount(0)
    await expect(page.locator('.game-radial-btn')).toHaveCount(0)
    await page.screenshot({ path: `${SHOT_DIR}/countdown.png` })

    await expect(page.locator('.game-run-card')).toBeVisible({
      timeout: 30_000,
    })
    await expect(overlay).toHaveCount(0)
    // Run controls start collapsed (existing behaviour for every run mode);
    // expanding shows Pause, which only a Training run has.
    await page.getByRole('button', { name: 'Show run controls' }).click()
    await expect(page.locator('.game-run-btn-pause')).toBeVisible()
    await page.screenshot({ path: `${SHOT_DIR}/training-run.png` })
  })

  test('tapping the countdown cancels - no run starts', async ({
    mockedPage: page,
    context,
  }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await openGame(page)
    await tapTraining(page)

    const overlay = page.locator('.game-countdown-overlay')
    await expect(overlay).toBeVisible()
    await overlay.click()
    await expect(overlay).toHaveCount(0)
    await page.screenshot({ path: `${SHOT_DIR}/cancelled.png` })
    // A full countdown (3 x 0.8s + GO 0.5s) would have elapsed by now -
    // nothing may start. A real wait: the absence of a start is the point.
    await page.waitForTimeout(4000)
    await expect(page.locator('.game-run-card')).toHaveCount(0)
    await expect(page.locator('.game-menu-btn')).toBeVisible()
  })

  test('location blocked -> GPS prompt instead of the countdown', async ({
    mockedPage: page,
    context,
  }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    // Let the game load normally, then report location as denied for the
    // run start (permission state + a PERMISSION_DENIED error on watch).
    await openGame(page)
    await page.evaluate(() => {
      const deny = () => ({ state: 'denied' })
      navigator.permissions.query = async () => deny()
      const geo = navigator.geolocation
      const err = (cb) =>
        cb &&
        cb({
          code: 1,
          PERMISSION_DENIED: 1,
          message: 'User denied Geolocation',
        })
      geo.watchPosition = (_ok, onErr) => {
        err(onErr)
        return 1
      }
      geo.getCurrentPosition = (_ok, onErr) => err(onErr)
    })
    await tapTraining(page)

    await expect(page.getByText(/Location is turned off/)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('.game-countdown-overlay')).toHaveCount(0)
    await expect(page.locator('.game-run-card')).toHaveCount(0)
    await page.screenshot({ path: `${SHOT_DIR}/no-gps.png` })
  })
})
