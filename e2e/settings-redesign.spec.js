import {
  test,
  expect,
  seedSession,
  expectNoHorizontalScroll,
} from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Settings redesign: grouped cards, real Music / Sound sliders (saved
// immediately, restored on launch, live while dragging), the switches' On/Off
// text, a fixed header with the cards scrolling underneath, and a confirmed
// Log out. Screenshots (6 in total) go to the scratchpad folder named by
// SETTINGS_SHOTS.
const SHOTS = process.env.SETTINGS_SHOTS || ''
const SMALL = { width: 360, height: 640 }
const BIG = { width: 390, height: 844 }
const MUSIC_KEY = 'fahhkit_territory_music_volume'
const SFX_KEY = 'fahhkit_territory_sfx_volume'

const shot = (page, name) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve()

async function openSettings(page, context, vp, stored = {}) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.setViewportSize(vp)
  await page.addInitScript((kv) => {
    for (const [k, v] of Object.entries(kv)) {
      if (localStorage.getItem(k) == null) localStorage.setItem(k, v)
    }
  }, stored)
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page
    .getByText('Not now')
    .click({ timeout: 2500 })
    .catch(() => {})
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByTestId('settings-sound')).toBeVisible()
  // The sheet springs up from the bottom: measure only once it has landed.
  await expect
    .poll(async () => (await page.locator('.game-menu-sheet').boundingBox()).y)
    .toBe(0)
  await page.waitForTimeout(300)
}

// Drag the slider's thumb to `pct` and (optionally) hold it there.
async function dragTo(page, name, pct, { release = true } = {}) {
  const slider = page.getByRole('slider', { name, exact: true })
  const rail = slider.locator('.vs-rail')
  const box = await rail.boundingBox()
  const y = box.y + box.height / 2
  const from = await slider.locator('.vs-thumb').boundingBox()
  await page.mouse.move(from.x + from.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + (box.width * pct) / 100, y, { steps: 8 })
  if (release) await page.mouse.up()
  return slider
}

test.beforeEach(async ({ browserName }, testInfo) => {
  void browserName
  test.skip(testInfo.project.name !== 'mobile-390', 'sets its own viewports')
  test.setTimeout(150_000)
})

test('390x844: grouped cards in order, header fixed while the cards scroll, nothing overflows', async ({
  mockedPage: page,
  context,
}) => {
  await openSettings(page, context, BIG)
  const titles = await page.locator('.set-card-title').allTextContents()
  expect(titles).toEqual([
    'Sound',
    'Notifications',
    'Map',
    'Privacy',
    'Account',
    'Help',
    'About',
  ])
  await shot(page, '01-settings-top-390')

  // Every direct row is a 56px+ target; switches say On/Off in words.
  const heights = await page
    .locator('.set-card .game-settings-row')
    .evaluateAll((els) =>
      els
        .filter((e) => e.offsetParent)
        .map((e) => e.getBoundingClientRect().height)
    )
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(55.5)
  await expect(
    page.getByTestId('visibility-switch').locator('.set-switch-text')
  ).toHaveText(/^(On|Off)$/)

  // Scroll the cards: the close X and the section picker do not move.
  const close = page.locator('.game-menu-close')
  const before = await close.boundingBox()
  await page.locator('.game-menu-settings').evaluate((el) => {
    el.scrollTop = el.scrollHeight * 0.45
  })
  await page.waitForTimeout(150)
  const after = await close.boundingBox()
  expect(after.y).toBeCloseTo(before.y, 0)
  expect(
    await page.locator('.game-menu-settings').evaluate((el) => el.scrollTop)
  ).toBeGreaterThan(50)
  // The sheet itself never scrolled (only the cards do).
  expect(
    await page.locator('.game-menu-sheet').evaluate((el) => el.scrollTop)
  ).toBe(0)
  await shot(page, '02-settings-scrolled-390')

  // The long email never pushes the card wider than the screen.
  await page.locator('.game-menu-settings').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const fits = await page.locator('.set-card').evaluateAll((cards) =>
    cards.every((c) => {
      const r = c.getBoundingClientRect()
      return (
        r.left >= 0 &&
        r.right <= window.innerWidth &&
        [...c.querySelectorAll('*:not(wbr)')].every(
          (n) => n.getBoundingClientRect().right <= r.right + 1
        )
      )
    })
  )
  expect(fits).toBe(true)
  await expectNoHorizontalScroll(page)
})

