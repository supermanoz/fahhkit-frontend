import { test, expect } from '@playwright/test'

// Hero card: the perk panel explains itself. Rendered through the same harness
// as hero-card.spec.js (the real HeroDetailModal).
const SEEDED = [
  {
    name: 'Blaze',
    type: 'PACE',
    m: 1.05,
    title: 'Pace',
    value: '+5%',
    modes: ['Conquer', 'Training', 'Club War'],
    example: 'If your pace earns 20 points, you get 21.',
  },
  {
    name: 'Phantom',
    type: 'AREA',
    m: 1.05,
    title: 'Territory Area',
    value: '+5%',
    modes: ['Conquer', 'Training'],
    example: 'A loop worth 12 points counts as 12.6.',
  },
  {
    name: 'Bolt',
    type: 'BASE_EFFORT',
    m: 1.05,
    title: 'Distance',
    value: '+5%',
    modes: ['Conquer', 'Training', 'Club War'],
    example: 'A 5 km run earns 10 points, so you get 10.5.',
  },
  {
    name: 'Cyclone',
    type: 'RACE_TIME',
    m: 0.95,
    title: 'Race Time',
    value: '−5%',
    modes: ['PvP'],
    example: 'A 10:00 race counts as 9:30.',
  },
  {
    name: 'Pulse',
    type: 'PERIMETER_EFFICIENCY',
    m: 1.05,
    title: 'Loop Shape',
    value: '+5%',
    modes: ['Conquer', 'Training'],
    example: 'A loop worth 30 shape points counts as 31.5.',
  },
]

function props(def, state = 'owned', level = 10) {
  const item = {
    id: `item-${def.name}`,
    category: 'HERO',
    name: def.name,
    heroId: `hero-${def.name}`,
    priceFahhcoin: state === 'locked' ? 5000 : 0,
    ...(state === 'level-locked' ? { unlockLevel: 5 } : {}),
  }
  const owned = state === 'owned' || state === 'equipped'
  return {
    hero: {
      id: `hero-${def.name}`,
      name: def.name,
      tagline: `${def.name} runs on vibes`,
      backstory: 'A short backstory.',
      limited: false,
      abilities: def.type
        ? [{ id: 'a1', componentType: def.type, multiplier: def.m }]
        : [],
      skins: [item],
    },
    ownedItems: owned
      ? [{ id: 'o1', storeItem: item, equipped: state === 'equipped' }]
      : [],
    activeHeroId: state === 'equipped' ? `hero-${def.name}` : 'someone-else',
    isActive: state === 'equipped',
    level: state === 'level-locked' ? 1 : level,
  }
}

async function show(page, p) {
  await page.evaluate((x) => window.__show(x), p)
  await expect(page.getByRole('dialog', { name: p.hero.name })).toBeVisible()
  await page.waitForTimeout(900) // entry stagger
}
const perkBtn = (page) => page.locator('.hero-perk-btn')
const pop = (page) => page.locator('.hero-perk-pop')

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'harness runs once')
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/e2e/previews/hero-card.html')
  await page.waitForFunction(() => window.__ready)
})

for (const d of SEEDED) {
  test(`${d.name}: tappable perk row with a plain summary, popup explains ${d.title}`, async ({
    page,
  }) => {
    await show(page, props(d, 'equipped'))
    const btn = perkBtn(page)
    // Clearly tappable: a button, an info icon, a chevron, a 44px+ target.
    await expect(btn).toHaveCount(1)
    await expect(btn).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(btn.locator('.hero-perk-info')).toBeVisible()
    await expect(btn.locator('.hero-perk-chev')).toBeVisible()
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44)
    // The one-line plain summary, small and grey, under the value.
    const summary = btn.locator('.hero-perk-summary')
    await expect(summary).toBeVisible()
    expect((await summary.innerText()).length).toBeGreaterThan(10)
    await expect(summary).toHaveCSS('-webkit-text-stroke-width', '0px')
    expect(
      await summary.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    ).toBeLessThanOrEqual(14)
    await expect(page.locator('.hero-modal-stat-value')).toHaveText(d.value)

    await btn.click()
    await expect(pop(page)).toBeVisible()
    // Title ribbon = the perk name; shared close button; OK button.
    await expect(page.locator('.g-modal-ribbon')).toHaveText(d.title)
    await expect(page.locator('.g-modal-close')).toBeVisible()
    await expect(pop(page).locator('.hero-perk-value')).toHaveText(d.value)
    await expect(pop(page).locator('.hero-perk-sentence')).not.toBeEmpty()
    await expect(pop(page).locator('.hero-perk-example')).toContainText(
      d.example
    )
    await expect(pop(page).locator('.hero-perk-chip')).toHaveText(d.modes)
    await expect(pop(page).locator('.hero-perk-status')).toHaveText('Equipped')
    await expect(pop(page).getByRole('button', { name: 'OK' })).toHaveClass(
      /gbtn-primary/
    )
    // Sits on top of the hero card and fits the small screen.
    const box = await page.locator('.g-modal').boundingBox()
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(640)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    const top = await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
      return Boolean(el?.closest('.g-modal'))
    })
    expect(top).toBe(true)
    // Readable: body font, no outline.
    await expect(pop(page).locator('.hero-perk-sentence')).toHaveCSS(
      'font-family',
      /Nunito/
    )
    await expect(pop(page).locator('.hero-perk-sentence')).toHaveCSS(
      '-webkit-text-stroke-width',
      '0px'
    )
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true)
  })
}

