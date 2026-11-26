import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// The shared popup (game/ui/Panel.jsx Modal) close X, seen on the Training
// Outdoor/Indoor chooser: it must sit in the top-right corner, ABOVE the
// panel and the title banner (it used to fall back to a static element at the
// top-left, half hidden under the cream panel), at least 44px, and never
// touch the title banner (8px+ gap). Runs at 360 / 390 (and 1440) projects.
test('Training chooser: the close X is visible, on top, top-right and clear of the title', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(150_000)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 90_000,
  })
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 20_000 })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Training', exact: true }).click()
  const close = page.locator('.g-modal-close')
  await expect(close).toBeVisible()
  // Let the pop-in animation finish so the boxes are final.
  await expect(async () => {
    const a = await close.boundingBox()
    await page.waitForTimeout(120)
    const b = await close.boundingBox()
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeLessThan(0.5)
  }).toPass()

  const m = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect()
    const x = box('.g-modal-close')
    const title = box('.g-modal-ribbon')
    const panel = box('.g-modal')
    const hit = document.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2)
    return {
      x: { l: x.left, r: x.right, t: x.top, w: x.width, h: x.height },
      title: { r: title.right },
      panel: { l: panel.left, r: panel.right },
      vw: innerWidth,
      position: getComputedStyle(document.querySelector('.g-modal-close'))
        .position,
      onTop: Boolean(hit?.closest('.g-modal-close')),
    }
  })
  expect(m.position).toBe('absolute')
  expect(m.onTop).toBe(true) // nothing (panel / banner) covers its centre
  expect(m.x.w).toBeGreaterThanOrEqual(43.5)
  expect(m.x.h).toBeGreaterThanOrEqual(43.5)
  // Top-right: its centre is in the right half of the panel.
  expect(m.x.l + m.x.w / 2).toBeGreaterThan((m.panel.l + m.panel.r) / 2)
  // Fully on screen.
  expect(m.x.r).toBeLessThanOrEqual(m.vw)
  expect(m.x.t).toBeGreaterThanOrEqual(0)
  // At least 8px between the title banner and the X.
  expect(m.x.l - m.title.r).toBeGreaterThanOrEqual(8)

  await close.click()
  await expect(page.locator('.g-modal')).toHaveCount(0)
})
