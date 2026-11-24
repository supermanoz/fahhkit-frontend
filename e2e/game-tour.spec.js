import {
  test,
  expect,
  seedSession,
  expectNoHorizontalScroll,
} from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// First-time walkthrough ("coach marks"): a brand-new player gets the 7 steps
// once the intro is over and the screen is clear; an existing player never
// does; Skip is remembered per account; Settings > How to play replays it.
// Screenshots (8 in total) go to the scratchpad folder named by TOUR_SHOTS.
const SHOTS = process.env.TOUR_SHOTS || ''
const today = new Date().toISOString().slice(0, 10)
const ROOKIE = {
  ...VETERAN,
  id: 'user-rookie',
  user: { ...VETERAN.user, id: 'user-rookie', joinedDate: today },
  territoryProfile: {
    ...VETERAN.territoryProfile,
    userId: 'user-rookie',
    level: 1,
    xp: 0,
    parcelCount: 0,
    totalAreaSqMeters: 0,
    fahhcoinBalance: 0,
    clubName: null,
    clubRole: null,
  },
}
const SMALL = { width: 360, height: 640 }
const BIG = { width: 390, height: 844 }
const STEP_IDS = ['welcome', 'hero', 'play', 'mail', 'shop', 'me', 'done']

async function boot(page, context, persona, vp, overrides = {}) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, persona)
  await page.setViewportSize(vp)
  await page.route('**/v1/user/find/logged-in', (r) =>
    r.fulfill(ok(persona.user))
  )
  await page.route('**/v1/territory/profile', (r) =>
    r.fulfill(ok(persona.territoryProfile))
  )
  for (const [path, body] of Object.entries(overrides)) {
    await page.route(path, (r) => r.fulfill(ok(body)))
  }
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
}

const tour = (page) => page.getByTestId('game-tour')
const shot = (page, name) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve()

// Everything the brief demands of a step's geometry, measured in the page.
async function checkStep(page, id, vp) {
  await expect(tour(page)).toHaveAttribute('data-step', id)
  // The card has been placed (hidden until measured) and the spotlight, if
  // the step has a target, has found it.
  const card = page.locator('.game-tour-card')
  await expect(card).toBeVisible()
  if (!['welcome', 'done'].includes(id)) {
    await expect(page.locator('.game-tour-spot')).toBeVisible()
  }
  await expect
    .poll(async () => (await card.boundingBox())?.height ?? 0)
    .toBeGreaterThan(100)
  // Settle the springs/arrow before measuring.
  await expect
    .poll(async () => {
      const a = await card.boundingBox()
      await page.waitForTimeout(150)
      const b = await card.boundingBox()
      return JSON.stringify(a) === JSON.stringify(b)
    })
    .toBe(true)
  const m = await page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return { x: b.left, y: b.top, w: b.width, h: b.height }
    }
    const card = r(document.querySelector('.game-tour-card'))
    const spotEl = document.querySelector('.game-tour-spot')
    const spot = spotEl ? r(spotEl) : null
    const dots = document.querySelectorAll('.game-tour-dots i').length
    const panel = document.querySelector('.game-tour-panel')
    const clipped = panel.scrollHeight - panel.clientHeight
    const btns = [
      ...document.querySelectorAll('.game-tour button, .game-tour .gbtn'),
    ].map((b) => ({ t: b.textContent.trim(), ...r(b) }))
    // Tapping where the target is must hit the tour, not the game.
    let blocked = null
    if (spot) {
      const hit = document.elementFromPoint(
        spot.x + spot.w / 2,
        spot.y + spot.h / 2
      )
      blocked = Boolean(hit?.closest('.game-tour'))
    }
    return {
      card,
      spot,
      dots,
      clipped,
      btns,
      blocked,
      vw: innerWidth,
      vh: innerHeight,
      bodyFont: document.querySelector('.game-tour-body')
        ? getComputedStyle(document.querySelector('.game-tour-body')).fontFamily
        : 'x',
      bodySize: document.querySelector('.game-tour-body')
        ? parseFloat(
            getComputedStyle(document.querySelector('.game-tour-body')).fontSize
          )
        : 0,
    }
  })
  expect(m.dots, 'step dots').toBe(7)
  expect(m.clipped, `${id}: card content is cut off`).toBeLessThanOrEqual(1)
  // Never off-screen.
  expect(m.card.x).toBeGreaterThanOrEqual(0)
  expect(m.card.y).toBeGreaterThanOrEqual(0)
  expect(m.card.x + m.card.w).toBeLessThanOrEqual(vp.width + 0.5)
  expect(m.card.y + m.card.h).toBeLessThanOrEqual(vp.height + 0.5)
  if (m.spot) {
    // The card never covers the thing it points at.
    const overlap =
      m.card.x < m.spot.x + m.spot.w &&
      m.card.x + m.card.w > m.spot.x &&
      m.card.y < m.spot.y + m.spot.h &&
      m.card.y + m.card.h > m.spot.y
    expect(overlap, `card covers the ${id} target`).toBe(false)
    expect(m.spot.x).toBeGreaterThanOrEqual(0)
    expect(m.spot.x + m.spot.w).toBeLessThanOrEqual(vp.width)
    expect(m.blocked, 'target must not be tappable during the tour').toBe(true)
  }
  // 44px+ tap targets, readable body font (not the display face).
  for (const b of m.btns) {
    expect(b.h, `${b.t} height`).toBeGreaterThanOrEqual(44)
    expect(b.w, `${b.t} width`).toBeGreaterThanOrEqual(44)
  }
  if (m.bodySize) expect(m.bodySize).toBeGreaterThanOrEqual(16)
  expect(m.bodyFont.toLowerCase()).not.toContain('lilita')
  await expectNoHorizontalScroll(page)
  return m
}

