import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Settings -> Notifications section: permission row, game alerts (GET/PUT
// /v1/notification-setting) and the daily run reminders. The permission is
// mocked per test through the browser's Notification API (native phones use
// the OS one through the same hook); the actual scheduling of local
// notifications only exists on a device, so that part is covered by
// src/utils/reminders.test.js instead.
const SHOT_DIR = 'screenshots/settings-notifications'

function mockPermission(page, initial, { onAsk = 'granted' } = {}) {
  return page.addInitScript(
    ([start, answer]) => {
      let current = start
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => current,
      })
      Notification.requestPermission = async () => {
        window.__permAsked = (window.__permAsked || 0) + 1
        current = answer
        return answer
      }
    },
    [initial, onAsk]
  )
}

async function openNotifications(page, url = '/game') {
  await page.goto(url)
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 30_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('notif-section-toggle').click()
  await expect(page.getByTestId('notif-permission')).toBeVisible()
}

async function expectNoOverflow(page) {
  const overflow = await page.evaluate(() => {
    const body = document.querySelector('.notif-card')
    const panel = document.querySelector('.game-menu-settings')
    const bad = []
    for (const el of body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      const card = body.getBoundingClientRect()
      if (r.width && (r.right > card.right + 1 || r.left < card.left - 1)) {
        bad.push(el.className || el.tagName)
      }
    }
    return {
      bad,
      page: document.documentElement.scrollWidth > window.innerWidth,
      panel: panel.scrollWidth > panel.clientWidth + 1,
    }
  })
  expect(overflow.bad).toEqual([])
  expect(overflow.page).toBe(false)
  expect(overflow.panel).toBe(false)
}

function shot(page, testInfo, name) {
  return page.screenshot({
    path: `${SHOT_DIR}/${name}-${testInfo.project.name}.png`,
  })
}

