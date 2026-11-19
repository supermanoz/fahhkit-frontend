import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Tapping Training in the Play menu goes straight to the 3-2-1-GO countdown
// and then the Training run (no intermediate panel). Screenshots:
// ./screenshots/popup-skin/.
const SHOT_DIR = 'screenshots/popup-skin'

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

const VP =
  process.env.VP === '360'
    ? { width: 360, height: 740 }
    : { width: 390, height: 844 }
const TAG = VP.width

test.describe('Popup skin', () => {
  test.use({ viewport: VP })
  test.setTimeout(150_000)

  test('end-run + discard dialogs', async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
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
    await expect(page.locator('.game-run-card')).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Show run controls' }).click()
    await page.getByRole('button', { name: 'Discard' }).first().click()
    await expect(page.locator('.gm-dialog')).toBeVisible()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SHOT_DIR}/discard-${TAG}.png` })
    await page.getByRole('button', { name: 'Keep Running' }).click()
    await page.getByRole('button', { name: /^End$/ }).first().click()
    await expect(page.locator('.gm-dialog')).toBeVisible()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SHOT_DIR}/end-run-${TAG}.png` })
  })
})

test('rollout popup', async ({ mockedPage: page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 })
  await page.route('**/v1/rollout-request/status**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          cityId: 1,
          cityName: 'Paris',
          countryName: 'France',
          rolledOut: false,
          alreadyRequested: false,
          requestCount: 3,
        },
      }),
    })
  )
  await seedSession(page, VETERAN)
  await page.setViewportSize(VP)
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 30_000,
  })
  await expect(page.locator('.g-modal')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOT_DIR}/rollout-${TAG}.png` })
})
