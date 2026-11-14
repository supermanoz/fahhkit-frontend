import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Ownership vs equipped: card, modal, button, badge and the backend's
// "You don't own this item yet!" text must always agree. The mock backend
// mirrors the real rules: equip needs a UserStoreItem row (else 409
// NOT_OWNED), purchase creates one. Comet and Nova are FREE with NO row,
// like older accounts. Screenshots: ./screenshots/ownership-state/.
const SHOT_DIR = 'screenshots/ownership-state'
const NOT_OWNED = "You don't own this item yet!"

function hero(name, price, emotes = []) {
  const id = `hero-${name.toLowerCase()}-id`
  return {
    id,
    name,
    tagline: `${name} runs on vibes`,
    backstory: 'Short backstory.',
    limited: false,
    abilities: [],
    skins: [
      {
        id: `item-hero-${name.toLowerCase()}`,
        category: 'HERO',
        name,
        heroId: id,
        priceFahhcoin: price,
        assetUrl: null,
      },
      ...emotes.map(([ename, eprice]) => ({
        id: `item-emote-${ename.toLowerCase()}`,
        category: 'EMOTE',
        name: ename,
        heroId: id,
        priceFahhcoin: eprice,
        assetUrl: null,
      })),
    ],
  }
}

const HEROES = [
  hero('Comet', 0),
  hero('Nova', 0),
  // Classic: free, no row. Emote2: bought. Emote3: locked (300).
  hero('Blaze', 500, [
    ['Classic', 0],
    ['Emote2', 200],
    ['Emote3', 300],
  ]),
  hero('Cyclone', 500),
]
const allItems = HEROES.flatMap((h) => h.skins)
const byId = (id) => allItems.find((i) => i.id === id)

function shot(page, testInfo, name) {
  return page.screenshot({
    path: `${SHOT_DIR}/${name}-${testInfo.project.name}.png`,
  })
}

