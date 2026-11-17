import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { BLAZE_IDLE } from './mocks/personas.js'

// Club -> Create a Club: the "Starting a club costs..." helper line sits
// 10-12px under the button, with a little more room below it, dark and
// without a text stroke.
test('helper line spacing under Create Club', async ({
  mockedPage: page,
  context,
}, testInfo) => {
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
  const hint = page.locator('.club-create .game-card-empty')
  await expect(hint).toBeVisible()
  const m = await page.evaluate(() => {
    const btn = document
      .querySelector('.club-create-btn')
      .getBoundingClientRect()
    const p = document.querySelector('.club-create .game-card-empty')
    const r = p.getBoundingClientRect()
    const card = p.closest('section').getBoundingClientRect()
    return { above: r.top - btn.bottom, below: card.bottom - r.bottom }
  })
  console.log(testInfo.project.name, JSON.stringify(m))
  expect(m.above).toBeGreaterThanOrEqual(11)
  expect(m.above).toBeLessThanOrEqual(13)
  await expect(hint).toHaveCSS('-webkit-text-stroke-width', '0px')
  await expect(hint).toHaveCSS('text-shadow', 'none')
  await page
    .locator('.club-create')
    .locator('xpath=ancestor::section[1]')
    .screenshot({
      path: `screenshots/club-create-spacing/after-${testInfo.project.name}.png`,
    })
})
