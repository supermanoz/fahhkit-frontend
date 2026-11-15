import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// The auth-card logo hovers (translateY 0 -> -8px, 3s) over a shrinking soft
// shadow. Two frames half a cycle apart prove movement; layout must not move.
const OUT = 'screenshots/auth-logo-float'
const SIZES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
]

for (const vp of SIZES) {
  test(`logo floats at ${vp.name}`, async ({ mockedPage: page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/game')
    const logo = page.locator('.game-auth-logo')
    await expect(logo).toBeVisible({ timeout: 30_000 })
    const title = page.locator('.game-auth-title')
    const card = page.locator('.game-auth-card')
    const ty = () =>
      logo.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42)
    const frame = async (tag, progress) => {
      // Freeze the animation at an exact point of its 3s cycle.
      await page.evaluate((p) => {
        for (const a of document.getAnimations()) {
          a.pause()
          a.currentTime = p * 3000
        }
      }, progress)
      await page.screenshot({ path: `${OUT}/${tag}-${vp.name}.png` })
      return {
        y: await ty(),
        titleY: (await title.boundingBox()).y,
        cardH: (await card.boundingBox()).height,
      }
    }
    const low = await frame('frame1-rest', 0)
    const high = await frame('frame2-risen', 0.5)
    expect(low.y).toBeCloseTo(0, 1)
    expect(high.y).toBeCloseTo(-8, 1)
    // Nothing below moves, the card keeps its height.
    expect(high.titleY).toBe(low.titleY)
    expect(high.cardH).toBe(low.cardH)
  })
}

test('reduced motion: logo is static', async ({ mockedPage: page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/game')
  const logo = page.locator('.game-auth-logo')
  await expect(logo).toBeVisible({ timeout: 30_000 })
  await expect(logo).toHaveCSS('animation-name', 'none')
})
