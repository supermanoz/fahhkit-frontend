import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Vehicle detection in the run view (390px) with a scripted GPS stream:
// a short walk, then a car. Fixes arrive every 100 ms of real time but each
// one is stamped 3 s later than the last, so the detector sees a normal
// 3 s cadence in a fraction of the time. Screenshots:
// ./screenshots/vehicle-detection/.
const SHOT_DIR = 'screenshots/vehicle-detection'

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

test.describe('Vehicle detection', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.setTimeout(180_000)
  // Mobile layout only (390px) - the other projects add runtime, not coverage.
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile-390', '390px only')
  })

  test('walk, then a car: warning banner, then the run is discarded', async ({
    mockedPage: page,
    context,
  }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await page.addInitScript(() => {
      const M_PER_DEG = 111320
      const gps = (window.__gps = { speed: 1.4, paused: true, t: 0, north: 0 })
      const base = Date.now()
      const fix = () => ({
        coords: {
          latitude: 27.7172 + gps.north / M_PER_DEG,
          longitude: 85.324,
          accuracy: 6,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: -1, // iOS-style unknown
        },
        timestamp: base + gps.t,
      })
      navigator.geolocation.getCurrentPosition = (ok) => ok(fix())
      navigator.geolocation.watchPosition = (ok) => {
        ok(fix())
        return setInterval(() => {
          if (gps.paused) return
          gps.t += 3000
          gps.north += gps.speed * 3
          ok(fix())
        }, 100)
      }
      navigator.geolocation.clearWatch = (id) => clearInterval(id)
    })
    await openGame(page)
    await tapTraining(page)
    await expect(page.locator('.game-run-card')).toBeVisible({
      timeout: 30_000,
    })

    // Walk for ~30 s of GPS time: nothing to warn about.
    await page.evaluate(() => (window.__gps.paused = false))
    await page.waitForTimeout(1200)
    await expect(page.getByTestId('vehicle-warning')).toHaveCount(0)
    await page.screenshot({ path: `${SHOT_DIR}/0-walking.png` })

    // Hop in a car (15 m/s ~ 54 km/h).
    await page.evaluate(() => (window.__gps.speed = 15))
    await expect(page.getByTestId('vehicle-warning')).toBeVisible({
      timeout: 20_000,
    })
    await page.evaluate(() => (window.__gps.paused = true)) // freeze for the shot
    await expect(page.getByTestId('vehicle-warning')).toContainText(
      'You seem to be in a vehicle. Slow down or this run will be discarded.'
    )
    await expect(page.getByTestId('vehicle-warning')).toContainText(
      /Discarding in \d+s/
    )
    await expect(page.locator('.game-run-card-status')).toHaveText(
      'Vehicle detected'
    )
    await page.screenshot({ path: `${SHOT_DIR}/1-warning-banner.png` })

    // Keep driving: the warning runs out and the run is thrown away.
    await page.evaluate(() => (window.__gps.paused = false))
    const discarded = page.getByTestId('vehicle-discarded')
    await expect(discarded).toBeVisible({ timeout: 20_000 })
    await expect(discarded).toContainText('Run discarded: vehicle detected')
    await expect(page.locator('.game-run-card')).toHaveCount(0)
    await page.screenshot({ path: `${SHOT_DIR}/2-run-discarded.png` })

    // Nothing was kept to retry, and the message is dismissable.
    expect(
      await page.evaluate(() => localStorage.getItem('fahhkit_active_run'))
    ).toBeNull()
    await discarded.getByRole('button', { name: 'Got it' }).click()
    await expect(discarded).toHaveCount(0)
  })
})
