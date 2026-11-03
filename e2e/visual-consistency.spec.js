import {
  test,
  expect,
  seedSession,
  expectNoHorizontalScroll,
  expectNoTinyText,
} from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Brief's own blanket checks (item 13: visual consistency, item 14: a
// console-error sweep) applied across the tabs reachable without deeper
// per-screen mocking - Leaderboard, Me, Shop, Club, Settings. Each tab is
// its own test (not one long one) so a failure in one doesn't hide the
// others, and Playwright's own parallelism still applies.
const TABS = ['Leaderboard', 'Me', 'Shop', 'Club', 'Settings']

// Serial, not parallel - every test in this file waits on the real
// openfreemap.org tile network (not mocked, see main-map.spec.js's own
// comment) to reach "idle"; five contexts doing that at once on a shared
// connection was flaky/slow enough to blow the loading-overlay timeout.
test.describe.configure({ mode: 'serial' })

test.describe('Visual consistency sweep', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
  })

  for (const tab of TABS) {
    test(`${tab} tab: no horizontal scroll, no text under 14px, no console/network errors`, async ({
      mockedPage: page,
    }) => {
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: tab, exact: true }).click()
      await expect(page.locator('.game-menu-sheet')).toBeVisible({
        timeout: 10_000,
      })
      await expectNoHorizontalScroll(page)
      await expectNoTinyText(page)
    })
  }
})
