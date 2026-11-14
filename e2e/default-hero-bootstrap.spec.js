import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Clean account: backend has NO owned/equipped records. The app must show
// Comet as Equipped, silently claim + equip it once, and then a Comet emote
// purchase works (the backend rejects it while Comet has no record).
// Screenshots: ./screenshots/default-hero-bootstrap/.
const SHOT_DIR = 'screenshots/default-hero-bootstrap'
const comet = {
  id: 'hero-comet-id',
  name: 'Comet',
  tagline: 'x',
  backstory: 'x',
  limited: false,
  abilities: [],
  skins: [
    {
      id: 'item-hero-comet',
      category: 'HERO',
      name: 'Comet',
      heroId: 'hero-comet-id',
      priceFahhcoin: 0,
    },
    {
      id: 'item-emote-classic',
      category: 'EMOTE',
      name: 'Classic',
      heroId: 'hero-comet-id',
      priceFahhcoin: 0,
    },
    {
      id: 'item-emote-emote3',
      category: 'EMOTE',
      name: 'Emote3',
      heroId: 'hero-comet-id',
      priceFahhcoin: 200,
    },
  ],
}
const items = comet.skins

test('clean account: silent equip fires once, stays Equipped, emote purchase works', async ({
  mockedPage: page,
  context,
}, testInfo) => {
  test.setTimeout(120_000)
  let rows = []
  const calls = []
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.route('**/v1/store/heroes/find', (r) =>
    r.fulfill(ok({ content: [comet], totalElements: 1 }))
  )
  await page.route(/\/v1\/store\/heroes\/(?!find$)[^/]+$/, (r) =>
    r.fulfill(ok(comet))
  )
  await page.route('**/v1/store/catalog/find', (r) =>
    r.fulfill(ok({ content: items, totalElements: items.length }))
  )
  await page.route('**/v1/store/owned', (r) => r.fulfill(ok(rows)))
  const fail = (r, msg) =>
    r.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ errorMessage: msg }),
    })
  await page.route('**/v1/store/purchase', (r) => {
    const { storeItemId } = r.request().postDataJSON()
    calls.push(`purchase:${storeItemId}`)
    const item = items.find((i) => i.id === storeItemId)
    if (rows.some((x) => x.storeItem.id === storeItemId))
      return fail(r, 'You already own this item!')
    if (
      item.category === 'EMOTE' &&
      !rows.some((x) => x.storeItem.id === 'item-hero-comet')
    )
      return fail(r, "You need to own this item's hero first!")
    rows.push({ id: `o-${storeItemId}`, storeItem: item, equipped: false })
    if (item.id === 'item-hero-comet')
      rows.push({ id: 'o-classic', storeItem: items[1], equipped: true }) // hero bundle
    return r.fulfill(ok({}))
  })
  await page.route(/\/v1\/store\/[^/]+\/equip$/, (r) => {
    const id = r.request().url().split('/').slice(-2)[0]
    calls.push(`equip:${id}`)
    const row = rows.find((x) => x.storeItem.id === id)
    if (!row) return fail(r, "You don't own this item yet!")
    rows = rows.map((x) =>
      x.storeItem.category === row.storeItem.category &&
      row.storeItem.category === 'HERO'
        ? { ...x, equipped: x === row }
        : x
    )
    return r.fulfill(ok({}))
  })

  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  // The silent bootstrap: exactly one claim + one equip, in that order.
  await expect
    .poll(() => calls.join(','))
    .toBe('purchase:item-hero-comet,equip:item-hero-comet')
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await expect(page.locator('.hero-card-foot')).toContainText('Equipped')
  await expect(page.getByText("You don't own this item yet!")).toHaveCount(0)
  await page.screenshot({
    path: `${SHOT_DIR}/comet-equipped-${testInfo.project.name}.png`,
  })

  // Emote purchase for Comet, no hero switching first.
  await page.getByRole('button', { name: 'Comet - view details' }).click()
  const d = page.getByRole('dialog', { name: 'Comet' })
  await expect(d.getByTestId('hero-action')).toHaveText(/Equipped/)
  await page.keyboard.press('ArrowRight')
  await expect(d.locator('.hero-emote-slide')).toHaveCount(1)
  await d.locator('.hero-emote-slide').click()
  await page
    .locator('.emote-showcase-card')
    .getByRole('button', { name: /Buy for/ })
    .click()
  await expect
    .poll(() => calls.includes('purchase:item-emote-emote3'))
    .toBe(true)
  await expect(
    page.locator('.emote-showcase-card .game-controls-hint-error')
  ).toHaveCount(0)
  await page.screenshot({
    path: `${SHOT_DIR}/emote-bought-${testInfo.project.name}.png`,
  })
  expect(calls.filter((c) => c === 'equip:item-hero-comet')).toHaveLength(1)
})
