import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { ok } from './fixtures/mockApi.js'

// Indoor (treadmill) Training: Training start screen -> Indoor -> timer ->
// End -> confirm (edit distance, plausibility) -> POST /v1/run is a TRAINING
// run with NO points. The web build has no pedometer, so the distance is
// typed (the same path as "step permission denied").
async function openGame(page) {
  await seedSession(page, VETERAN)
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 90_000,
  })
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 20_000 })
}

test('indoor run: start, timer, confirm with edited distance, submit with empty points', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(150_000)
  // The game stays locked until the area is confirmed, which needs a fix.
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  const posts = []
  await page.route('**/v1/run', (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    posts.push(r.request().postDataJSON())
    return r.fulfill(
      ok({ id: 902, distance: 5000, duration: 1800, avgPace: 6, score: null })
    )
  })
  await openGame(page)
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Training', exact: true }).click()

  // Start screen: segmented control, Indoor.
  await page.getByRole('radio', { name: 'Indoor (treadmill)' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const screen = page.locator('.indoor-screen')
  await expect(screen).toBeVisible()
  await expect(screen.locator('.indoor-timer')).toHaveText(/^\d+:\d\d$/)
  await expect(page.locator('canvas.maplibregl-canvas, .leaflet-container'))
    .toHaveCount(0)
    .catch(() => {})

  // The run survives a reload (epoch-based timer, persisted state).
  await page.reload()
  await expect(page.locator('.indoor-screen')).toBeVisible({ timeout: 90_000 })

  // Pretend 30 minutes passed (backdate the start in storage + reload).
  await page.evaluate(() => {
    const k = 'fahhkit_indoor_run_v1'
    const r = JSON.parse(localStorage.getItem(k))
    r.startedAtMs -= 30 * 60_000
    localStorage.setItem(k, JSON.stringify(r))
  })
  await page.reload()
  await expect(page.locator('.indoor-timer')).toHaveText(/^30:\d\d$/, {
    timeout: 90_000,
  })

  await page.getByRole('button', { name: 'End', exact: true }).click()
  const input = page.getByLabel(/Distance on the treadmill/)
  await expect(input).toBeVisible()

  // Implausible: 30 km in 30 min -> friendly error, nothing sent.
  await input.fill('30')
  await page.getByRole('button', { name: 'Save run' }).click()
  await expect(page.getByRole('alert').first()).toContainText('2:30')
  expect(posts).toHaveLength(0)

  // Plausible: 5 km.
  await input.fill('5')
  await page.getByRole('button', { name: 'Save run' }).click()
  await expect.poll(() => posts.length, { timeout: 20_000 }).toBe(1)
  expect(posts[0]).toMatchObject({
    mode: 'TRAINING',
    points: [],
    distance: 5000,
    indoor: true,
  })
  expect(posts[0].duration).toBeGreaterThanOrEqual(1800)
  expect(posts[0].steps).toBeUndefined()
  await expect(page.locator('.indoor-screen')).toHaveCount(0)
})