test.describe('Settings > Notifications', () => {
  let puts
  let failPut
  let getDelay

  test.beforeEach(async ({ mockedPage: page, context }) => {
    puts = []
    failPut = false
    getDelay = 0
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.route('**/v1/notification-setting', async (route) => {
      const req = route.request()
      if (req.method() === 'PUT') {
        puts.push(req.postDataJSON())
        if (failPut) {
          return route.fulfill({
            status: 409, // not 5xx: the shared fixture fails tests on those
            contentType: 'application/json',
            body: JSON.stringify({ errorMessage: 'nope' }),
          })
        }
        return route.fulfill(ok({}))
      }
      if (getDelay) await new Promise((r) => setTimeout(r, getDelay))
      return route.fulfill(
        ok({
          broadcastsEnabled: true,
          clubWarEnabled: false,
          territoryEnabled: true,
        })
      )
    })
  })

  test('is collapsed by default, then shows every group', async ({
    mockedPage: page,
  }, testInfo) => {
    await mockPermission(page, 'granted')
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByTestId('notif-section-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    await expect(page.getByTestId('notif-broadcastsEnabled')).toHaveCount(0)
    await shot(page, testInfo, 'collapsed')

    await page.getByTestId('notif-section-toggle').click()
    await expect(page.getByTestId('notif-permission-state')).toHaveText(
      'Allowed'
    )
    await expect(page.getByText('Game alerts')).toBeVisible()
    // Old copies are gone: each control exists exactly once.
    await expect(page.getByTestId('notif-clubWarEnabled')).toHaveCount(1)
    await expect(page.getByRole('switch', { name: /^Reminders/ })).toHaveCount(
      0
    )
    // Music + Sound stay outside the section.
    await expect(
      page.locator('.game-menu-settings > button', { hasText: 'Music' })
    ).toHaveCount(1)
    await expectNoOverflow(page)
    await shot(page, testInfo, 'granted')
  })

  test('shows a skeleton while the server toggles load', async ({
    mockedPage: page,
  }, testInfo) => {
    await mockPermission(page, 'granted')
    getDelay = 4000
    await openNotifications(page)
    await expect(page.getByTestId('notif-skeleton')).toBeVisible()
    await shot(page, testInfo, 'loading')
    await expect(page.getByTestId('notif-skeleton')).toBeHidden({
      timeout: 10_000,
    })
    await expect(page.getByTestId('notif-clubWarEnabled')).toBeVisible()
  })

  test('loads the saved state from the API', async ({ mockedPage: page }) => {
    await mockPermission(page, 'granted')
    await openNotifications(page)
    await expect(page.getByTestId('notif-broadcastsEnabled')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(page.getByTestId('notif-clubWarEnabled')).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await expect(page.getByTestId('notif-territoryEnabled')).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('saves a change with a partial PUT', async ({ mockedPage: page }) => {
    await mockPermission(page, 'granted')
    await openNotifications(page)
    const row = page.getByTestId('notif-clubWarEnabled')
    await expect(row).toHaveAttribute('aria-checked', 'false')
    await row.click()
    await expect(row).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => puts).toEqual([{ clubWarEnabled: true }])
  })

  test('reverts with a quiet toast when the save fails', async ({
    mockedPage: page,
  }, testInfo) => {
    await mockPermission(page, 'granted')
    await openNotifications(page)
    failPut = true
    const row = page.getByTestId('notif-broadcastsEnabled')
    await expect(row).toHaveAttribute('aria-checked', 'true')
    await row.click()
    await expect(page.getByText("Couldn't save that")).toBeVisible()
    await expect(row).toHaveAttribute('aria-checked', 'true') // reverted
    await shot(page, testInfo, 'save-failed')
  })

  test('denied: greyed switches with the hint, no way to save', async ({
    mockedPage: page,
  }, testInfo) => {
    await mockPermission(page, 'denied')
    await openNotifications(page)
    await expect(page.getByTestId('notif-permission-state')).toHaveText(
      'Not allowed'
    )
    const row = page.getByTestId('notif-clubWarEnabled')
    await expect(row).toBeDisabled()
    await expect(row).toContainText('Allow notifications first')
    // Web can't re-ask or open phone settings - says where to change it.
    await expect(page.getByTestId('notif-open-settings')).toHaveCount(0)
    await expect(page.getByTestId('notif-permission')).toContainText('browser')
    await expectNoOverflow(page)
    await shot(page, testInfo, 'denied')
    expect(puts).toEqual([])
  })

  test('not asked yet: button asks, then the switches work', async ({
    mockedPage: page,
  }, testInfo) => {
    await mockPermission(page, 'default', { onAsk: 'granted' })
    await openNotifications(page)
    await expect(page.getByTestId('notif-permission-state')).toHaveText(
      'Not asked yet'
    )
    await expect(page.getByTestId('notif-clubWarEnabled')).toBeEnabled()
    await shot(page, testInfo, 'not-asked')
    await page.getByTestId('notif-allow').click()
    await expect(page.getByTestId('notif-permission-state')).toHaveText(
      'Allowed'
    )
    await expect(page.getByTestId('notif-allow')).toHaveCount(0)
  })

  test('turning a switch on while not asked prompts, then applies', async ({
    mockedPage: page,
  }) => {
    await mockPermission(page, 'default', { onAsk: 'granted' })
    await openNotifications(page)
    const row = page.getByTestId('notif-clubWarEnabled')
    await row.click()
    await expect(row).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => puts).toEqual([{ clubWarEnabled: true }])
    expect(await page.evaluate(() => window.__permAsked)).toBe(1)
  })

  test('turning a switch on while not asked, then refusing, changes nothing', async ({
    mockedPage: page,
  }) => {
    await mockPermission(page, 'default', { onAsk: 'denied' })
    await openNotifications(page)
    const row = page.getByTestId('notif-clubWarEnabled')
    await row.click()
    await expect(page.getByTestId('notif-permission-state')).toHaveText(
      'Not allowed'
    )
    await expect(row).toHaveAttribute('aria-checked', 'false')
    expect(puts).toEqual([])
  })

  test('run reminders: master gates the slots, which persist', async ({
    mockedPage: page,
  }, testInfo) => {
    await mockPermission(page, 'granted')
    // ?debug=reminders also shows the rows on web (they only exist on the
    // phone otherwise); scheduling itself is a no-op off-device.
    await openNotifications(page, '/game?debug=reminders')
    const master = page.getByTestId('notif-reminders')
    const morning = page.getByTestId('notif-slot-0')
    await expect(master).toHaveAttribute('aria-checked', 'false')
    await expect(morning).toBeDisabled()
    await expect(morning).toContainText('Turn on daily reminders first')

    await master.click()
    await expect(master).toHaveAttribute('aria-checked', 'true')
    await expect(morning).toBeEnabled()
    await expect(morning).toContainText('7:30 AM')
    await expect(page.getByTestId('notif-slot-1')).toContainText('1:00 PM')
    await expect(page.getByTestId('notif-slot-2')).toContainText('7:00 PM')

    await morning.click()
    await expect(morning).toHaveAttribute('aria-checked', 'false')
    await expectNoOverflow(page)
    await shot(page, testInfo, 'reminders')

    await page.reload()
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('notif-section-toggle').click()
    await expect(page.getByTestId('notif-reminders')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(page.getByTestId('notif-slot-0')).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await expect(page.getByTestId('notif-slot-1')).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('reminder rows are hidden on web without the debug flag', async ({
    mockedPage: page,
  }) => {
    await mockPermission(page, 'granted')
    await openNotifications(page)
    await expect(page.getByTestId('notif-reminders')).toHaveCount(0)
  })
})
