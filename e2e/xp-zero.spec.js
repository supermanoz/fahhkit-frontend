import { test, expect, seedSession } from './fixtures/base.js'
import { NEW_USER, VETERAN } from './mocks/personas.js'

// HUD level badge + XP bar must render for a brand-new account (0 XP, or a
// backend that returns null level/xp), not only once XP > 0. Screenshots:
// ./screenshots/xp-zero/.
const SHOT_DIR = 'screenshots/xp-zero'

const CASES = [
  { name: 'xp-0', level: 1, xp: 0, expectLevel: '1', expectFill: 0 },
  {
    name: 'null-level-xp',
    level: null,
    xp: null,
    expectLevel: '1',
    expectFill: 0,
  },
  {
    name: 'normal-xp',
    level: 14,
    xp: 18000,
    expectLevel: '14',
    expectFill: null,
  },
]

for (const c of CASES) {
  test.describe(c.name, () => {
    test.use({ viewport: { width: 390, height: 844 } })
    test.setTimeout(150_000)

    test.beforeEach(async ({ mockedPage: page, context }) => {
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
      await seedSession(page, NEW_USER)
      const base = c.name === 'normal-xp' ? VETERAN : NEW_USER
      // Registered after mockApi's catch-all, so it wins.
      await page.route('**/v1/territory/profile', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 200,
            data: { ...base.territoryProfile, level: c.level, xp: c.xp },
          }),
        })
      )
    })

    test('level badge + XP bar render', async ({ mockedPage: page }) => {
      await page.goto('/game')
      const hud = page.locator('.game-hud-level')
      await expect(hud).toBeVisible({ timeout: 60_000 })
      await expect(hud.locator('.game-hud-level-num')).toHaveText(c.expectLevel)
      const bar = hud.locator('.game-hud-level-bar')
      await expect(bar).toBeVisible()
      const track = await bar.boundingBox()
      expect(track.width).toBeGreaterThan(20)
      expect(track.height).toBeGreaterThan(4)
      const fillW = await hud
        .locator('.game-hud-level-bar-fill')
        .evaluate((el) => el.getBoundingClientRect().width)
      if (c.expectFill === 0) expect(fillW).toBe(0)
      else expect(fillW).toBeGreaterThan(0)
      await page.screenshot({ path: `${SHOT_DIR}/${c.name}.png` })
    })
  })
}
