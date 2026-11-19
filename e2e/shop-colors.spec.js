import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Shop > Territory / Trail: item cards, the preview sheet, and the buy / equip
// flow through the existing API calls (mocked). The header, coin row, tab
// buttons and the Heroes tab are not touched by this redesign.
const flag = (id, name, price, color, over = {}) => ({
  id,
  name,
  category: 'TERRITORY_SHADE',
  priceFahhcoin: price,
  colorValue: color,
  ...over,
})
const trail = (id, name, price, color) => ({
  ...flag(id, name, price, color),
  category: 'TRAIL_COLOR',
})

const CATALOG = [
  flag('f-teal', 'Teal', 3000, '#00897B'), // too dear for 2,000 coins
  flag('f-purple', 'Purple', 1500, '#8E24AA'),
  flag('f-blue', 'Blue', 0, '#4A90D9'), // free
  flag('f-orange', 'Orange', 2000, '#FB8C00'), // owned
  flag('f-red', 'Red', 1000, '#E53935'), // equipped
  flag('f-lv', 'Gold', 500, '#FDD835', { unlockLevel: 99 }), // level locked
  trail('t-green', 'Green', 1000, '#2E7D32'),
  trail('t-blue', 'Blue', 0, '#4A90D9'),
]

let owned
let balance
let calls

async function prepare(page, context) {
  owned = [
    { id: 'o1', storeItem: CATALOG[3], equipped: false },
    { id: 'o2', storeItem: CATALOG[4], equipped: true },
  ]
  balance = 2000
  calls = []
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.route('**/v1/store/catalog/find', (r) =>
    r.fulfill(ok({ content: CATALOG, totalElements: CATALOG.length }))
  )
  await page.route('**/v1/store/owned', (r) => r.fulfill(ok(owned)))
  await page.route('**/v1/store/equipped', (r) =>
    r.fulfill(ok(owned.filter((o) => o.equipped)))
  )
  await page.route('**/v1/territory/profile', (r) =>
    r.fulfill(
      ok({ ...VETERAN.territoryProfile, fahhcoinBalance: balance, level: 5 })
    )
  )
  await page.route('**/v1/store/purchase', (r) => {
    const { storeItemId } = r.request().postDataJSON()
    calls.push(['purchase', storeItemId])
    const item = CATALOG.find((i) => i.id === storeItemId)
    owned = [
      ...owned,
      { id: `o-${storeItemId}`, storeItem: item, equipped: false },
    ]
    balance -= Number(item.priceFahhcoin) || 0
    return r.fulfill(ok({}))
  })
  await page.route(/\/v1\/store\/[^/]+\/equip$/, (r) => {
    const id = r.request().url().split('/').slice(-2)[0]
    calls.push(['equip', id])
    const cat = CATALOG.find((i) => i.id === id).category
    owned = owned.map((o) =>
      o.storeItem.category === cat
        ? { ...o, equipped: o.storeItem.id === id }
        : o
    )
    return r.fulfill(ok({}))
  })
  await page.route(/\/v1\/store\/[^/]+\/unequip$/, (r) => {
    const id = r.request().url().split('/').slice(-2)[0]
    calls.push(['unequip', id])
    owned = owned.map((o) =>
      o.storeItem.id === id ? { ...o, equipped: false } : o
    )
    return r.fulfill(ok({}))
  })
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
}

async function openShop(page, tab, vp = { width: 360, height: 640 }) {
  await page.setViewportSize(vp)
  await page.goto('/game')
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 90_000 })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: tab, exact: true }).click()
  await expect(page.locator('.cs-card').first()).toBeVisible({
    timeout: 15_000,
  })
}
const card = (page, name) =>
  page.getByRole('button', { name: new RegExp(`^${name} -`) })
const sheet = (page) => page.locator('.cs-sheet')

// eslint-disable-next-line no-unused-vars -- a fixture must be destructured
test.beforeEach(async ({ mockedPage: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'one project is enough')
})

