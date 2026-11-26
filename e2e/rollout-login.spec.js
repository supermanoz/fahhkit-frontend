import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'

// WHEN the rollout check runs, end to end: nothing before login (no GPS watch,
// no request), then right after sign-in the status is fetched with the real
// position and the "isn't available in your area yet" popup + lock show when
// rolledOut is false. 3 screenshots (see SHOTS). Every sign-in method (email,
// Google, Apple, sign-up) ends in the same state flip, so email stands for all.
const SHOT = 'screenshots/rollout-login'
const INSIDE = { latitude: 27.7172, longitude: 85.324, accuracy: 10 }
const OUTSIDE = { latitude: 48.8566, longitude: 2.3522, accuracy: 10 }

function track(page) {
  const log = []
  page.on('request', (req) => {
    const u = new URL(req.url())
    if (u.pathname.endsWith('/v1/authenticate')) log.push({ kind: 'login' })
    if (u.pathname.endsWith('/v1/rollout-request/status'))
      log.push({
        kind: 'status',
        lat: Number(u.searchParams.get('lat')),
        lng: Number(u.searchParams.get('lng')),
      })
  })
  return log
}

async function mockStatus(page, mode) {
  await page.route('**/v1/rollout-request/status**', (route) => {
    if (mode === 'error') return route.fulfill({ status: 404, body: '{}' })
    const lat = Number(new URL(route.request().url()).searchParams.get('lat'))
    const inside = lat > 20 && lat < 35
    return route.fulfill(
      ok({
        rolledOut: inside,
        alreadyRequested: false,
        cityId: 1,
        cityName: inside ? 'Kathmandu' : 'Paris',
        countryName: inside ? 'Nepal' : 'France',
        requestCount: inside ? 0 : 3,
      })
    )
  })
}

async function toSignIn(page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/game')
  await page
    .getByRole('button', { name: 'Sign In', exact: true })
    .click({ timeout: 30_000 })
  await expect(page.getByText('Welcome Back')).toBeVisible()
}
async function signIn(page) {
  await page.locator('#game-auth-mobile').fill('veteran@example.com')
  await page.locator('#game-auth-password').fill('Correct-horse-1')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}
const orb = (page) => page.getByRole('button', { name: 'Open menu' })
const popupText = "Run Conquest isn't available in your area yet"

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'one viewport is enough')
  test.setTimeout(120_000)
  fs.mkdirSync(SHOT, { recursive: true })
  void page
})

test('outside the area, right after login: status fetched with the real fix, then popup + lock', async ({
  mockedPage: page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(OUTSIDE)
  const log = track(page)
  await mockStatus(page, 'by-location')
  await toSignIn(page)
  // Signed out: no GPS watch, no rollout request, nothing shown.
  await page.waitForTimeout(1500)
  expect(log.filter((e) => e.kind === 'status')).toHaveLength(0)

  await signIn(page)
  await expect(page.getByText(popupText)).toBeVisible({ timeout: 40_000 })

  const events = log.map((e) => e.kind)
  // The status call comes AFTER the login, exactly once, with the real fix -
  // never with 0,0 and not repeated on every GPS tick.
  expect(events.indexOf('login')).toBeGreaterThanOrEqual(0)
  expect(events.indexOf('status')).toBeGreaterThan(events.indexOf('login'))
  const status = log.filter((e) => e.kind === 'status')
  expect(status).toHaveLength(1)
  expect(status[0].lat).toBeCloseTo(OUTSIDE.latitude, 3)
  expect(status[0].lng).toBeCloseTo(OUTSIDE.longitude, 3)
  await page.screenshot({ path: `${SHOT}/1-outside-after-login.png` })

  // Locked afterwards; a few more GPS ticks and a background/foreground
  // switch don't produce more calls (quick switch is throttled).
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.game-rollout-banner')).toContainText(
    'Territory not rolled out here'
  )
  await context.setGeolocation({
    ...OUTSIDE,
    latitude: OUTSIDE.latitude + 0.0002,
  })
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(3000)
  expect(log.filter((e) => e.kind === 'status')).toHaveLength(1)
  await orb(page).click()
  await expect(
    page.getByRole('button', { name: 'Play', exact: true })
  ).toBeDisabled()
})

test('inside a rolled-out area, right after login: status fetched, no popup, nothing locked', async ({
  mockedPage: page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(INSIDE)
  const log = track(page)
  await mockStatus(page, 'by-location')
  await toSignIn(page)
  await signIn(page)
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 40_000,
  })
  await expect
    .poll(() => log.filter((e) => e.kind === 'status').length, {
      timeout: 20_000,
    })
    .toBe(1)
  await page.waitForTimeout(1500)
  await expect(page.getByText(popupText)).toHaveCount(0)
  await expect(page.locator('.game-rollout-banner')).toHaveCount(0)
  await orb(page).click()
  await expect(
    page.getByRole('button', { name: 'Play', exact: true })
  ).toBeEnabled()
  await page.screenshot({ path: `${SHOT}/2-inside-after-login.png` })
})

test('endpoint failing (404): no popup, game stays locked ("Couldn\'t check your area")', async ({
  mockedPage: page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(OUTSIDE)
  await mockStatus(page, 'error')
  await toSignIn(page)
  await signIn(page)
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 40_000,
  })
  await expect(page.locator('.game-rollout-banner')).toContainText(
    /check your area/,
    { timeout: 20_000 }
  )
  await expect(page.getByText(popupText)).toHaveCount(0)
  await orb(page).click()
  await expect(
    page.getByRole('button', { name: 'Play', exact: true })
  ).toBeDisabled()
  await page.screenshot({ path: `${SHOT}/3-endpoint-failing.png` })
})

test('location permission answered AFTER login: the check runs right after "allow"', async ({
  mockedPage: page,
  context,
}) => {
  const log = track(page)
  await mockStatus(page, 'by-location')
  // Permission not granted yet: the watch errors (denied).
  await context.clearPermissions()
  await context.setGeolocation(OUTSIDE)
  await toSignIn(page)
  await signIn(page)
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 40_000,
  })
  await expect(page.locator('.game-rollout-banner.is-denied')).toContainText(
    'Location is off',
    { timeout: 25_000 }
  )
  expect(log.filter((e) => e.kind === 'status')).toHaveLength(0)
  // The player now allows location.
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(OUTSIDE)
  await expect(page.getByText(popupText)).toBeVisible({ timeout: 40_000 })
  expect(log.filter((e) => e.kind === 'status')).toHaveLength(1)
})
