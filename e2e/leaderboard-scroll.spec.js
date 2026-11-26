import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// The real Leaderboard sheet with a full 20-row page: every row is rendered
// (not just the first ~8 that fit), and a one-finger swipe scrolls the list.
const players = Array.from({ length: 30 }, (_, i) => ({
  rank: i + 1,
  userId: `u${i + 1}`,
  fullName: `Runner ${i + 1}`,
  nickname: `runner${i + 1}`,
  profilePictureUrl: null,
  areaSqMeters: 90000 - i * 1000,
}))

test('leaderboard shows the whole page and scrolls with a swipe', async ({
  mockedPage: page,
  context,
  browserName,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  // Active sponsor partners make the banner carousel auto-rotate every 5s.
  await page.route('**/v1/partner/current', (route) =>
    route.fulfill(
      ok([
        { id: 'p1', name: 'Partner One', active: true },
        { id: 'p2', name: 'Partner Two', active: true },
      ])
    )
  )
  await page.route('**/v1/leaderboard/individual/find', async (route) => {
    const { pageNumber = 1, noOfRecords = 20 } = route.request().postDataJSON()
    const from = (pageNumber - 1) * noOfRecords
    return route.fulfill(
      ok({
        content: players.slice(from, from + noOfRecords),
        totalPages: Math.ceil(players.length / noOfRecords),
        totalElements: players.length,
      })
    )
  })
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  await expect(page.locator('.lb-row').first()).toBeVisible()

  // 20 rows requested and rendered (podium covers 3 more cards, same rows).
  const info = await page.evaluate(() => {
    const p = document.querySelector('.lb-panel')
    const cs = getComputedStyle(p)
    return {
      rows: document.querySelectorAll('.lb-row').length,
      overflowY: cs.overflowY,
      scrollable: p.scrollHeight - p.clientHeight,
    }
  })
  expect(info.rows).toBeGreaterThan(8)
  expect(info.overflowY).toBe('auto')
  expect(info.scrollable).toBeGreaterThan(100)

  // One-finger swipe up (CDP touch, Chromium) / wheel (WebKit, which has no
  // touch injection) must move the list.
  const box = await page.locator('.lb-panel').boundingBox()
  const x = box.x + box.width / 2
  const y0 = box.y + box.height * 0.8
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page)
    const touch = (type, y) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      })
    await touch('touchStart', y0)
    for (let i = 1; i <= 10; i++) await touch('touchMove', y0 - i * 25)
    await touch('touchEnd', y0)
  } else {
    await page.mouse.move(x, y0)
    await page.mouse.wheel(0, 300)
  }
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('.lb-panel').scrollTop)
    )
    .toBeGreaterThan(50)

  // The banner carousel rotating (every 5s) must NOT drag the list back up.
  const before = await page.evaluate(
    () => document.querySelector('.lb-panel').scrollTop
  )
  await page.waitForTimeout(6500)
  const after = await page.evaluate(
    () => document.querySelector('.lb-panel').scrollTop
  )
  expect(after).toBeGreaterThanOrEqual(before - 2)
})
