import {
  test,
  expect,
  seedSession,
  expectNoHorizontalScroll,
} from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

test.describe('Main map / HUD', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
  })

  test('loads without console/network errors, no horizontal scroll, menu + HUD visible', async ({
    mockedPage: page,
  }) => {
    await page.goto('/game')
    // Lands on the map, not bounced back to /login (session restore).
    await expect(page).toHaveURL(/\/game/)
    // The "Preparing your run…" splash (.game-loading-overlay) only clears
    // once MapLibre's own "idle" event fires - real tiles over the real
    // network (tiles.openfreemap.org, not mocked - a public, keyless
    // service, unlike the backend), so this can take a few seconds. No
    // fixed sleep - waiting on the overlay itself leaving the DOM.
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await expect(page.locator('.game-hud')).toBeVisible()
    // Character marker visible and not cropped (checked visually against
    // a screenshot during development - see this repo's e2e-report/ after
    // a run for the equivalent artifact).
    await expect(
      page.locator('.territory-map-player-icon').first()
    ).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})
