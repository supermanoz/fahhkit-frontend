import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { clippedGameButtons } from './helpers/gbtnClip.js'

// A GameButton's 3D bottom edge/drop must never be cut by its container:
// run controls in every state, plus the main menu tabs.
async function openGame(page, context) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await page.addInitScript(() => {
    const fix = () => ({
      coords: {
        latitude: 27.7172,
        longitude: 85.324,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    })
    navigator.geolocation.getCurrentPosition = (ok) => ok(fix())
    navigator.geolocation.watchPosition = (ok) => {
      setTimeout(() => ok(fix()), 0)
      return setInterval(() => ok(fix()), 1000)
    }
    navigator.geolocation.clearWatch = (id) => clearInterval(id)
  })
  await seedSession(page, VETERAN)
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 30_000 })
}

test.describe('GameButton edge is never clipped', () => {
  test.setTimeout(150_000)

  test('Training run: start screen, running, paused, end dialog', async ({
    mockedPage: page,
    context,
  }) => {
    await openGame(page, context)
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Training', exact: true }).click()
    await page.getByRole('radio', { name: 'Outdoor' }).click()
    expect(await clippedGameButtons(page), 'start screen').toEqual([])
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.locator('.game-run-card')).toBeVisible({
      timeout: 30_000,
    })
    await page
      .getByRole('button', { name: 'Show run controls' })
      .click()
      .catch(() => {})
    await expect(page.locator('.game-run-actions')).toBeVisible()
    await page.waitForTimeout(400) // height animation
    expect(await clippedGameButtons(page), 'running').toEqual([])
    await page.getByRole('button', { name: /^Pause$/ }).click()
    await page.waitForTimeout(300)
    expect(await clippedGameButtons(page), 'paused').toEqual([])
    await page.getByRole('button', { name: /^End$/ }).first().click()
    await expect(page.locator('.gm-dialog')).toBeVisible()
    await page.waitForTimeout(400)
    expect(await clippedGameButtons(page), 'end dialog').toEqual([])
  })

  test('menu tabs', async ({ mockedPage: page, context }) => {
    await openGame(page, context)
    await page.locator('.game-menu-btn').click()
    const found = {}
    for (const name of [
      'Leaderboard',
      'Club',
      'Shop',
      'Settings',
      'Mail',
      'Me',
    ]) {
      const btn = page.getByRole('button', { name, exact: true }).first()
      if (!(await btn.isVisible().catch(() => false))) continue
      await btn.click()
      await page.waitForTimeout(700)
      found[name] = await clippedGameButtons(page)
    }
    expect(found).toEqual(
      Object.fromEntries(Object.keys(found).map((k) => [k, []]))
    )
  })
})
