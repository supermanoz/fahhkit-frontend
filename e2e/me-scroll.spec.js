import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Me (and every other menu tab) must open at the top: all tabs share one
// scroll container (.game-menu-sheet). Screenshots: ./screenshots/me-scroll/.
const SHOT_DIR = 'screenshots/me-scroll'
const PAGE_SIZE = 5
const TOTAL_PAGES = 4

const runsPage = (n) => ({
  content: Array.from({ length: PAGE_SIZE }, (_, i) => ({
    id: `run-${n}-${i}`,
    distance: 3000 + i * 400 + n * 100,
    duration: 1500 + i * 60,
    eventId: null,
    createdDate: '2026-11-01T06:00:00Z',
  })),
  totalPages: TOTAL_PAGES,
  totalElements: PAGE_SIZE * TOTAL_PAGES,
})

test.describe('Menu tabs open at the top', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    // Slow history so rows grow in after the panel is already open.
    await page.route('**/v1/run/find', async (route) => {
      const { pageNumber } = route.request().postDataJSON()
      await new Promise((r) => setTimeout(r, 700))
      return route.fulfill(ok(runsPage(pageNumber)))
    })
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 60_000,
    })
    await page.locator('.game-menu-btn').click()
  })

  const top = (page) =>
    page.evaluate(() => document.querySelector('.game-menu-sheet').scrollTop)
  const log = []
  async function openTab(page, name) {
    const picker = page.locator('.game-menu-picker-current')
    if (await picker.isVisible()) {
      // Phones: the list is open right after the menu opens, else toggle.
      const item = page
        .locator('.game-menu-picker')
        .getByText(name, { exact: true })
      if (!(await item.isVisible())) await picker.click()
      await item.click()
    } else {
      await page.getByRole('button', { name, exact: true }).first().click()
    }
  }
  async function scrollDown(page) {
    await page.evaluate(() => {
      const el = document.querySelector('.game-menu-sheet')
      el.scrollTop = el.scrollHeight
    })
  }

  test('Me opens at the top and stays there while history loads', async ({
    mockedPage: page,
  }, testInfo) => {
    const shot = (n) =>
      page.screenshot({ path: `${SHOT_DIR}/${n}-${testInfo.project.name}.png` })
    await openTab(page, 'Me')
    log.push(['open', await top(page)])
    expect(await top(page)).toBe(0)
    await shot('me-open')
    // History arrives after the panel is open: still no movement.
    await expect(page.locator('.game-me-history-row').first()).toBeVisible()
    for (let i = 0; i < 6; i++) {
      expect(await top(page)).toBe(0)
      await page.waitForTimeout(150)
    }
    await shot('me-history-loaded')
    console.log('scrollTop log', JSON.stringify(log))
  })

  test('after pagination, switching away and back resets to the top', async ({
    mockedPage: page,
  }, testInfo) => {
    await openTab(page, 'Me')
    await expect(page.locator('.game-me-history-row').first()).toBeVisible()
    await scrollDown(page)
    // Pagination is a user action: it may scroll to the list, that's fine.
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.locator('.game-me-history-row').first()).toBeVisible()
    await openTab(page, 'Shop')
    expect(await top(page)).toBe(0)
    await scrollDown(page)
    await openTab(page, 'Me')
    expect(await top(page)).toBe(0)
    await page.waitForTimeout(1200) // page 1 refetch / prefetch settle
    expect(await top(page)).toBe(0)
    await page.screenshot({
      path: `${SHOT_DIR}/me-after-switch-${testInfo.project.name}.png`,
    })
  })

  test('closing and reopening the menu on Me starts at the top', async ({
    mockedPage: page,
  }) => {
    await openTab(page, 'Me')
    await expect(page.locator('.game-me-history-row').first()).toBeVisible()
    await scrollDown(page)
    await page.locator('.game-menu-close').click()
    await page.locator('.game-menu-btn').click()
    expect(await top(page)).toBe(0)
  })

  test('every tab opens at the top after another was scrolled', async ({
    mockedPage: page,
  }) => {
    for (const name of [
      'Settings',
      'Shop',
      'Club',
      'Mail',
      'Leaderboard',
      'Me',
    ]) {
      await openTab(page, name)
      expect(await top(page), `${name} opens at top`).toBe(0)
      await scrollDown(page)
    }
  })
})