test('Territory: 2-column grid of cards, sorted, one clear state each (360x640)', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(90_000)
  await prepare(page, context)
  await openShop(page, 'Territory')
  const names = await page
    .locator('.cs-card')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label').split(' - ')[0])
    )
  expect(names).toEqual(
    [
      'Red Flag', // equipped
      'Orange Flag', // owned
      'Blue Flag', // free
      'Gold Flag', // (level locked, 500)
      'Purple Flag', // 1,500
      'Teal Flag', // 3,000
    ].sort((a, b) => names.indexOf(a) - names.indexOf(b))
  )
  expect(names.slice(0, 3)).toEqual(['Red Flag', 'Orange Flag', 'Blue Flag'])
  expect(names.indexOf('Purple Flag')).toBeLessThan(names.indexOf('Teal Flag'))

  // States.
  await expect(card(page, 'Red Flag')).toHaveClass(/is-equipped/)
  await expect(card(page, 'Red Flag').locator('.cs-check')).toBeVisible()
  await expect(card(page, 'Red Flag')).toContainText('Equipped')
  await expect(card(page, 'Orange Flag')).toContainText('Owned')
  await expect(card(page, 'Orange Flag')).toContainText('Equip')
  await expect(card(page, 'Blue Flag')).toContainText('Get')
  await expect(
    card(page, 'Purple Flag').locator('.cs-pill.is-price')
  ).toBeVisible()
  await expect(
    card(page, 'Teal Flag').locator('.cs-pill.is-short')
  ).toBeVisible()
  await expect(card(page, 'Teal Flag')).toContainText('Need 1,000 more')
  await expect(card(page, 'Gold Flag')).toContainText('Level 99')
  await expect(card(page, 'Blue Flag')).toHaveClass(/is-free/)
  await expect(card(page, 'Purple Flag')).toHaveClass(/is-premium/)

  // Layout: 2 equal columns, consistent sizes, nothing clipped, 44px+ targets.
  const boxes = await page.locator('.cs-card').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        right: r.right,
      }
    })
  )
  expect(new Set(boxes.map((b) => b.x)).size).toBe(2)
  expect(new Set(boxes.map((b) => b.w)).size).toBe(1)
  for (const b of boxes) {
    expect(b.right).toBeLessThanOrEqual(360)
    expect(b.h).toBeGreaterThanOrEqual(44)
  }
  // Cards in a row are the same height.
  const rows = {}
  for (const b of boxes) (rows[b.y] ??= []).push(b.h)
  for (const hs of Object.values(rows)) expect(new Set(hs).size).toBe(1)
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true)
  // Readable copy: body font, no outline on the small text.
  await expect(card(page, 'Teal Flag').locator('.cs-need')).toHaveCSS(
    'font-family',
    /Nunito/
  )
  await expect(card(page, 'Teal Flag').locator('.cs-need')).toHaveCSS(
    '-webkit-text-stroke-width',
    '0px'
  )
  // No live map instance per card: light SVG only.
  await expect(page.locator('.cs-card canvas')).toHaveCount(0)
  await expect(page.locator('.cs-card .maplibregl-map')).toHaveCount(0)
  expect(await page.locator('.cs-card svg.cs-preview').count()).toBe(6)
  // Static in the grid: nothing animates.
  await expect(page.locator('.cs-grid .cs-preview.is-animated')).toHaveCount(0)
})

test('tap a card -> preview sheet; buying works through the purchase call and shows success', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(90_000)
  await prepare(page, context)
  await openShop(page, 'Territory')
  await card(page, 'Purple Flag').click()
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).locator('.cs-sheet-title')).toHaveText('Purple Flag')
  await expect(sheet(page)).toContainText(
    'Your claimed land will show in this color.'
  )
  await expect(
    sheet(page).locator('.cs-sheet-preview .cs-preview')
  ).toHaveClass(/is-animated/)
  await expect(page.locator('.cs-grid .cs-preview.is-animated')).toHaveCount(0)
  await sheet(page)
    .getByRole('button', { name: /Buy for/ })
    .click()
  await expect.poll(() => calls).toEqual([['purchase', 'f-purple']])
  // Success state, and the button turns into Equip.
  await expect(sheet(page).locator('.cs-flash')).toContainText('Yours now')
  await sheet(page).getByRole('button', { name: 'Equip' }).click()
  await expect
    .poll(() => calls)
    .toEqual([
      ['purchase', 'f-purple'],
      ['equip', 'f-purple'],
    ])
  await expect(sheet(page).locator('.cs-flash')).toContainText('Equipped!')
  await expect(sheet(page).locator('.cs-equipped-state')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await expect(sheet(page)).toHaveCount(0)
  // The grid now has it equipped (first), the old one just owned.
  await expect(card(page, 'Purple Flag')).toHaveClass(/is-equipped/)
  await expect(card(page, 'Red Flag')).toHaveClass(/is-owned/)
  await expect(page.locator('.cs-card').first()).toContainText('Purple Flag')
})

