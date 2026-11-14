import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Shop hero price: the card and the detail modal must show the same price
// (the hero's own HERO store item), and a purchase must debit exactly that.
// Regression: the card showed the cheapest price across ALL of a hero's
// store items (an emote's 2500 for Bolt) while the modal and the server's
// purchase used the HERO item's own 5000. Screenshots: ./screenshots/price-fix/.
const SHOT_DIR = 'screenshots/price-fix'

// hero, HERO-item price, and a cheaper emote that used to leak into the card.
const SPEC = [
  { name: 'Nova', price: 0, emote: 0, owned: true }, // owned + equipped
  { name: 'Blaze', price: 0, emote: 0, owned: true }, // owned, not equipped
  { name: 'Bolt', price: 5000, emote: 2500 }, // the reported bug
  { name: 'Phantom', price: 5000, emote: 3200 },
  { name: 'Cyclone', price: 1200, emote: 400 },
  { name: 'Pulse', price: 12500, emote: 900 },
]

const HEROES = SPEC.map((h) => {
  const key = h.name.toLowerCase()
  const skins = [
    {
      id: `item-hero-${key}`,
      category: 'HERO',
      name: h.name,
      heroId: `hero-${key}`,
      priceFahhcoin: h.price,
      assetUrl: null,
    },
  ]
  if (h.emote) {
    skins.push({
      id: `item-emote-${key}`,
      category: 'EMOTE',
      name: 'Emote2',
      heroId: `hero-${key}`,
      priceFahhcoin: h.emote,
      assetUrl: null,
    })
  }
  return {
    id: `hero-${key}`,
    name: h.name,
    tagline: `${h.name} runs on vibes`,
    backstory: 'Short lore.',
    limited: false,
    abilities: [],
    skins,
  }
})

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function shot(page, testInfo, name) {
  return page.screenshot({
    path: `${SHOT_DIR}/${name}-${testInfo.project.name}.png`,
  })
}

