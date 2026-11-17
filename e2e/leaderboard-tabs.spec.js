import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Leaderboard tab rows: Top Players / Top Clubs and the scope chips. Saves
// the rows as screenshots (BEFORE=1 -> before-*.png) and checks the label
// text has no stroke/shadow when inactive and that nothing overflows.
const OUT = 'screenshots/leaderboard-tabs'
const PREFIX = process.env.BEFORE === '1' ? 'before-' : ''

test('leaderboard tab rows', async ({
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
  const mode = page.locator('.game-leaderboard-mode')
  await expect(mode).toBeVisible()
  const name = testInfo.project.name
  await mode.screenshot({ path: `${OUT}/${PREFIX}mode-${name}.png` })
  const scope = page.locator('.game-menu-subtabs-scope')
  await scope.screenshot({ path: `${OUT}/${PREFIX}scope-${name}.png` })
  if (PREFIX) return

  const info = await mode.evaluate((row) => {
    const r = row.getBoundingClientRect()
    const tabs = [...row.querySelectorAll('.game-menu-subtab')]
    return tabs.map((t) => {
      const b = t.getBoundingClientRect()
      const icon = t.querySelector('svg').getBoundingClientRect()
      const label = t
        .querySelector('.game-menu-subtab-label')
        .getBoundingClientRect()
      const full = t.querySelector(
        '.label-full, .label-short:not([style*="none"])'
      )
      return {
        w: Math.round(b.width),
        h: Math.round(b.height),
        iconGap: Math.round(label.left - icon.right),
        padL: Math.round(icon.left - b.left),
        padR: Math.round(b.right - label.right),
        inside: b.left >= r.left - 1 && b.right <= r.right + 1,
        overflow: t.scrollWidth > t.clientWidth + 1,
        active: t.classList.contains('active'),
        text: full?.textContent,
      }
    })
  })
  console.log(name, JSON.stringify(info))
  expect(info[0].w).toBe(info[1].w)
  for (const t of info) {
    expect(t.inside).toBe(true)
    expect(t.overflow).toBe(false)
    expect(t.iconGap).toBeGreaterThanOrEqual(8)
  }
  // Inactive tab text: solid dark, no stroke, no shadow (outer + inner spans).
  const inactive = mode.locator('.game-menu-subtab:not(.active)')
  const spans = inactive.locator(
    '.game-menu-subtab-label, .game-menu-subtab-label span'
  )
  for (const s of await spans.all()) {
    await expect(s).toHaveCSS('-webkit-text-stroke-width', '0px')
    await expect(s).toHaveCSS('text-shadow', 'none')
  }
})