test('free: Get it free; too few coins: Get Fahhcoin opens the coin shop; level lock is disabled', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(90_000)
  await prepare(page, context)
  await openShop(page, 'Territory')
  await card(page, 'Blue Flag').click()
  await sheet(page).getByRole('button', { name: 'Get it free' }).click()
  await expect.poll(() => calls).toEqual([['purchase', 'f-blue']])
  await expect(sheet(page).locator('.cs-flash')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Close' }).click()

  await card(page, 'Teal Flag').click()
  await expect(sheet(page)).toContainText('need 1,000 more')
  await expect(
    sheet(page).getByRole('button', { name: /Buy for/ })
  ).toHaveCount(0)
  await sheet(page).getByRole('button', { name: 'Get Fahhcoin' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByText('Buy Fahhcoin')).toBeVisible()
  expect(calls).toEqual([['purchase', 'f-blue']]) // nothing bought for Teal
})

test('Trail: same cards, the trail draws in the open preview, owned -> equip -> unequip', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(90_000)
  await prepare(page, context)
  await openShop(page, 'Trail')
  await expect(card(page, 'Green Trail')).toBeVisible()
  await expect(card(page, 'Blue Trail')).toContainText('Get')
  await expect(page.locator('.cs-grid .cs-trail-draw').first()).toBeVisible()
  await card(page, 'Green Trail').click()
  await expect(sheet(page)).toContainText('Your run line will look like this.')
  await expect(sheet(page).locator('.cs-runner')).toHaveCount(1) // runner dot at the end
  await expect(
    sheet(page).locator('.cs-sheet-preview .cs-preview')
  ).toHaveClass(/is-animated/)
  await sheet(page)
    .getByRole('button', { name: /Buy for/ })
    .click()
  await expect.poll(() => calls).toEqual([['purchase', 't-green']])
  await sheet(page).getByRole('button', { name: 'Equip' }).click()
  await expect(sheet(page).locator('.cs-equipped-state')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Unequip' }).click()
  await expect.poll(() => calls.at(-1)).toEqual(['unequip', 't-green'])
  await expect(sheet(page).getByRole('button', { name: 'Equip' })).toBeVisible()
  await expect(sheet(page).locator('.cs-flash')).toContainText('Unequipped')
})

test('sheet fits a short screen, and the shelf leaves room above the home indicator', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(90_000)
  await prepare(page, context)
  await openShop(page, 'Territory', { width: 360, height: 640 })
  await card(page, 'Purple Flag').click()
  const box = await sheet(page).boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(640)
  const buy = await sheet(page)
    .getByRole('button', { name: /Buy for/ })
    .boundingBox()
  expect(buy.y + buy.height).toBeLessThanOrEqual(640)
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  // Escape closed only the sheet - the Shop is still open behind it.
  await expect(page.locator('.cs-card').first()).toBeVisible()
  // Scroll to the end: the last card clears the bottom edge (+ safe area).
  await page.evaluate(() => {
    document.documentElement.dataset.native = 'true'
    document.documentElement.style.setProperty('--native-safe-bottom', '34px')
  })
  const sheetEl = page.locator('.game-menu-sheet')
  await sheetEl.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await page.waitForTimeout(200)
  const last = await page.locator('.cs-card').last().boundingBox()
  expect(last.y + last.height).toBeLessThanOrEqual(640 - 34)
})

test('3 columns on a wide screen, and the Heroes tab / header are untouched', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(90_000)
  await prepare(page, context)
  await openShop(page, 'Territory', { width: 1000, height: 800 })
  const xs = await page
    .locator('.cs-card')
    .evaluateAll((els) => [
      ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().x))),
    ])
  expect(xs.length).toBe(3)
  await expect(page.locator('.game-shop-wallet')).toBeVisible()
  await expect(page.locator('.game-shop-tabs button')).toHaveCount(3)
})

test('no white section labels; the grid sits the same distance under the tabs on all three tabs', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(90_000)
  await prepare(page, context)
  const HERO = {
    id: 'hero-nova-id',
    name: 'Nova',
    tagline: 'Runs on vibes',
    backstory: 'A short backstory.',
    limited: false,
    abilities: [],
    skins: [
      {
        id: 'storeitem-hero-nova',
        category: 'HERO',
        name: 'Nova',
        heroId: 'hero-nova-id',
        priceFahhcoin: 0,
        assetUrl: null,
      },
    ],
  }
  await page.route('**/v1/store/heroes/find', (r) =>
    r.fulfill(ok({ content: [HERO], totalElements: 1 }))
  )
  await page.route(/\/v1\/store\/heroes\/(?!find$)[^/]+$/, (r) =>
    r.fulfill(ok(HERO))
  )
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/game')
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 90_000 })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()

  const gaps = {}
  for (const tab of ['Heroes', 'Territory', 'Trail']) {
    const btn = page.getByRole('button', { name: tab, exact: true })
    await btn.click()
    // Tab buttons keep their accessible name + title.
    await expect(btn).toHaveAttribute('title', tab)
    await expect(btn).toHaveAttribute('aria-label', tab)
    await expect(page.locator('.game-shop-tabs + *')).toBeVisible()
    await page.waitForTimeout(500)
    // No visible section label anywhere in the Shop.
    await expect(
      page.locator('.game-menu-shop .game-menu-avatars-title')
    ).toHaveCount(0)
    gaps[tab] = await page.evaluate(() => {
      const tabs = document
        .querySelector('.game-shop-tabs')
        .getBoundingClientRect()
      const first = document.querySelector('.game-shop-tabs').nextElementSibling
      return (
        Math.round((first.getBoundingClientRect().top - tabs.bottom) * 10) / 10
      )
    })
  }
  // Territory / Trail are identical; Heroes starts at the same point too.
  expect(gaps.Territory).toBe(gaps.Trail)
  expect(gaps.Heroes).toBe(gaps.Territory)
  expect(gaps.Territory).toBeGreaterThan(0)
  // The standard gap under a section's tab row (14px row margin + 8px column
  // gap) - not a leftover hole where the label used to be.
  expect(gaps.Territory).toBeLessThanOrEqual(24)
  // And switching tabs does not move the tab row.
  const y = []
  for (const tab of ['Territory', 'Heroes', 'Trail']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    y.push(
      await page
        .locator('.game-shop-tabs')
        .evaluate((el) => Math.round(el.getBoundingClientRect().top))
    )
  }
  expect(new Set(y).size).toBe(1)
})
