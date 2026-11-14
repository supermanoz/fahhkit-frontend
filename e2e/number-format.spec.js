import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Numbers use ONE formatter: en-US comma ("5,000"), never U+00A0 / U+202F,
// and "Unlock for 5,000 [coin]" is built from elements with a flex gap.
// The browser locale is forced to French (which groups with U+202F) so a
// regression to toLocaleString() would show up. Screenshots:
// ./screenshots/number-format/.
test.use({ locale: 'fr-FR' })
const SHOT_DIR = 'screenshots/number-format'
const BAD = /[\u00A0\u202F]/

const BOLT = {
  id: 'hero-bolt-id',
  name: 'Bolt',
  tagline: 'x',
  backstory: 'x',
  limited: false,
  abilities: [],
  skins: [
    {
      id: 'item-hero-bolt',
      category: 'HERO',
      name: 'Bolt',
      heroId: 'hero-bolt-id',
      priceFahhcoin: 5000,
    },
  ],
}

test('numbers: comma grouping, no NBSP, proper spacing', async ({
  mockedPage: page,
  context,
}, testInfo) => {
  test.setTimeout(120_000)
  const shot = (n) =>
    page.screenshot({ path: `${SHOT_DIR}/${n}-${testInfo.project.name}.png` })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.route('**/v1/territory/profile', (r) =>
    r.fulfill(ok({ ...VETERAN.territoryProfile, fahhcoinBalance: 14500 }))
  )
  await page.route('**/v1/store/heroes/find', (r) =>
    r.fulfill(ok({ content: [BOLT], totalElements: 1 }))
  )
  await page.route(/\/v1\/store\/heroes\/(?!find$)[^/]+$/, (r) =>
    r.fulfill(ok(BOLT))
  )
  await page.route('**/v1/store/owned', (r) => r.fulfill(ok([])))
  await page.route('**/v1/coin-purchase/bundles', (r) =>
    r.fulfill(
      ok([
        { fahhcoinAmount: 100, priceNpr: 100 },
        { fahhcoinAmount: 5000, priceNpr: 4500 },
        { fahhcoinAmount: 14500, priceNpr: 12000 },
      ])
    )
  )
  await page.route('**/v1/leaderboard/club/find', (r) =>
    r.fulfill(
      ok({
        content: [
          { clubId: 'c1', clubName: 'Big Club', rank: 1, trophies: 14500 },
        ],
        totalElements: 1,
      })
    )
  )
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })

  // HUD balance.
  const hud = page
    .locator('.g-currency-value, .game-hud-coin-value, .game-hud')
    .first()
  await expect(page.getByText('14,500').first()).toBeVisible()
  await shot('hud')

  await page.locator('.game-menu-btn').click()
  // Hero card + modal (Bolt costs 5,000).
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  const foot = page.locator('.hero-card-foot')
  await expect(foot).toContainText('Unlock')
  await expect(foot.locator('.price')).toHaveText('5,000')
  await expect(foot.locator('.price-label')).toHaveCSS('gap', /px/)
  await shot('hero-card')
  await page.getByRole('button', { name: 'Bolt - view details' }).click()
  const dialog = page.getByRole('dialog', { name: 'Bolt' })
  const action = dialog.getByTestId('hero-action')
  await expect(action.locator('.price')).toHaveText('5,000')
  // Real gap between "Unlock for" and the number, coin vertically centred.
  const [label, price, coin] = await Promise.all([
    action.locator('.price-label > span').first().boundingBox(),
    action.locator('.price').boundingBox(),
    action.locator('.game-coin').boundingBox(),
  ])
  expect(price.x - (label.x + label.width)).toBeGreaterThanOrEqual(3)
  expect(
    Math.abs(coin.y + coin.height / 2 - (price.y + price.height / 2))
  ).toBeLessThan(3)
  await shot('hero-modal')
  await dialog.getByRole('button', { name: 'Close' }).click()

  // Fahhcoin packs.
  await page.getByRole('button', { name: '+ Get more' }).click()
  await expect(page.getByText('5,000 Fahhcoin')).toBeVisible()
  await expect(page.getByText('14,500 Fahhcoin')).toBeVisible()
  await shot('packs')
  await expect(page.getByText('Rs. 4,500')).toBeVisible()
  await page
    .locator('.game-coin-shop-card')
    .getByRole('button', { name: 'Close' })
    .click()

  // Leaderboard row (club trophies).
  // Phones collapse the tabs into a picker; open it first.
  const picker = page.locator('.game-menu-picker-current')
  const onPhone = await picker.isVisible()
  if (onPhone) await picker.click()
  await (
    onPhone
      ? page
          .locator('.game-menu-picker')
          .getByText('Leaderboard', { exact: true })
      : page.getByRole('button', { name: 'Leaderboard', exact: true })
  ).click({ timeout: 10_000 })
  await page.getByRole('tab', { name: 'Top Clubs' }).click()
  await expect(page.getByText('Big Club')).toBeVisible()
  await expect(page.locator('.lb-trophy-stat').first()).toHaveText('14,500')
  await shot('leaderboard')

  const text = await page.evaluate(() => document.body.innerText)
  expect(BAD.test(text)).toBe(false)
  void hud
})