test('sliders: drag is live with a % bubble, saved immediately, restored after a reload', async ({
  mockedPage: page,
  context,
}) => {
  await openSettings(page, context, BIG)
  const music = page.getByRole('slider', { name: 'Music', exact: true })
  await expect(music).toHaveAttribute('aria-valuenow', '35')

  // Held mid-drag: the bubble shows the level and the value already moved.
  await dragTo(page, 'Music', 70, { release: false })
  await expect(music.locator('.vs-bubble')).toBeVisible()
  const live = Number(await music.getAttribute('aria-valuenow'))
  expect(live).toBeGreaterThanOrEqual(68)
  expect(live).toBeLessThanOrEqual(72)
  await expect(music.locator('.vs-bubble')).toHaveText(`${live}%`)
  // Saved while dragging, not only on release.
  expect(
    Number(await page.evaluate((k) => localStorage.getItem(k), MUSIC_KEY))
  ).toBe(live)
  await shot(page, '03-slider-dragging-390')
  await page.mouse.up()
  await expect(music.locator('.vs-bubble')).toHaveCount(0)

  // Tap on the track jumps; the % number on the right follows.
  const rail = await music.locator('.vs-rail').boundingBox()
  await page.mouse.click(rail.x + rail.width * 0.2, rail.y + rail.height / 2)
  await expect(music).toHaveAttribute('aria-valuenow', /^(19|20|21)$/)

  // Keyboard.
  await music.focus()
  await page.keyboard.press('Home')
  await expect(music).toHaveAttribute('aria-valuenow', '0')
  await page.keyboard.press('End')
  await expect(music).toHaveAttribute('aria-valuenow', '100')
  await page.keyboard.press('PageDown')
  await expect(music).toHaveAttribute('aria-valuenow', '90')

  await dragTo(page, 'Sound effects', 40)
  const sfx = Number(
    await page.evaluate((k) => localStorage.getItem(k), SFX_KEY)
  )
  expect(sfx).toBeGreaterThanOrEqual(38)
  expect(sfx).toBeLessThanOrEqual(42)

  // Restored on launch.
  await page.reload()
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page
    .getByText('Not now')
    .click({ timeout: 2500 })
    .catch(() => {})
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(
    page.getByRole('slider', { name: 'Music', exact: true })
  ).toHaveAttribute('aria-valuenow', '90')
  await expect(
    page.getByRole('slider', { name: 'Sound effects', exact: true })
  ).toHaveAttribute('aria-valuenow', String(sfx))
})

test('muting: the speaker remembers the level, the icon follows it, music pauses at 0', async ({
  mockedPage: page,
  context,
}) => {
  await openSettings(page, context, BIG, { [MUSIC_KEY]: '60' })
  const music = page.getByRole('slider', { name: 'Music', exact: true })
  const row = page.locator('.vs[data-testid="slider-music"]')
  await expect(music).toHaveAttribute('aria-valuenow', '60')
  await expect(row).toHaveAttribute('data-level', 'high')

  await page.getByRole('button', { name: 'Mute Music' }).click()
  await expect(music).toHaveAttribute('aria-valuenow', '0')
  await expect(row).toHaveAttribute('data-level', 'muted')
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('audio[src*="territory-theme"]').paused
      )
    )
    .toBe(true)
  await shot(page, '04-muted-390')

  await page.getByRole('button', { name: 'Unmute Music' }).click()
  await expect(music).toHaveAttribute('aria-valuenow', '60')

  await dragTo(page, 'Music', 25)
  await expect(row).toHaveAttribute('data-level', 'low')
})

test('360x640: top and bottom (Account / Help / About) fit without overflow', async ({
  mockedPage: page,
  context,
}) => {
  await openSettings(page, context, SMALL)
  await expectNoHorizontalScroll(page)
  await shot(page, '05-settings-top-360')
  await page.getByTestId('settings-about').scrollIntoViewIfNeeded()
  await page.locator('.game-menu-settings').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(page.getByTestId('app-version')).toBeVisible()
  await expectNoHorizontalScroll(page)
  await shot(page, '06-settings-bottom-360')
})

test('Log out asks for confirmation first; Stay keeps you signed in', async ({
  mockedPage: page,
  context,
}) => {
  await openSettings(page, context, BIG)
  await page.getByTestId('logout-btn').scrollIntoViewIfNeeded()
  await page.getByTestId('logout-btn').click()
  const dialog = page.getByRole('dialog', { name: 'Log out?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Stay' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('settings-account')).toBeVisible()
})
