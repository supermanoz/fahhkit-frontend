import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Rollout gating: outside a rolled-out area the game is halted + greyed out
// (popup once, persistent banner, gameplay controls disabled); moving into a
// rolled-out area unlocks it without a restart. The status endpoint
// (GET /v1/rollout-request/status) is mocked from the query's lat/lng:
// Kathmandu is rolled out, anywhere else isn't. Screenshots: ./screenshots/rollout-gating/.
const SHOT = 'screenshots/rollout-gating'
const INSIDE = { latitude: 27.7172, longitude: 85.324 }
const OUTSIDE = { latitude: 48.8566, longitude: 2.3522 }

async function mockStatus(page, mode = 'by-location') {
  await page.route('**/v1/rollout-request/status**', async (route) => {
    if (mode === 'error') return route.fulfill({ status: 404, body: '{}' })
    const lat = Number(new URL(route.request().url()).searchParams.get('lat'))
    return route.fulfill(
      ok({
        cityId: 1,
        cityName: lat > 20 && lat < 35 ? 'Kathmandu' : 'Paris',
        countryName: lat > 20 && lat < 35 ? 'Nepal' : 'France',
        rolledOut: lat > 20 && lat < 35,
        alreadyRequested: false,
        requestCount: 3,
      })
    )
  })
}

async function open(page, context, coords) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(coords)
  await seedSession(page, VETERAN)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 30_000,
  })
}

const orb = (page) => page.getByRole('button', { name: 'Open menu' })

test.describe.configure({ mode: 'serial' })

test('inside a rolled-out area: normal, nothing locked, then outside -> inside transition', async ({
  mockedPage: page,
  context,
}) => {
  await mockStatus(page)
  await open(page, context, INSIDE)
  await expect(page.locator('.game-rollout-banner')).toHaveCount(0)
  await expect(page.locator('.game-rollout-tint')).toHaveCount(0)
  await orb(page).click()
  await expect(
    page.getByRole('button', { name: 'Play', exact: true })
  ).toBeEnabled()
  await page.screenshot({ path: `${SHOT}/a-inside.png` })
})

test('outside: popup, then greyed controls + banner, then unlocks on entering a rolled-out area', async ({
  mockedPage: page,
  context,
}) => {
  await mockStatus(page)
  await open(page, context, OUTSIDE)

  const popup = page.getByText("Run Conquest isn't available in your area yet")
  await expect(popup).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/rolling out city by city/)).toBeVisible()
  await page.screenshot({ path: `${SHOT}/b-outside-popup.png` })

  await page.getByRole('button', { name: 'OK' }).click()
  await expect(popup).toBeHidden()
  const banner = page.locator('.game-rollout-banner')
  await expect(banner).toContainText('Territory not rolled out here')

  await orb(page).click()
  for (const name of ['Play', 'Club', 'Leaderboard']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  for (const name of ['Me', 'Shop', 'Settings']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeEnabled()
  }
  await page.screenshot({ path: `${SHOT}/c-outside-locked.png` })

  // Banner can't be dismissed - no close control, and it stays after a click.
  await expect(banner.getByRole('button')).toHaveCount(0)

  // Move into a rolled-out area - unlocks without a reload.
  await context.setGeolocation(INSIDE)
  await expect(banner).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator('.game-rollout-tint')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Play', exact: true })
  ).toBeEnabled()
  await page.screenshot({ path: `${SHOT}/d-back-inside.png` })
})

test('unknown rollout state (status call fails) keeps the game locked until confirmed', async ({
  mockedPage: page,
  context,
}) => {
  await mockStatus(page, 'error')
  await open(page, context, OUTSIDE)
  await expect(page.locator('.game-rollout-banner')).toContainText(
    /check your area/,
    { timeout: 20_000 }
  )
  await orb(page).click()
  await expect(
    page.getByRole('button', { name: 'Play', exact: true })
  ).toBeDisabled()
})

test('location permission denied: locked, with its own "Location is off" message', async ({
  mockedPage: page,
  context,
}) => {
  await mockStatus(page)
  await context.clearPermissions()
  await context.addInitScript(() => {
    const deny = (_ok, fail) => fail && fail({ code: 1, message: 'denied' })
    navigator.geolocation.getCurrentPosition = deny
    navigator.geolocation.watchPosition = (_ok, fail) => {
      setTimeout(() => fail && fail({ code: 1, message: 'denied' }), 50)
      return 1
    }
  })
  await seedSession(page, VETERAN)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 30_000,
  })
  await expect(page.locator('.game-rollout-banner.is-denied')).toContainText(
    'Location is off',
    { timeout: 25_000 }
  )
  await expect(page.locator('.game-rollout-tint')).toHaveCount(1)
})
