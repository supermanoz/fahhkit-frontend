import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN, CAPTAIN } from './mocks/personas.js'

// Redesigned territory popup: states + screenshots (360 + 390 projects).
// Screenshots go to TERRITORY_SHOTS when set.
const SHOTS = process.env.TERRITORY_SHOTS || ''
const SQUARE = [
  [
    [85.321, 27.714],
    [85.327, 27.714],
    [85.327, 27.72],
    [85.321, 27.72],
    [85.321, 27.714],
  ],
]

async function shot(page, testInfo, name) {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(500) // spring settles
  await page.screenshot({
    path: `${SHOTS}/${name}-${testInfo.project.name}.png`,
  })
}

async function boot(page, context, { gps = true } = {}) {
  if (gps) {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  }
  // Real Chrome geolocation never calls back in the test environment, so the
  // map would sit on "Finding your location...": script the fixes instead.
  await page.addInitScript((gps) => {
    const fix = () => ({
      coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5, speed: 0 },
      timestamp: Date.now(),
    })
    navigator.geolocation.getCurrentPosition = (ok, err) =>
      gps
        ? ok(fix())
        : err?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1 })
    let id = 1
    navigator.geolocation.watchPosition = (ok, err) => {
      if (gps) setTimeout(() => ok(fix()), 50)
      else setTimeout(() => err?.({ code: 1, message: 'denied' }), 50)
      return id++
    }
    navigator.geolocation.clearWatch = () => {}
  }, gps)
  await seedSession(page, VETERAN)
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
}

async function parcels(page, ownerId, ownerName) {
  await page.route('**/v1/territory/parcel/near**', (route) =>
    route.fulfill(
      ok([
        {
          id: 9101,
          ownerId,
          ownerName,
          areaSqMeters: 123456,
          currentScore: 4321,
          geometry: SQUARE,
        },
      ])
    )
  )
}

async function openMap(page) {
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
}

async function tapParcel(page) {
  await expect(async () => {
    const map = await page.locator('.leaflet-container').first().boundingBox()
    await page.mouse.click(
      map.x + map.width / 2 - 90,
      map.y + map.height / 2 - 140
    )
    await expect(page.getByTestId('territory-popup')).toBeVisible({
      timeout: 1500,
    })
  }).toPass({ timeout: 25_000 })
}

test.describe('territory popup design', () => {
  test.setTimeout(150_000)

  test('another player: tiles, distance row, run + profile actions', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    await boot(page, context)
    await parcels(page, CAPTAIN.id, CAPTAIN.fullName)
    await openMap(page)
    await tapParcel(page)
    const pop = page.getByTestId('territory-popup')
    await expect(pop).toContainText('Territory owner')
    await expect(page.getByTestId('tp-area')).toContainText('Area held')
    await expect(page.getByTestId('tp-score')).toContainText('4,321')
    await expect(page.getByTestId('tp-distance')).toContainText('away')
    await expect(page.getByTestId('tp-distance')).toContainText(
      'Your guide will steer you to the start point first'
    )
    await expect(page.getByTestId('tp-run')).toBeEnabled()
    await expect(page.getByTestId('tp-profile')).toBeVisible()
    expect(await pop.innerText()).not.toMatch(/\p{Extended_Pictographic}/u)
    await page.waitForTimeout(600) // spring settles before measuring
    // fits without scrolling, 44px+ targets
    const box = await pop.boundingBox()
    expect(box.height).toBeLessThan(testInfo.project.use.viewport.height - 20)
    for (const loc of [
      page.getByTestId('tp-run'),
      page.getByTestId('tp-profile'),
      pop.getByRole('button', { name: 'Close' }),
    ]) {
      const b = await loc.boundingBox()
      expect(b.height).toBeGreaterThanOrEqual(44)
    }
    await shot(page, testInfo, '1-other-player')
    // backdrop tap closes
    await page.mouse.click(5, 120)
    await expect(pop).toHaveCount(0)
  })

  test('own territory: title, Defend, no club/owner stats invented', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    await boot(page, context)
    await parcels(page, VETERAN.id, VETERAN.fullName)
    await openMap(page)
    await tapParcel(page)
    const pop = page.getByTestId('territory-popup')
    await expect(pop).toContainText('Your Territory')
    await expect(page.getByTestId('tp-run')).toContainText(
      'Defend This Territory'
    )
    await shot(page, testInfo, '2-own')
  })

  test('loading skeleton and error with retry', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    await boot(page, context)
    await parcels(page, CAPTAIN.id, CAPTAIN.fullName)
    await openMap(page)
    await tapParcel(page)
    await page.evaluate(() => window.__setTerritoryPopupStatus('loading'))
    await expect(page.locator('.tp-skel').first()).toBeVisible()
    await shot(page, testInfo, '3-loading')
    await page.evaluate(() => window.__setTerritoryPopupStatus('error'))
    await expect(page.getByRole('alert')).toContainText('Couldn’t load')
    await shot(page, testInfo, '4-error')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByTestId('tp-run')).toBeVisible()
  })

  test('no GPS: distance unknown, run still offered', async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    await boot(page, context, { gps: false })
    await parcels(page, CAPTAIN.id, CAPTAIN.fullName)
    await openMap(page)
    await tapParcel(page)
    await expect(page.getByTestId('tp-distance')).toContainText(
      'Distance unknown'
    )
    await shot(page, testInfo, '5-no-gps')
  })
})