test.beforeEach(async ({ browserName }, testInfo) => {
  void browserName
  test.skip(testInfo.project.name !== 'mobile-390', 'sets its own viewports')
  test.setTimeout(150_000)
})

test('a new player: all 7 steps at 360x640, in order, nothing off-screen', async ({
  mockedPage: page,
  context,
}) => {
  await boot(page, context, ROOKIE, SMALL)
  // Nothing has been tapped: it shows up by itself after the intro.
  await expect(tour(page)).toBeVisible({ timeout: 70_000 })
  for (let i = 0; i < STEP_IDS.length; i++) {
    await checkStep(page, STEP_IDS[i], SMALL)
    // 1, 3, 5, 7 of the 8 screenshots.
    if ([0, 2, 4, 6].includes(i))
      await shot(page, `360-step${i + 1}-${STEP_IDS[i]}`)
    if (i === 0) {
      await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
      await expect(page.locator('.game-tour-speaker')).toBeVisible()
    }
    if (i === 2) {
      // Three mode cards, one line each.
      await expect(page.locator('.game-tour-mode')).toHaveCount(3)
      await expect(page.locator('.game-tour-modes')).toContainText(
        'Needs Visibility on'
      )
    }
    if (i < STEP_IDS.length - 1) {
      await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()
      await page.getByRole('button', { name: 'Next', exact: true }).click()
    }
  }
  await expect(
    page.getByRole('button', { name: 'Start Training' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Explore on my own' })
  ).toBeVisible()
  // Finishing remembers it for this account only.
  await page.getByRole('button', { name: 'Explore on my own' }).click()
  await expect(tour(page)).toHaveCount(0)
  await expect(page.locator('.game-radial-item')).toHaveCount(0)
  expect(
    await page.evaluate(() => localStorage.getItem('tour_v1_user-rookie'))
  ).not.toBeNull()
})

test('390x844: steps, Back, Settings > How to play replays it', async ({
  mockedPage: page,
  context,
}) => {
  await boot(page, context, ROOKIE, BIG)
  await expect(tour(page)).toBeVisible({ timeout: 70_000 })
  await checkStep(page, 'welcome', BIG)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await checkStep(page, 'hero', BIG)
  await shot(page, '390-step2-hero')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await checkStep(page, 'play', BIG)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await checkStep(page, 'mail', BIG)
  await shot(page, '390-step4-mail')
  // Back returns to the previous step (and the menu follows it).
  await page.getByRole('button', { name: 'Back' }).click()
  await checkStep(page, 'play', BIG)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await checkStep(page, 'shop', BIG)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await checkStep(page, 'me', BIG)
  await shot(page, '390-step6-me')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await checkStep(page, 'done', BIG)
  // Skip (via the link) ends it from anywhere.
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(tour(page)).toHaveCount(0)

  // Settings > How to play.
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const row = page.getByTestId('how-to-play')
  await row.scrollIntoViewIfNeeded()
  await expect(row).toContainText('How to play')
  await shot(page, '390-settings-how-to-play')
  await row.click()
  await expect(tour(page)).toBeVisible({ timeout: 15_000 })
  await checkStep(page, 'welcome', BIG)
})

test('an existing player does NOT see the tour', async ({
  mockedPage: page,
  context,
}) => {
  await boot(page, context, VETERAN, BIG)
  // The tour waits ~2.5 s of a clear screen before it would appear; look well
  // past that. (A negative can only be proven by waiting - no event to await.)
  await page.waitForTimeout(6000)
  await expect(tour(page)).toHaveCount(0)
  expect(
    await page.evaluate(() => localStorage.getItem('tour_v1_user-veteran'))
  ).toBeNull()
  // ...but they can still replay it from Settings.
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('how-to-play').click()
  await expect(tour(page)).toBeVisible({ timeout: 15_000 })
})

test('tapping the dimmed map does nothing; Skip is remembered across a reload', async ({
  mockedPage: page,
  context,
}) => {
  await boot(page, context, ROOKIE, BIG)
  await expect(tour(page)).toBeVisible({ timeout: 70_000 })
  // Tap the map corner and the HUD: the tour stays on step 1, nothing opens.
  await page.mouse.click(30, 300)
  await page.mouse.click(BIG.width / 2, 60)
  await expect(tour(page)).toHaveAttribute('data-step', 'welcome')
  await expect(page.locator('.game-menu-sheet')).toHaveCount(0)
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(tour(page)).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.waitForTimeout(5000) // past the settle gap: it must not return
  await expect(tour(page)).toHaveCount(0)
})
