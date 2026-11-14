import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Regression coverage for the Buy Fahhcoin redirect-confirmation popup
// (GamePage.jsx's buyRedirectBundle/handleContinueToShop) - a Buy tap no
// longer starts a purchase directly, it opens this confirmation first,
// which on Continue hands off to the public /shop page in a new tab
// instead (see utils/siteUrl.js). Screenshots saved to
// ./screenshots/buy-redirect/.
const BUNDLES = [
  { fahhcoinAmount: 100, priceNpr: 150 },
  { fahhcoinAmount: 550, priceNpr: 750 },
  { fahhcoinAmount: 1200, priceNpr: 1500 },
]

function profileWithBalance(balance) {
  return { ...VETERAN.territoryProfile, fahhcoinBalance: balance }
}

test.describe('Buy Fahhcoin redirect confirmation', () => {
  test.beforeEach(async ({ mockedPage: page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)

    await page.route('**/v1/coin-purchase/bundles', (route) =>
      route.fulfill(ok(BUNDLES))
    )

    // First call: starting balance. Every call after Continue-to-Shop has
    // been tapped: balance already topped up - simulates the purchase
    // having completed on the website while the game was backgrounded.
    let profileCalls = 0
    await page.route('**/v1/territory/profile', (route) => {
      profileCalls += 1
      route.fulfill(ok(profileWithBalance(profileCalls === 1 ? 2500 : 3050)))
    })

    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
  })

  async function openCoinShopAndPickBundle(page, fahhcoinAmount) {
    await page
      .getByRole('button', { name: 'Fahhcoin balance - buy more Fahhcoin' })
      .click()
    const row = page
      .locator('.game-coin-bundle-list .game-store-item')
      .filter({ hasText: `${fahhcoinAmount.toLocaleString('en-US')} Fahhcoin` })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.getByRole('button', { name: 'Buy' }).click()
  }

  for (const bundle of BUNDLES) {
    test(`tapping Buy on ${bundle.fahhcoinAmount} Fahhcoin shows the matching confirmation`, async ({
      mockedPage: page,
    }) => {
      await openCoinShopAndPickBundle(page, bundle.fahhcoinAmount)

      await expect(page.locator('.game-buy-redirect-card')).toBeVisible()
      await expect(page.locator('.game-buy-redirect-title')).toHaveText(
        'Open the Shop'
      )
      await expect(page.locator('.game-buy-redirect-pack')).toHaveText(
        `${bundle.fahhcoinAmount.toLocaleString('en-US')} Fahhcoin · Rs. ${bundle.priceNpr.toLocaleString('en-US')}`
      )
      await expect(page.locator('.game-buy-redirect-note')).toContainText(
        "You'll be taken to the Fahhcoin shop page"
      )
    })
  }

  test('Cancel closes the popup without opening anything', async ({
    mockedPage: page,
  }) => {
    await openCoinShopAndPickBundle(page, 550)
    await expect(page.locator('.game-buy-redirect-card')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.game-buy-redirect-card')).toBeHidden()
    // Still on the coin-shop list behind it, not navigated away.
    await expect(page.locator('.game-coin-shop-card')).toBeVisible()
  })

  test('Escape closes the popup', async ({ mockedPage: page }) => {
    await openCoinShopAndPickBundle(page, 100)
    await page.keyboard.press('Escape')
    await expect(page.locator('.game-buy-redirect-card')).toBeHidden()
  })

  // Its own test, not a second check tacked onto the Escape one above -
  // Escape only closes the redirect confirmation, not the coin-shop list
  // popup underneath it (same "leave the parent popup mounted" pattern as
  // every other nested confirm here), so reusing openCoinShopAndPickBundle
  // a second time in the same test would try to re-click the HUD's Buy
  // button while that still-open list popup sits over it - every
  // non-force click would just hang waiting for it to become clickable.
  test('the scrim closes the popup', async ({ mockedPage: page }) => {
    await openCoinShopAndPickBundle(page, 100)
    // Click the overlay itself, outside the card.
    await page.locator('.game-buy-redirect-overlay').click({
      position: { x: 5, y: 5 },
    })
    await expect(page.locator('.game-buy-redirect-card')).toBeHidden()
  })

  test('Continue to Shop opens /shop?pack=... in a new tab, and returning refreshes the balance', async ({
    mockedPage: page,
    context,
  }) => {
    // formatCoins uses a space as its thousands separator (utils/format.js).
    await expect(
      page.locator('.game-hud-stat-coin .game-hud-value')
    ).toHaveText('2,500')

    await openCoinShopAndPickBundle(page, 550)

    const [shopPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Continue to Shop' }).click(),
    ])
    await shopPage.waitForLoadState('domcontentloaded')
    expect(new URL(shopPage.url()).pathname).toBe('/shop')
    expect(new URL(shopPage.url()).searchParams.get('pack')).toBe('550')
    await shopPage.close()

    // The popup closes itself the moment the tab opens - no second tap
    // possible, no leftover popup to come back to.
    await expect(page.locator('.game-buy-redirect-card')).toBeHidden()

    // Simulate the OS/browser bringing the game back to the foreground -
    // real cross-tab focus changes aren't reliably reproducible headless,
    // so this drives the same event handleVisibility actually listens for.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        value: false,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect(
      page.locator('.game-hud-stat-coin .game-hud-value')
    ).toHaveText('3,050', { timeout: 10_000 })
  })

  test('double-tap guard - Continue can only open one tab', async ({
    mockedPage: page,
    context,
  }) => {
    await openCoinShopAndPickBundle(page, 1200)

    const pagesBefore = context.pages().length
    // The real click (buyRedirecting + disabled synchronously guard
    // against a second one through Playwright's own actionability checks)
    // plus a second tap fired directly via the DOM, bypassing Playwright's
    // click retry/wait-for-stable loop entirely - that loop would otherwise
    // hang here regardless of outcome, since the first click's own state
    // update unmounts this exact button (AnimatePresence closes the
    // popup) out from under a second .click() call still waiting on it.
    // This is the realistic double-tap case: a second touch landing on the
    // button before React has re-rendered it disabled.
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Continue to Shop' }).click(),
    ])
    await page.evaluate(() => {
      document
        .querySelector('.game-buy-redirect-card .game-btn.game-btn-green')
        ?.click()
    })
    await newPage.waitForLoadState('domcontentloaded')
    // Give any accidental second tab a moment to open before counting.
    await page.waitForTimeout(300)
    expect(context.pages().length).toBe(pagesBefore + 1)
  })

  for (const [name, viewport] of [
    ['mobile-390', { width: 390, height: 844 }],
    ['desktop-1440', { width: 1440, height: 900 }],
  ]) {
    test(`popup screenshot - ${name}`, async ({ mockedPage: page }) => {
      await page.setViewportSize(viewport)
      await openCoinShopAndPickBundle(page, 550)
      await expect(page.locator('.game-buy-redirect-card')).toBeVisible()
      // Both this popup's own entrance and the coin-shop list's exit
      // (unmounted via !buyRedirectBundle, but AnimatePresence keeps it
      // mounted/crossfading for its own exit transition) are still mid-
      // animation the instant the card becomes "visible" - capturing right
      // away catches that crossfade, not the settled popup. Longer than
      // either transition's own duration (0.38s/0.42s elsewhere in this
      // file's styles).
      await page.waitForTimeout(500)

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
      expect(
        overflow,
        'horizontal overflow at this viewport'
      ).toBeLessThanOrEqual(1)

      await page.screenshot({
        path: `screenshots/buy-redirect/popup-${name}.png`,
      })
    })
  }
})
