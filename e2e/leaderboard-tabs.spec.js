import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Leaderboard selectors: Players | Clubs (primary) and Global | District
// (secondary) are segmented controls with ONE selection style. See also
// leaderboard-ui.spec.js (colours, podium, states).
test('leaderboard selectors', async ({
  mockedPage: page,
  context,
}, testInfo) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.goto('/game')
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  const name = testInfo.project.name
  for (const [sel, count] of [
    ['.lb-mode-tabs', 2],
    ['.lb-scope-tabs', 2],
  ]) {
    const row = page.locator(sel)
    await expect(row).toBeVisible()
    const info = await row.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return [...el.querySelectorAll('.g-tab')].map((t) => {
        const b = t.getBoundingClientRect()
        const icon = t.querySelector('svg, img').getBoundingClientRect()
        return {
          w: Math.round(b.width),
          h: Math.round(b.height),
          inside: b.left >= r.left - 1 && b.right <= r.right + 1,
          overflow: t.scrollWidth > t.clientWidth + 1,
          iconSize: Math.round(icon.width),
        }
      })
    })
    console.log(name, sel, JSON.stringify(info))
    expect(info).toHaveLength(count)
    expect(info[0].w).toBe(info[1].w) // equal segments
    for (const t of info) {
      expect(t.inside).toBe(true)
      expect(t.overflow).toBe(false)
      expect(t.iconSize).toBeLessThanOrEqual(18) // small, consistent icons
      expect(t.h).toBeGreaterThanOrEqual(40)
    }
  }
  // Exactly one selected segment per row, tablist semantics kept.
  await expect(
    page.locator('.lb-mode-tabs [aria-selected="true"]')
  ).toHaveCount(1)
  await expect(
    page.locator('.lb-scope-tabs [aria-selected="true"]')
  ).toHaveCount(1)
  await expect(page.getByRole('tab', { name: 'Top Players' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByRole('tab', { name: 'Top Clubs' })).toHaveAttribute(
    'aria-selected',
    'false'
  )
})
