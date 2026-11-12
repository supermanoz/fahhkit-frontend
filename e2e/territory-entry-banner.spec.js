import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Regression spec for the "Entering <owner>'s territory!" banner being
// shifted right and cropped on phones. Cause: it centred itself with a CSS
// transform: translateX(-50%) that framer-motion's own inline transform
// (y/scale entry animation) overwrote. It must now sit dead-centre.
const WIDTHS = [
  { w: 360, h: 740 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 1440, h: 900 },
]

// A rival's parcel covering the player's mocked GPS position.
const RIVAL_PARCEL = {
  id: 9100,
  ownerId: 'someone-else',
  ownerName: 'Aryan Bahadur Thapa Magar Extraordinarily Long Surname',
  areaSqMeters: 50000,
  currentScore: 100,
  geometry: [
    [
      [85.3235, 27.7167],
      [85.3245, 27.7167],
      [85.3245, 27.7177],
      [85.3235, 27.7177],
      [85.3235, 27.7167],
    ],
  ],
}

test.describe('Territory entry banner - centring', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    // The banner only lives ~3.2s, and the app's loading screen can still
    // be up for longer than that while basemap tiles stream in - so the
    // parcel response is held back until the test releases it (right
    // after the loading screen clears), or the banner would come and go
    // unseen underneath it.
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    page.releaseParcels = release
    await page.route('**/v1/territory/parcel/near**', async (route) => {
      await gate
      await route.fulfill(ok([RIVAL_PARCEL]))
    })
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
      page.releaseParcels()

      const banner = page.locator('.game-territory-entry-banner')
      await expect(banner).toBeVisible({ timeout: 10_000 })
      await expect(banner).toContainText('territory!')

      // The banner only lives ~3.2s, so measure as soon as the spring
      // entry animation has settled (box stops changing), not after.
      let last = ''
      await expect
        .poll(
          async () => {
            const b = await banner.boundingBox()
            const now = b ? JSON.stringify(b) : ''
            const settled = now !== '' && now === last
            last = now
            return settled
          },
          { intervals: [120], timeout: 2500 }
        )
        .toBe(true)

      const box = await banner.boundingBox()
      const vw = await page.evaluate(() => document.documentElement.clientWidth)
      const leftGap = box.x
      const rightGap = vw - (box.x + box.width)
      expect(
        Math.abs(leftGap - rightGap),
        `left ${leftGap}px vs right ${rightGap}px`
      ).toBeLessThanOrEqual(1)
      expect(leftGap).toBeGreaterThanOrEqual(8)
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(0)

      await page.screenshot({
        path: `screenshots/territory-entry-banner/${w}x${h}.png`,
      })
    })
  }
})
