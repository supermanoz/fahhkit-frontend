import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Screenshots of the broadcast popup with mocked pending notices. Run with
// BEFORE=1 against the old popup to capture the "before" set.
const DIR = 'screenshots/broadcast-popup'
const BEFORE = process.env.BEFORE === '1'
const LONG = Array.from(
  { length: 14 },
  (_, i) =>
    `Paragraph ${i + 1}: new territory, new rewards and a brand new season. Details at https://runconquest.example/season-2 - lace up and claim your streets!`
).join('\n\n')
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a4fe0"/><stop offset="1" stop-color="#ff7a3d"/></linearGradient></defs><rect width="600" height="300" fill="url(#g)"/><text x="300" y="170" font-size="54" text-anchor="middle" fill="#fff" font-family="sans-serif">SEASON 2</text></svg>'

const base = (id, extra) => ({
  id,
  type: 'IMPORTANT_NOTICE',
  publishedAt: '2026-11-12T09:00:00Z',
  readAt: null,
  ...extra,
})
const SCENARIOS = {
  '01-short-message': [
    base(1, {
      title: 'Season 2 starts Friday!',
      body: 'New territory, new rewards. Lace up and claim your streets.',
    }),
  ],
  '02-long-message-scroll': [
    base(2, {
      title:
        'Everything you need to know about the very long Season 2 launch weekend',
      body: LONG,
    }),
  ],
  '03-with-image-and-link': [
    base(3, {
      title: 'Weekend double-XP',
      body: 'Run any distance this weekend for double XP. Read more at https://runconquest.example/xp now.',
      imageUrl: 'https://img.test/banner.svg',
      linkUrl: 'https://runconquest.example/xp',
    }),
  ],
  '04-multiple': [
    base(4, {
      title: 'Season 2 starts Friday!',
      body: 'Lace up and claim your streets.',
    }),
    base(5, { title: 'Weekend double-XP', body: 'Double XP all weekend.' }),
    base(6, { title: 'Maintenance tonight', body: 'Short downtime at 2am.' }),
  ],
  '05-mid-animation': [
    base(7, {
      title: 'Season 2 starts Friday!',
      body: 'Lace up and claim your streets.',
    }),
  ],
  '06-no-title': [
    base(8, { title: '', body: 'A message with no title at all.' }),
  ],
}

const shown = []

async function open(page, context, notices) {
  shown.length = 0
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  // Hold the notices back until the game's loading overlay is gone, so the
  // popup is captured on top of the map (and its pop-in is actually seen).
  let release
  const gate = new Promise((res) => (release = res))
  await page.route('**/v1/mail/broadcast/notices/pending', async (r) => {
    await gate
    return r.fulfill(ok(notices))
  })
  await page.route('**/v1/mail/broadcast/*/notice-shown', (r) => {
    shown.push(/broadcast\/(\d+)\//.exec(r.request().url())[1])
    return r.fulfill(ok({}))
  })
  await page.route('https://img.test/banner.svg', (r) =>
    r.fulfill({ contentType: 'image/svg+xml', body: SVG })
  )
  await page.goto('/game')
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  release()
  const dialog = page.locator('[role="alertdialog"]')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  return dialog
}

for (const [name, notices] of Object.entries(SCENARIOS)) {
  if (BEFORE && !['01-short-message', '03-with-image-and-link'].includes(name))
    continue
  test(name, async ({ mockedPage: page, context }, testInfo) => {
    const dialog = await open(page, context, notices)
    const project = testInfo.project.name
    if (name === '05-mid-animation') {
      // Freeze every running animation ~180ms in.
      await page.evaluate(() => {
        for (const a of document.getAnimations()) {
          a.pause()
          a.currentTime = 180
        }
      })
    } else {
      await page.waitForTimeout(1800)
    }
    if (!BEFORE) {
      const box = await dialog.boundingBox()
      const vp = page.viewportSize()
      if (name !== '05-mid-animation') {
        // Centered exactly and inside the viewport.
        expect(
          Math.abs(box.x + box.width / 2 - vp.width / 2)
        ).toBeLessThanOrEqual(1)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
        expect(box.width).toBeLessThanOrEqual(381)
      }
    }
    const prefix = BEFORE ? 'before-' : ''
    await page.screenshot({ path: `${DIR}/${prefix}${name}-${project}.png` })
  })
}

test('multiple: Got it dismisses the shown one, arrows only page', async ({
  mockedPage: page,
  context,
}) => {
  test.skip(BEFORE)
  const dialog = await open(page, context, SCENARIOS['04-multiple'])
  await expect(dialog).toContainText('1/3')
  await dialog.getByRole('button', { name: 'Next broadcast' }).click()
  await expect(dialog).toContainText('2/3')
  expect(shown).toEqual([])
  await dialog.getByRole('button', { name: 'Got it' }).click()
  await expect(dialog).toContainText('2/2')
  expect(shown).toEqual(['5'])
  await dialog.getByRole('button', { name: 'Got it' }).click()
  await dialog.getByRole('button', { name: 'Got it' }).click()
  await expect(dialog).toBeHidden()
  expect(shown.sort()).toEqual(['4', '5', '6'])
})
