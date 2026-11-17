import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Confirmation popups sit on an off-white card: their small text must be
// plain dark (no white, stroke or shadow) with >= 4.5:1 contrast, except the
// large titles. Audits the Buy Fahhcoin redirect popup and the coin shop card.
const BUNDLES = [
  { fahhcoinAmount: 100, priceNpr: 150 },
  { fahhcoinAmount: 550, priceNpr: 750 },
]
const PREFIX = process.env.BEFORE === '1' ? 'before-' : ''

// Runs in the page: every text-bearing element inside `root`, with its
// colour, the first opaque background up the tree, the contrast ratio, the
// stroke/shadow and the font size.
function audit(rootSel) {
  const lum = (c) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number)
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c.length === 3 || (c.length === 4 && c[3] === 1)) return c
    }
    return [255, 255, 255]
  }
  const out = []
  for (const el of document.querySelector(rootSel).querySelectorAll('*')) {
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim()
    )
    if (!own || el.closest('button')) continue
    const cs = getComputedStyle(el)
    const fg = parse(cs.color)
    const bg = bgOf(el)
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    out.push({
      text: el.textContent.trim().slice(0, 40),
      color: cs.color,
      ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100,
      stroke: cs.webkitTextStrokeWidth,
      shadow: cs.textShadow === 'none' ? 'none' : 'yes',
      size: parseFloat(cs.fontSize),
      cls: el.className,
    })
  }
  return out
}

test('Buy Fahhcoin popup text is plain dark and readable', async ({
  mockedPage: page,
  context,
}, testInfo) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.route('**/v1/coin-purchase/bundles', (r) => r.fulfill(ok(BUNDLES)))
  await page.goto('/game')
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page
    .getByRole('button', { name: 'Fahhcoin balance - buy more Fahhcoin' })
    .click()
  const row = page
    .locator('.game-coin-bundle-list .game-store-item')
    .filter({ hasText: '100 Fahhcoin' })
  await expect(row).toBeVisible({ timeout: 10_000 })
  const name = testInfo.project.name
  await page.locator('.game-coin-shop-card').screenshot({
    path: `screenshots/popup-text/${PREFIX}coin-shop-${name}.png`,
  })
  const shop = await page.evaluate(audit, '.game-coin-shop-card')
  await row.getByRole('button', { name: 'Buy' }).click()
  const card = page.locator('.game-buy-redirect-card')
  await expect(card).toBeVisible()
  await card.screenshot({
    path: `screenshots/popup-text/${PREFIX}buy-redirect-${name}.png`,
  })
  const buy = await page.evaluate(audit, '.game-buy-redirect-card')
  console.log(name, 'SHOP', JSON.stringify(shop))
  console.log(name, 'BUY', JSON.stringify(buy))
  if (PREFIX) return

  const pack = buy.find((e) => e.cls === 'game-buy-redirect-pack')
  const price = buy.find((e) => e.cls === 'game-buy-redirect-price')
  const note = buy.find((e) => e.cls === 'game-buy-redirect-note')
  for (const e of [pack, note]) {
    expect(e.color).toBe('rgb(43, 43, 43)')
    expect(e.stroke).toBe('0px')
    expect(e.shadow).toBe('none')
    expect(e.size).toBeGreaterThanOrEqual(15)
    expect(e.ratio).toBeGreaterThanOrEqual(4.5)
  }
  expect(price.color).toBe('rgb(221, 87, 28)')
  expect(price.stroke).toBe('0px')
  expect(price.shadow).toBe('none')
})
