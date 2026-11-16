import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Nova is level-locked until level 5: the Shop hero card and detail modal
// show the lock state (padlock chip + disabled "Reach level 5 to unlock",
// no price), emotes show locked, and from level 5 the hero is just owned
// (the backend grants it for free on level-up). Screenshots:
// ./screenshots/hero-level-lock/.
const SHOT_DIR = 'screenshots/hero-level-lock'

const NOVA_ITEM = {
  id: 'storeitem-hero-nova',
  category: 'HERO',
  name: 'Nova',
  heroId: 'hero-nova-id',
  priceFahhcoin: 0,
}
const NOVA_EMOTE = {
  id: 'storeitem-emote-nova-2',
  category: 'EMOTE',
  name: 'Emote2',
  heroId: 'hero-nova-id',
  priceFahhcoin: 0,
}
const BLAZE_ITEM = {
  id: 'storeitem-hero-blaze',
  category: 'HERO',
  name: 'Blaze',
  heroId: 'hero-blaze-id',
  priceFahhcoin: 0,
}
const mkHero = (id, name, skins) => ({
  id,
  name,
  tagline: `${name} runs on vibes`,
  backstory: 'Raised on the rooftops, trained on the streets.',
  limited: false,
  abilities: [],
  // As the backend's hero-detail response: skins carry NO unlockLevel.
  skins,
})
const HEROES = [
  mkHero('hero-blaze-id', 'Blaze', [BLAZE_ITEM]),
  mkHero('hero-nova-id', 'Nova', [NOVA_ITEM, NOVA_EMOTE]),
]
// The store catalog DOES carry it.
const CATALOG = [BLAZE_ITEM, { ...NOVA_ITEM, unlockLevel: 5 }, NOVA_EMOTE]

for (const level of [1, 4, 5, 7]) {
  test.describe(`level ${level}`, () => {
    test.use({ viewport: { width: 390, height: 844 } })
    test.setTimeout(150_000)
    const locked = level < 5

    test.beforeEach(async ({ mockedPage: page, context }) => {
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
      await seedSession(page, VETERAN)
      // The backend grants Nova (a real owned row) once level 5 is reached.
      const owned = [
        { id: 'o-blaze', storeItem: BLAZE_ITEM, equipped: true },
        ...(locked
          ? []
          : [{ id: 'o-nova', storeItem: NOVA_ITEM, equipped: false }]),
      ]
      await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
        page.getByText('Not now').click()
      )
      await page.route('**/v1/territory/profile', (route) =>
        route.fulfill(
          ok({ ...VETERAN.territoryProfile, level, xp: level * 1000 })
        )
      )
      await page.route('**/v1/store/catalog/find', (route) =>
        route.fulfill(ok({ content: CATALOG, totalElements: CATALOG.length }))
      )
      await page.route('**/v1/store/owned', (route) => route.fulfill(ok(owned)))
      await page.route('**/v1/store/equipped', (route) =>
        route.fulfill(ok(owned.filter((o) => o.equipped)))
      )
      await page.route('**/v1/store/heroes/find', (route) =>
        route.fulfill(ok({ content: HEROES, totalElements: HEROES.length }))
      )
      await page.route(/\/v1\/store\/heroes\/(?!find$)[^/]+$/, (route) => {
        const id = route.request().url().split('/').pop()
        return route.fulfill(ok(HEROES.find((h) => h.id === id) || null))
      })
      await page.goto('/game')
      await expect(page.locator('.game-hud-level')).toBeVisible({
        timeout: 90_000,
      })
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: 'Shop', exact: true }).click()
    })

    async function slideToNova(page) {
      const card = page.getByRole('button', { name: 'Nova - view details' })
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

    test('hero card', async ({ mockedPage: page }) => {
      const card = await slideToNova(page)
      await expect(card).toBeVisible()
      const chip = card.getByTestId('hero-level-chip')
      const action = card.getByTestId('hero-card-action')
      if (locked) {
        await expect(card).toHaveClass(/tier-level-locked/)
        await expect(chip).toHaveText(/Unlocks at level 5/i)
        await expect(action).toBeDisabled()
        await expect(action).toHaveText('Reach level 5 to unlock')
        // No price while level-locked, no green "owned" styling.
        await expect(card).not.toHaveClass(/tier-owned/)
        await expect(card.locator('.hero-card-foot-price')).toHaveCount(0)
      } else {
        await expect(chip).toHaveCount(0)
        await expect(card).toHaveClass(/tier-owned/)
        await expect(card.getByRole('button', { name: 'Equip' })).toBeVisible()
      }
      await page.screenshot({ path: `${SHOT_DIR}/card-level-${level}.png` })
    })

    test('hero modal + emotes', async ({ mockedPage: page }) => {
      const card = await slideToNova(page)
      await card.click()
      const dialog = page.getByRole('dialog', { name: 'Nova' })
      await expect(dialog).toBeVisible()
      const chip = dialog.getByTestId('hero-level-chip')
      const action = dialog.getByTestId('hero-action')
      if (locked) {
        await expect(chip).toHaveText(/Unlocks at level 5/i)
        await expect(action).toBeDisabled()
        await expect(action).toContainText('Reach level 5 to unlock')
        await expect(action).not.toContainText(/free|unlock for/i)
        await page.screenshot({
          path: `${SHOT_DIR}/modal-idle-level-${level}.png`,
        })
        // Free emote reads locked (padlock badge), not owned.
        const next = dialog.getByRole('button', { name: 'Next emote' })
        await next.click()
        await expect(
          dialog.locator('.hero-emote-lock-badge').first()
        ).toBeVisible()
      } else {
        await expect(chip).toHaveCount(0)
        await expect(action).toHaveText(/Equip/)
      }
      await page.screenshot({ path: `${SHOT_DIR}/modal-level-${level}.png` })
    })
  })
}
