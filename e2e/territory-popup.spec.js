import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Regression spec for the territory popup (GamePage.jsx's highlightedEntry
// card, .game-territory-popup) being shifted/cropped on the right on
// phones. The popup must sit dead-centre horizontally at every width:
// equal left/right gaps, nothing wider than the viewport, no page scroll.
const WIDTHS = [
  { w: 360, h: 740 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 1440, h: 900 },
  // Landscape phone.
  { w: 740, h: 360 },
]

const PARCEL = {
  id: 9001,
  ownerId: VETERAN.id,
  ownerName: VETERAN.fullName,
  areaSqMeters: 123456,
  currentScore: 4321,
  geometry: [
    [
      [85.324, 27.7172],
      [85.3252, 27.7172],
      [85.3252, 27.7184],
      [85.324, 27.7184],
      [85.324, 27.7172],
    ],
  ],
}

test.describe('Territory popup - centring', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.route('**/v1/territory/parcel/find', (route) =>
      route.fulfill(ok({ content: [PARCEL], totalElements: 1 }))
    )
  })

  for (const { w, h } of WIDTHS) {
    test(`is centred with equal gaps at ${w}x${h}`, async ({
      mockedPage: page,
    }) => {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/game')
      await expect(page.locator('.game-loading-overlay')).toBeHidden({
        timeout: 30_000,
      })
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: 'Me', exact: true }).click()
      await page.locator('.game-menu-list-row').first().click()

      const popup = page.locator('.game-territory-popup')
      await expect(popup).toBeVisible()
      // Let the scale-in animation finish so the box is its final size.
      await page.waitForFunction(() => {
        const el = document.querySelector('.game-territory-popup')
        return el && getComputedStyle(el).opacity === '1'
      })

      // Stress: a very long owner name must wrap/clip inside the card,
      // never push the card wider than the viewport.
      await page.evaluate(() => {
        const h3 = document.querySelector(
          '.game-territory-popup .game-highlight-toast-owner h3'
        )
        if (h3)
          h3.textContent =
            'Bhupendra-Bahadur-Thapa-Magar-Extraordinarily-Long-Username-12345'
      })

      const box = await popup.boundingBox()
      const vw = await page.evaluate(() => document.documentElement.clientWidth)
      const leftGap = box.x
      const rightGap = vw - (box.x + box.width)
      expect(
        Math.abs(leftGap - rightGap),
        `left ${leftGap}px vs right ${rightGap}px`
      ).toBeLessThanOrEqual(1)
      expect(leftGap).toBeGreaterThanOrEqual(8)

      const overflow = await page.evaluate(() => ({
        doc:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        card:
          document.querySelector('.game-territory-popup').scrollWidth -
          document.querySelector('.game-territory-popup').clientWidth,
      }))
      expect(overflow.doc).toBeLessThanOrEqual(0)
      expect(overflow.card).toBeLessThanOrEqual(0)

      await page.screenshot({
        path: `screenshots/territory-popup/${w}x${h}.png`,
      })
    })
  }
})