test.describe('Ownership state is consistent', () => {
  let rows // [{id, storeItem, equipped}]
  let calls

  test.beforeEach(async ({ mockedPage: page, context }) => {
    // Blaze (hero + Emote2) is bought; nothing equipped -> Comet is the
    // fallback active hero. Comet/Nova/Classic have no row at all.
    rows = [
      { id: 'o-blaze', storeItem: byId('item-hero-blaze'), equipped: false },
      { id: 'o-e2', storeItem: byId('item-emote-emote2'), equipped: false },
    ]
    calls = []
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
    await page.route('**/v1/store/owned', (route) => route.fulfill(ok(rows)))
    await page.route('**/v1/store/equipped', (route) =>
      route.fulfill(ok(rows.filter((o) => o.equipped)))
    )
    const notOwned = (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ errorMessage: NOT_OWNED }),
      })
    await page.route('**/v1/store/purchase', (route) => {
      const { storeItemId } = route.request().postDataJSON()
      calls.push(`purchase:${storeItemId}`)
      const item = byId(storeItemId)
      if (rows.some((r) => r.storeItem.id === storeItemId)) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ errorMessage: 'You already own this item!' }),
        })
      }
      rows.push({ id: `o-${storeItemId}`, storeItem: item, equipped: false })
      return route.fulfill(ok({}))
    })
    await page.route(/\/v1\/store\/[^/]+\/equip$/, (route) => {
      const id = route.request().url().split('/').slice(-2)[0]
      calls.push(`equip:${id}`)
      const row = rows.find((r) => r.storeItem.id === id)
      if (!row) return notOwned(route)
      rows = rows.map((r) =>
        r.storeItem.category === row.storeItem.category &&
        (row.storeItem.category === 'HERO' ||
          r.storeItem.heroId === row.storeItem.heroId)
          ? { ...r, equipped: r === row }
          : r
      )
      return route.fulfill(ok({}))
    })
    await page.route(/\/v1\/store\/[^/]+\/unequip$/, (route) => {
      const id = route.request().url().split('/').slice(-2)[0]
      calls.push(`unequip:${id}`)
      const row = rows.find((r) => r.storeItem.id === id)
      if (!row) return notOwned(route)
      rows = rows.map((r) => (r === row ? { ...r, equipped: false } : r))
      return route.fulfill(ok({}))
    })
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
  })

  // The roster dots jump straight to a hero (no walking the arrows).
  async function slideTo(page, name) {
    const card = page.getByRole('button', { name: `${name} - view details` })
    if (!(await card.isVisible())) {
      await page.getByRole('button', { name: `Show ${name}` }).click()
    }
    await expect(card).toBeVisible()
    await expect(page.locator('.hero-card')).toHaveCount(1)
    return card
  }
  async function openHero(page, name) {
    await (await slideTo(page, name)).click()
    const dialog = page.getByRole('dialog', { name })
    await expect(dialog).toBeVisible()
    return dialog
  }
  async function closeHero(dialog) {
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
  }
  const noMessage = (page) => expect(page.getByText(NOT_OWNED)).toHaveCount(0)
  const foot = (page) => page.locator('.hero-card-foot')

  test('Comet (free default, no row): Equipped on card and modal', async ({
    mockedPage: page,
  }, testInfo) => {
    await slideTo(page, 'Comet')
    await expect(foot(page)).toContainText('Equipped')
    await expect(foot(page).getByRole('button')).toBeDisabled()
    await noMessage(page)
    await shot(page, testInfo, 'comet-card')
    const d = await openHero(page, 'Comet')
    await expect(d.getByTestId('hero-action')).toHaveText(/Equipped/)
    await expect(d.getByTestId('hero-action')).toBeDisabled()
    await expect(d.getByTestId('hero-equipped-chip')).toBeVisible()
    await noMessage(page)
    await shot(page, testInfo, 'comet-modal')
  })

  test('Nova (free default, no row): Equip, claims then equips', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(120_000)
    await slideTo(page, 'Nova')
    await expect(foot(page).getByRole('button')).toHaveText(/Equip$/)
    await shot(page, testInfo, 'nova-card')
    const d = await openHero(page, 'Nova')
    await expect(d.getByTestId('hero-action')).toHaveText(/Equip$/)
    await expect(d.getByTestId('hero-equipped-chip')).toHaveCount(0)
    await shot(page, testInfo, 'nova-modal')
    await d.getByTestId('hero-action').click()
    await expect(d.getByTestId('hero-action')).toHaveText(/Equipped/)
    await noMessage(page)
    expect(calls.filter((c) => !c.includes('comet'))).toEqual([
      'purchase:item-hero-nova',
      'equip:item-hero-nova',
    ])
    await closeHero(d)

    // Switching back to Comet (still no row) must work, not 409.
    const c = await openHero(page, 'Comet')
    await expect(c.getByTestId('hero-action')).toHaveText(/Equip$/)
    await c.getByTestId('hero-action').click()
    await expect(c.getByTestId('hero-action')).toHaveText(/Equipped/)
    await noMessage(page)

    // Reload: state comes from the backend and agrees.
    await page.reload()
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 60_000,
    })
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await slideTo(page, 'Comet')
    await expect(foot(page)).toContainText('Equipped')
    await slideTo(page, 'Nova')
    await expect(foot(page).getByRole('button')).toHaveText(/Equip$/)
    await noMessage(page)
  })

  test('Blaze (bought): Equip then Equipped', async ({
    mockedPage: page,
  }, testInfo) => {
    const d = await openHero(page, 'Blaze')
    await expect(d.getByTestId('hero-action')).toHaveText(/Equip$/)
    await shot(page, testInfo, 'blaze-owned')
    await d.getByTestId('hero-action').click()
    await expect(d.getByTestId('hero-action')).toHaveText(/Equipped/)
    expect(calls.filter((c) => !c.includes('comet'))).toEqual([
      'equip:item-hero-blaze',
    ])
    await noMessage(page)
  })

  test('Cyclone (locked): Unlock price, no ownership message', async ({
    mockedPage: page,
  }, testInfo) => {
    await slideTo(page, 'Cyclone')
    await expect(foot(page)).toContainText('Unlock')
    await shot(page, testInfo, 'cyclone-card')
    const d = await openHero(page, 'Cyclone')
    await expect(d.getByTestId('hero-action')).toContainText('Unlock for')
    await expect(d.getByTestId('hero-equipped-chip')).toHaveCount(0)
    await noMessage(page)
    await shot(page, testInfo, 'cyclone-modal')
  })

  test('Emotes: Classic equipped, bought Equip, locked Buy', async ({
    mockedPage: page,
  }, testInfo) => {
    const d = await openHero(page, 'Blaze')
    // Slide 1: idle / Classic (free, no row, nothing else equipped).
    await expect(d.locator('.hero-emote-slide')).toHaveCount(1)
    await d.locator('.hero-emote-slide').click()
    const classic = page.locator('.emote-showcase-card')
    await expect(
      classic.getByRole('button', { name: 'Equipped' })
    ).toBeVisible()
    await noMessage(page)
    await shot(page, testInfo, 'emote-classic')
    await page.locator('.emote-showcase-close').click()

    // Slide 2: bought emote -> Equip -> Equipped.
    await page.keyboard.press('ArrowRight')
    await expect(d.locator('.hero-emote-slide')).toHaveCount(1)
    await d.locator('.hero-emote-slide').click()
    await expect(
      classic.getByRole('button', { name: 'Equip', exact: true })
    ).toBeVisible()
    await shot(page, testInfo, 'emote-bought')
    await classic.getByRole('button', { name: 'Equip', exact: true }).click()
    await expect(classic).toBeHidden()
    expect(calls).toContain('equip:item-emote-emote2')
    await noMessage(page)

    // Slide 3: locked emote -> Buy for 300, never the owned message.
    await page.keyboard.press('ArrowRight')
    await expect(d.locator('.hero-emote-slide')).toHaveCount(1)
    await d.locator('.hero-emote-slide').click()
    await expect(classic).toContainText('Buy for')
    await noMessage(page)
    await shot(page, testInfo, 'emote-locked')
  })
})