test.describe('Hero price: card, modal and purchase agree', () => {
  let balance
  let owned
  let purchases

  test.beforeEach(async ({ mockedPage: page, context }) => {
    balance = 20000
    purchases = []
    owned = SPEC.filter((h) => h.owned).map((h, i) => ({
      id: `owned-${h.name}`,
      storeItem: HEROES.find((x) => x.name === h.name).skins[0],
      equipped: i === 0,
    }))
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.route('**/v1/store/heroes/find', (route) =>
      route.fulfill(ok({ content: HEROES, totalElements: HEROES.length }))
    )
    await page.route(/\/v1\/store\/heroes\/(?!find$)[^/]+$/, (route) => {
      const id = route.request().url().split('/').pop()
      return route.fulfill(ok(HEROES.find((h) => h.id === id) || null))
    })
    await page.route('**/v1/store/owned', (route) => route.fulfill(ok(owned)))
    await page.route('**/v1/store/equipped', (route) =>
      route.fulfill(ok(owned.filter((o) => o.equipped)))
    )
    await page.route('**/v1/territory/profile', (route) =>
      route.fulfill(
        ok({ ...VETERAN.territoryProfile, fahhcoinBalance: balance })
      )
    )
    // Server behaviour: charges the PURCHASED ITEM's own price, nothing the
    // client sends along.
    await page.route(/\/v1\/store\/purchase$/, async (route) => {
      const id = JSON.parse(route.request().postData() || '{}').storeItemId
      const item = HEROES.flatMap((h) => h.skins).find((s) => s.id === id)
      purchases.push({ id, body: route.request().postData() })
      if (balance < item.priceFahhcoin) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ errorMessage: 'Not enough Fahhcoin' }),
        })
      }
      balance -= item.priceFahhcoin
      owned = [
        ...owned,
        { id: `owned-${id}`, storeItem: item, equipped: false },
      ]
      return route.fulfill(ok({}))
    })
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
  })

  // The roster shows one hero card at a time and starts on a variable card:
  // walk to its start, then step forward to the hero.
  async function slideTo(page, name) {
    const card = page.getByRole('button', { name: `${name} - view details` })
    if (!(await card.isVisible())) {
      await page.getByRole('button', { name: `Show ${name}` }).click()
    }
    await expect(card).toBeVisible()
    await expect(page.locator('.hero-card')).toHaveCount(1)
    return card
  }

  async function cardPrice(page, name) {
    const card = await slideTo(page, name)
    const price = card.getByTestId('price')
    return (await price.count())
      ? Number(await price.getAttribute('data-price'))
      : 0
  }

  test('card and modal show the same price for every hero', async ({
    mockedPage: page,
  }, testInfo) => {
    const table = []
    for (const h of SPEC) {
      const onCard = await cardPrice(page, h.name)
      const card = await slideTo(page, h.name)
      if (h.name === 'Bolt') await shot(page, testInfo, 'bolt-card')
      await card.click()
      const dialog = page.getByRole('dialog', { name: h.name })
      await expect(dialog).toBeVisible()
      const modalPrice = dialog.getByTestId('price')
      const inModal = (await modalPrice.count())
        ? Number(await modalPrice.getAttribute('data-price'))
        : 0
      if (h.name === 'Bolt') await shot(page, testInfo, 'bolt-modal')
      table.push({
        hero: h.name,
        card: onCard,
        modal: inModal,
        backendHeroItem: h.price,
        cheapestEmote: h.emote,
        currency: 'Fahhcoin',
      })
      if (h.owned) {
        expect(inModal).toBe(0)
        expect(onCard).toBe(0)
      } else {
        expect(onCard).toBe(h.price)
        expect(inModal).toBe(h.price)
        // Same number rendered the same way on both.
        await expect(modalPrice).toHaveText(fmt(h.price))
      }
      await dialog.getByRole('button', { name: 'Close' }).click()
      await expect(dialog).toBeHidden()
    }
    console.table(table)
    fs.writeFileSync(
      `${SHOT_DIR}/price-table.json`,
      JSON.stringify(table, null, 2)
    )
  })

  test('no stray EQUIP label on the stage of a locked hero', async ({
    mockedPage: page,
  }, testInfo) => {
    const card = await slideTo(page, 'Bolt')
    await card.click()
    const dialog = page.getByRole('dialog', { name: 'Bolt' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.hero-emote-available-badge')).toHaveCount(0)
    await expect(
      dialog.locator('.hero-emote-slide').getByText('Equip', { exact: true })
    ).toHaveCount(0)
    await shot(page, testInfo, 'locked-hero-modal')
  })

  test('buying debits exactly the displayed price', async ({
    mockedPage: page,
  }, testInfo) => {
    const card = await slideTo(page, 'Bolt')
    await card.click()
    const dialog = page.getByRole('dialog', { name: 'Bolt' })
    await dialog.getByTestId('hero-action').click()
    const confirm = page.locator('.game-buy-card')
    await expect(confirm).toBeVisible()
    // The confirm popup shows the same 5 000.
    await expect(confirm.getByTestId('price')).toHaveAttribute(
      'data-price',
      '5000'
    )
    await shot(page, testInfo, 'bolt-confirm')
    await confirm.getByRole('button', { name: 'Buy', exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect.poll(() => purchases.length).toBe(1)
    expect(purchases[0].id).toBe('item-hero-bolt')
    // The client sends no amount at all - the server's own price applies.
    expect(purchases[0].body || '').not.toMatch(/5000|2500/)
    expect(balance).toBe(20000 - 5000)
    // Owned now: button flips to Equip and the HUD balance dropped by 5 000.
    // Buying closes the hero modal; the HUD balance dropped by 5 000 and
    // reopening the hero now offers Equip.
    await expect(page.locator('.game-hud-value')).toHaveText(fmt(15000))
    const again = await slideTo(page, 'Bolt')
    await again.click()
    await expect(
      page.getByRole('dialog', { name: 'Bolt' }).getByTestId('hero-action')
    ).toHaveText(/Equip$/)
  })

  test('not enough Fahhcoin: the shortfall is price minus balance', async ({
    mockedPage: page,
  }, testInfo) => {
    balance = 3000
    await page.reload()
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    const card = await slideTo(page, 'Bolt')
    await card.click()
    const dialog = page.getByRole('dialog', { name: 'Bolt' })
    await dialog.getByTestId('hero-action').click()
    const confirm = page.locator('.game-buy-card')
    await expect(confirm.locator('.game-buy-short')).toContainText(
      `you have ${fmt(3000)}, need ${fmt(2000)} more`
    )
    await shot(page, testInfo, 'bolt-short')
    expect(purchases).toHaveLength(0)
  })

  test('owned and equipped states still work', async ({ mockedPage: page }) => {
    const nova = await slideTo(page, 'Nova')
    await nova.click()
    let dialog = page.getByRole('dialog', { name: 'Nova' })
    await expect(dialog.getByTestId('hero-action')).toBeDisabled()
    await expect(dialog.getByTestId('hero-equipped-chip')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    const blaze = await slideTo(page, 'Blaze')
    await blaze.click()
    dialog = page.getByRole('dialog', { name: 'Blaze' })
    await expect(dialog.getByTestId('hero-action')).toHaveText(/Equip$/)
    await expect(dialog.getByTestId('hero-equipped-chip')).toHaveCount(0)
  })
})
