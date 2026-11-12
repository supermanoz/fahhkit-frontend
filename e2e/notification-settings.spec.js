import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Settings -> push toggles (Broadcasts / Club War / Territory alerts), loaded
// from and saved to /v1/notification-setting. The native push plumbing itself
// (token, receiving, tap routing) only exists on a real Android device.
test.describe('Notification settings toggles', () => {
  let puts
  let failPut

  test.beforeEach(async ({ mockedPage: page, context }) => {
    puts = []
    failPut = false
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.route('**/v1/notification-setting', (route) => {
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
      return route.fulfill(
        ok({
          broadcastsEnabled: true,
          clubWarEnabled: false,
          territoryEnabled: true,
        })
      )
    })
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
  })

  test('loads the saved state from the API', async ({ mockedPage: page }) => {
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
    const row = page.getByTestId('notif-clubWarEnabled')
    await expect(row).toHaveAttribute('aria-checked', 'false')
    await row.click()
    await expect(row).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => puts).toEqual([{ clubWarEnabled: true }])
  })

  test('reverts quietly when the save fails', async ({ mockedPage: page }) => {
    failPut = true
    const row = page.getByTestId('notif-broadcastsEnabled')
    await row.click()
    await expect(row).toHaveAttribute('aria-checked', 'true')
    await expect(row).toContainText("Couldn't save")
  })
})
