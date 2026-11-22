import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { BLAZE_IDLE } from './mocks/personas.js'

// Club -> Create a Club (light card): the field labels and the light
// "Get Fahhcoin" button are plain dark body text - no stroke, no shadow, at a
// readable size - instead of the game-wide white-with-outline text style.
test('Create a Club labels and Get Fahhcoin are plain dark text', async ({
  mockedPage: page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, BLAZE_IDLE)
  await page.route('**/v1/territory/profile', (r) =>
    r.fulfill(ok(BLAZE_IDLE.territoryProfile))
  )
  await page.goto('/game')
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Club', exact: true }).click()

  const targets = [
    page.getByText('Club name', { exact: true }),
    page.getByText('Description (optional)', { exact: true }),
    page.getByRole('button', { name: 'Get Fahhcoin' }),
  ]
  for (const el of targets) {
    await el.scrollIntoViewIfNeeded()
    await expect(el).toHaveCSS('-webkit-text-stroke-width', '0px')
    await expect(el).toHaveCSS('text-shadow', 'none')
    const { color, size } = await el.evaluate((n) => {
      const cs = getComputedStyle(n)
      return { color: cs.color, size: parseFloat(cs.fontSize) }
    })
    // Dark ink (#2b2a24), not the game's white.
    expect(color).toBe('rgb(43, 42, 36)')
    expect(size).toBeGreaterThanOrEqual(12)
  }
  const label = await page
    .getByText('Club name', { exact: true })
    .evaluate((n) => parseFloat(getComputedStyle(n).fontSize))
  expect(label).toBeGreaterThanOrEqual(15)
})
