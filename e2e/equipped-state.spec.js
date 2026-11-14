import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Shop hero view: "equipped" is shown by the action button ("Equipped",
// disabled, green check) and an EQUIPPED chip under the name - never by a
// frame around the hero on the stage. Screenshots: ./screenshots/equipped-state/.
const SHOT_DIR = 'screenshots/equipped-state'

const HEROES = [
  { id: 'hero-nova-id', name: 'Nova', price: 0 },
  { id: 'hero-blaze-id', name: 'Blaze', price: 0 },
  { id: 'hero-cyclone-id', name: 'Cyclone', price: 500 },
].map((h) => ({
  id: h.id,
  name: h.name,
  tagline: `${h.name} runs on vibes`,
  backstory:
    'Raised on the rooftops, trained on the streets. A very long backstory that keeps going so the lore clamp and its Read more link have something to measure against when the chip sits under the name.',
  limited: false,
  abilities: [],
  skins: [
    {
      id: `storeitem-hero-${h.name.toLowerCase()}`,
      category: 'HERO',
      name: h.name,
      heroId: h.id,
      priceFahhcoin: h.price,
      assetUrl: null,
    },
  ],
}))

function owned(hero, equipped) {
  const skin = hero.skins[0]
  return { id: `owned-${hero.id}`, storeItem: skin, equipped }
}

function shot(page, testInfo, name) {
  return page.screenshot({
    path: `${SHOT_DIR}/${name}-${testInfo.project.name}.png`,
  })
}

test.describe('Equipped state in the hero view', () => {
  let ownedItems
  let equipDelay
  let failEquip

  test.beforeEach(async ({ mockedPage: page, context }) => {
    // Nova equipped, Blaze owned, Cyclone locked.
    ownedItems = [owned(HEROES[0], true), owned(HEROES[1], false)]
    equipDelay = 0
    failEquip = false
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.route('**/v1/store/heroes/find', (route) =>
      route.fulfill(ok({ content: HEROES, totalElements: HEROES.length }))
    )
    // loadHeroes fetches each hero's detail after the list call.
    await page.route(/\/v1\/store\/heroes\/(?!find$)[^/]+$/, (route) => {
      const id = route.request().url().split('/').pop()
      return route.fulfill(ok(HEROES.find((h) => h.id === id) || null))
    })
    await page.route('**/v1/store/owned', (route) =>
      route.fulfill(ok(ownedItems))
    )
    await page.route('**/v1/store/equipped', (route) =>
      route.fulfill(ok(ownedItems.filter((o) => o.equipped)))
    )
    await page.route(/\/v1\/store\/[^/]+\/equip$/, async (route) => {
      const id = route.request().url().split('/').slice(-2)[0]
      if (equipDelay) await new Promise((r) => setTimeout(r, equipDelay))
      if (failEquip) {
        return route.fulfill({
          status: 409, // not 5xx: the shared fixture fails tests on those
          contentType: 'application/json',
          body: JSON.stringify({ errorMessage: 'nope' }),
        })
      }
      ownedItems = ownedItems.map((o) =>
        o.storeItem.category === 'HERO'
          ? { ...o, equipped: o.storeItem.id === id }
          : o
      )
      return route.fulfill(ok({}))
    })
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
  })

  // The roster is a one-card-at-a-time slider whose starting card isn't
  // fixed, so walk to its start first and then step forward to the hero.
  async function slideTo(page, name) {
    const card = page.getByRole('button', { name: `${name} - view details` })
    const prev = page.getByRole('button', { name: 'Previous hero' })
    const next = page.getByRole('button', { name: 'Next hero' })
    await expect(prev).toBeVisible()
    for (let i = 0; i < 5 && (await prev.isEnabled()); i++) {
      await prev.click()
      await page.locator('.hero-card').first().waitFor()
    }
    for (let i = 0; i < 5 && !(await card.isVisible()); i++) {
      await next.click()
      await card.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {})
    }
    return card
  }

  async function openHero(page, name) {
    const card = await slideTo(page, name)
    await card.click()
    const dialog = page.getByRole('dialog', { name })
    await expect(dialog).toBeVisible()
    return dialog
  }

  async function expectNoStageFrame(dialog) {
    const shadows = await dialog
      .locator('.hero-emote-slide-figure')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).boxShadow))
    expect(shadows.length).toBeGreaterThan(0)
    for (const s of shadows) expect(s).toBe('none')
  }

  test('equipped hero: disabled Equipped button + chip, no frame', async ({
    mockedPage: page,
  }, testInfo) => {
    const dialog = await openHero(page, 'Nova')
    const action = dialog.getByTestId('hero-action')
    await expect(action).toBeDisabled()
    await expect(action).toHaveText(/Equipped/)
    await expect(dialog.getByTestId('hero-equipped-chip')).toBeVisible()
    await expect(dialog.getByText('Your hero')).toHaveCount(0)
    await expect(dialog.locator('.hero-emote-equipped-badge')).toHaveCount(0)
    await expectNoStageFrame(dialog)
    // Compact: the chip doesn't push the lore out of reach.
    await expect(dialog.locator('.hero-modal-lore')).toBeVisible()
    await shot(page, testInfo, 'equipped-hero')
  })

  test('owned, not equipped: Equip button, no chip', async ({
    mockedPage: page,
  }, testInfo) => {
    const dialog = await openHero(page, 'Blaze')
    const action = dialog.getByTestId('hero-action')
    await expect(action).toBeEnabled()
    await expect(action).toHaveText(/Equip$/)
    await expect(dialog.getByTestId('hero-equipped-chip')).toHaveCount(0)
    await expectNoStageFrame(dialog)
    await shot(page, testInfo, 'owned-hero')
  })

  test('locked hero keeps its unlock button, no chip', async ({
    mockedPage: page,
  }, testInfo) => {
    const dialog = await openHero(page, 'Cyclone')
    // Price is rendered by PriceLabel: text + number + coin icon (the
    // "Fahhcoin" wording lives in the price's aria-label).
    await expect(dialog.getByTestId('hero-action')).toContainText('Unlock for')
    await expect(
      dialog.getByTestId('hero-action').getByTestId('price')
    ).toHaveAttribute('data-price', '500')
    await expect(dialog.getByTestId('hero-equipped-chip')).toHaveCount(0)
    await shot(page, testInfo, 'locked-hero')
  })

  test('tapping Equip flips the button and chip at once, and sticks', async ({
    mockedPage: page,
  }, testInfo) => {
    equipDelay = 1500 // the button must not wait for the server
    const dialog = await openHero(page, 'Blaze')
    await dialog.getByTestId('hero-action').click()
    const action = dialog.getByTestId('hero-action')
    await expect(action).toBeDisabled({ timeout: 800 })
    await expect(action).toHaveText(/Equipped/)
    await expect(dialog.getByTestId('hero-equipped-chip')).toBeVisible()
    await shot(page, testInfo, 'after-equip')

    // Settles to the same thing once the server answered.
    await expect(action).toBeDisabled()
    await expect(dialog.getByTestId('hero-equipped-chip')).toBeVisible()
    // The Close button, not Escape: a bare Escape also closes the Shop menu
    // behind the modal (global handler, unrelated to this feature).
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    // Previously equipped hero lost its state...
    const nova = await openHero(page, 'Nova')
    await expect(nova.getByTestId('hero-action')).toBeEnabled()
    await expect(nova.getByTestId('hero-action')).toHaveText(/Equip$/)
    await expect(nova.getByTestId('hero-equipped-chip')).toHaveCount(0)
    await nova.getByRole('button', { name: 'Close' }).click()
    await expect(nova).toBeHidden()

    // ...and reopening the new one is still correct.
    const blaze = await openHero(page, 'Blaze')
    await expect(blaze.getByTestId('hero-action')).toBeDisabled()
    await expect(blaze.getByTestId('hero-equipped-chip')).toBeVisible()
  })

  test('a failed equip reverts the button and chip', async ({
    mockedPage: page,
  }) => {
    failEquip = true
    const dialog = await openHero(page, 'Blaze')
    await dialog.getByTestId('hero-action').click()
    await expect(page.getByText("Couldn't equip")).toBeVisible()
    await expect(dialog.getByTestId('hero-action')).toBeEnabled()
    await expect(dialog.getByTestId('hero-action')).toHaveText(/Equip$/)
    await expect(dialog.getByTestId('hero-equipped-chip')).toHaveCount(0)
  })
})
