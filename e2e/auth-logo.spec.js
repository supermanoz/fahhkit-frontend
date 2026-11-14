import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// The new Run Conquest logo on the game's sign-in card ("Claim the streets"):
// clearly visible but not huge (~60-65% of the card width, 300px max),
// centred, nothing overlapping, and the card still fits a 360x640 phone.
const OUT = 'screenshots/auth-logo'
const SIZES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
]

for (const vp of SIZES) {
  test(`welcome screen logo at ${vp.name}`, async ({ mockedPage: page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/game')
    const logo = page.locator('.game-auth-logo')
    await expect(logo).toBeVisible({ timeout: 30_000 })
    // Image really loaded (not a broken/blank box).
    await expect
      .poll(() => logo.evaluate((i) => i.complete && i.naturalWidth > 100))
      .toBe(true)

    const card = await page.locator('.game-auth-card').boundingBox()
    const lb = await logo.boundingBox()
    const title = await page.locator('.game-auth-title').boundingBox()
    const ratio = lb.width / card.width
    expect(ratio).toBeGreaterThan(0.55)
    expect(ratio).toBeLessThan(0.68)
    expect(lb.width).toBeLessThanOrEqual(300.5)
    // Centred in the card.
    expect(
      Math.abs(lb.x + lb.width / 2 - (card.x + card.width / 2))
    ).toBeLessThan(2)
    // Title sits below the logo, no overlap; buttons below the title.
    expect(title.y).toBeGreaterThanOrEqual(lb.y + lb.height - 1)
    const signIn = await page
      .getByRole('button', { name: 'Sign In', exact: true })
      .boundingBox()
    expect(signIn.y).toBeGreaterThan(title.y + title.height)
    // The card fits the screen (small phones included), no sideways scroll.
    expect(card.height).toBeLessThanOrEqual(vp.height)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true)
    await page.screenshot({ path: `${OUT}/welcome-${vp.name}.png` })

    // The other auth screens (none of them carry a logo) still lay out.
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByText('Welcome Back')).toBeVisible()
    await page.screenshot({ path: `${OUT}/sign-in-${vp.name}.png` })
  })
}