test('a perk-less hero (Nova): no info icon, no popup, the current line stays', async ({
  page,
}) => {
  await show(page, props({ name: 'Nova', type: null }))
  await expect(perkBtn(page)).toHaveCount(0)
  await expect(page.locator('.hero-perk-info')).toHaveCount(0)
  await expect(page.getByText('Pure style, no perks')).toBeVisible()
  await page.locator('.hero-modal-muted').click()
  await expect(pop(page)).toHaveCount(0)
})

test('the popup says whether the perk is working: equipped / not equipped / locked / not unlocked', async ({
  page,
}) => {
  const d = SEEDED[0]
  const open = async (state) => {
    await show(page, props(d, state))
    await perkBtn(page).click()
    await expect(pop(page)).toBeVisible()
  }
  await open('equipped')
  await expect(pop(page).locator('.hero-perk-status')).toHaveText('Equipped')
  await expect(pop(page).locator('.hero-perk-status')).toHaveClass(/is-on/)
  await expect(pop(page)).toContainText('working on your runs')
  await pop(page).getByRole('button', { name: 'OK' }).click()

  await open('owned')
  await expect(pop(page).locator('.hero-perk-status')).toHaveText(
    'Not equipped'
  )
  await expect(pop(page).locator('.hero-perk-hint')).toHaveText(
    'Equip this hero to use it.'
  )
  await pop(page).getByRole('button', { name: 'OK' }).click()

  await open('level-locked')
  await expect(pop(page).locator('.hero-perk-status')).toHaveText(
    'Locked until level 5'
  )
  await expect(pop(page).locator('.hero-perk-hint')).toContainText(
    'Reach level 5'
  )
  await pop(page).getByRole('button', { name: 'OK' }).click()

  await open('locked') // a paid hero you do not own yet
  await expect(pop(page).locator('.hero-perk-status')).toHaveText(
    'Not equipped'
  )
  await expect(pop(page).locator('.hero-perk-hint')).toContainText(
    'Unlock this hero'
  )
})

test('closing: X, OK and Escape close only the popup; the hero card stays open', async ({
  page,
}) => {
  await show(page, props(SEEDED[3], 'owned'))
  await page.evaluate(() => (window.__closed = 0))
  for (const how of ['x', 'ok', 'escape', 'scrim']) {
    await perkBtn(page).click()
    await expect(pop(page)).toBeVisible()
    if (how === 'x') await page.locator('.g-modal-close').click()
    if (how === 'ok')
      await pop(page).getByRole('button', { name: 'OK' }).click()
    if (how === 'escape') await page.keyboard.press('Escape')
    if (how === 'scrim')
      await page.locator('.g-modal-scrim').click({ position: { x: 4, y: 4 } })
    await expect(pop(page)).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Cyclone' })).toBeVisible()
    expect(await page.evaluate(() => window.__closed)).toBe(0)
  }
  // Tapping inside the popup never reaches the card's own backdrop.
  await perkBtn(page).click()
  await pop(page).locator('.hero-perk-sentence').click()
  await expect(pop(page)).toBeVisible()
  expect(await page.evaluate(() => window.__closed)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(pop(page)).toHaveCount(0)
  // With the popup gone, Escape closes the hero card as before.
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => window.__closed)).toBe(1)
})

test('keyboard: the perk row is focusable and Enter opens the popup', async ({
  page,
}) => {
  await show(page, props(SEEDED[1], 'owned'))
  await perkBtn(page).focus()
  await page.keyboard.press('Enter')
  await expect(pop(page)).toBeVisible()
  await expect(page.locator('.g-modal-ribbon')).toHaveText('Territory Area')
})

test('a hero with two perks marks the weaker one as half strength', async ({
  page,
}) => {
  const p = props(SEEDED[0], 'owned')
  p.hero.abilities = [
    { id: 'a1', componentType: 'PACE', multiplier: 1.08 },
    { id: 'a2', componentType: 'AREA', multiplier: 1.04 },
  ]
  await show(page, p)
  await expect(perkBtn(page)).toHaveCount(2)
  await perkBtn(page).nth(1).click()
  await expect(pop(page).locator('.hero-perk-note')).toContainText(
    'half strength'
  )
  await pop(page).getByRole('button', { name: 'OK' }).click()
  await perkBtn(page).nth(0).click()
  await expect(pop(page).locator('.hero-perk-note')).toHaveCount(0)
})
