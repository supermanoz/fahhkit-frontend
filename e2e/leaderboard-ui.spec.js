import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Leaderboard redesign: header clear of the X, one purple selection style,
// podium + clean rows, "You" + pinned rank bar, states, banner pill/dots.
// Behaviour (tabs, data, taps) is unchanged - only how it looks.
const NAMES = [
  'Aarav',
  'Binita',
  'Chandra',
  'Deepa',
  'Elina Longname Sharma',
  'Farhan',
  'Gita',
  'Hari',
]
const people = (n, meAt = -1) =>
  Array.from({ length: n }, (_, i) => ({
    userId: i === meAt ? 'user-veteran' : `u${i}`,
    rank: i + 1,
    nickname: i === meAt ? 'Veteran' : NAMES[i % 8] + (i > 7 ? i : ''),
    areaSqMeters: Math.round(3_400_000 / (i + 1.5)),
    cityName: 'Kathmandu',
  }))
const clubs = (n) =>
  Array.from({ length: n }, (_, i) => ({
    clubId: `c${i}`,
    rank: i + 1,
    clubName: ['Himal Runners', 'Valley Crew', 'Peak Pace', 'Lazimpat Legs'][
      i % 4
    ],
    trophies: 900 - i * 120,
  }))

async function open(
  page,
  context,
  {
    players = people(14, 9),
    clubList = clubs(4),
    w = 390,
    h = 844,
    leaderboard,
  } = {}
) {
  await page.setViewportSize({ width: w, height: h })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.route(
    '**/v1/leaderboard/individual/find',
    leaderboard ||
      ((r) =>
        r.fulfill(ok({ content: players, totalElements: players.length })))
  )
  await page.route('**/v1/leaderboard/club/find', (r) =>
    r.fulfill(ok({ content: clubList, totalElements: clubList.length }))
  )
  await page.goto('/game')
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
}

// In the page: every text element inside `root` with colour, first opaque
// background up the tree, contrast ratio, stroke and shadow.
function audit(rootSel) {
  const lum = (c) => {
    const f = (v) =>
      (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number)
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c.length === 3 || (c.length === 4 && c[3] >= 0.99)) return c
      if (c.length === 4 && c[3] > 0) {
        // translucent tint over the card: blend over white
        const a = c[3]
        return [0, 1, 2].map((i) => c[i] * a + 255 * (1 - a))
      }
    }
    return [255, 255, 255]
  }
  const out = []
  for (const el of document.querySelector(rootSel).querySelectorAll('*')) {
    if (el.closest('svg')) continue
    if (
      ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    )
      continue
    const cs = getComputedStyle(el)
    const [a, b] = [lum(parse(cs.color)), lum(bgOf(el))].sort((x, y) => y - x)
    out.push({
      text: el.textContent.trim().slice(0, 24),
      ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100,
      stroke: cs.webkitTextStrokeWidth,
      shadow: cs.textShadow,
      cls: String(el.className),
    })
  }
  return out
}

test.beforeEach(async ({ browserName }, testInfo) => {
  void browserName
  test.skip(
    testInfo.project.name !== 'mobile-390',
    'harness sets its own viewports'
  )
  test.setTimeout(120_000)
})

for (const [w, h] of [
  [390, 844],
  [360, 640],
]) {
  test(`header: the X never covers the dropdown arrow (${w}x${h})`, async ({
    mockedPage: page,
    context,
  }) => {
    await open(page, context, { w, h })
    await expect(page.locator('.lb')).toBeVisible()
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect()
      const x = box('.game-menu-close')
      const knob = box('.game-menu-picker-knob')
      const cur = box('.game-menu-picker-current')
      return {
        x: [x.left, x.top, x.right, x.bottom],
        knob: [knob.left, knob.top, knob.right, knob.bottom],
        cur: [cur.left, cur.right],
        w: x.width,
        h: x.height,
        vw: innerWidth,
      }
    })
    const overlap = !(
      r.knob[2] <= r.x[0] ||
      r.knob[0] >= r.x[2] ||
      r.knob[3] <= r.x[1] ||
      r.knob[1] >= r.x[3]
    )
    expect(overlap, JSON.stringify(r)).toBe(false)
    expect(r.x[0] - r.knob[2]).toBeGreaterThanOrEqual(8) // breathing room
    expect(r.x[2]).toBeLessThanOrEqual(r.vw)
    expect(r.w).toBeGreaterThanOrEqual(44)
    expect(r.h).toBeGreaterThanOrEqual(44)
    // The dropdown still works and the whole bar is its tap target.
    await page.locator('.game-menu-picker-current').click()
    await expect(page.locator('.game-menu-picker-list')).toBeVisible()
    await page
      .locator('.game-menu-picker-scrim')
      .click({ position: { x: 5, y: 400 } })
  })
}

test('selectors: Players|Clubs and Global|District share one purple selection style', async ({
  mockedPage: page,
  context,
}) => {
  await open(page, context)
  const modes = page.locator('.lb-mode-tabs .g-tab')
  const scopes = page.locator('.lb-scope-tabs .g-tab')
  await expect(modes).toHaveText(['Players', 'Clubs'])
  await expect(scopes).toHaveText(['Global', 'District'])
  const purple = 'rgb(190, 46, 214)'
  for (const row of [modes, scopes]) {
    await expect(row.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(row.nth(0)).toHaveCSS('background-color', purple)
    await expect(row.nth(0)).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(row.nth(1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(row.nth(1)).toHaveCSS('color', 'rgb(43, 42, 36)')
    for (const t of await row.all()) {
      await expect(t).toHaveCSS('-webkit-text-stroke-width', '0px')
      await expect(t).toHaveCSS('text-shadow', 'none')
    }
  }
  // Primary row is the bigger one; both rows are 40px+ tap targets.
  expect((await modes.first().boundingBox()).height).toBeGreaterThanOrEqual(44)
  expect((await scopes.first().boundingBox()).height).toBeGreaterThanOrEqual(40)
  // Same behaviour: tabs switch the board; District shows its notice.
  await scopes.nth(1).click()
  await expect(scopes.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.game-leaderboard-notice')).toContainText('only')
  await page.getByRole('tab', { name: 'Top Clubs' }).click()
  await expect(modes.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.lb-podium-spot').first()).toContainText(
    /Valley|Himal|Peak/
  )
  await expect(page.locator('.lb-scope-tabs .g-tab').nth(1)).toHaveText(
    'Country'
  )
})

test('podium: 2 · 1 · 3 with avatars, silver/bronze medals, the TOP 1 crest; rows 48px+', async ({
  mockedPage: page,
  context,
}) => {
  await open(page, context, { players: people(14, 9) })
  const spots = page.locator('.lb-podium-spot')
  await expect(spots).toHaveCount(3)
  await expect(spots.nth(0)).toHaveClass(/place-2/)
  await expect(spots.nth(1)).toHaveClass(/place-1/)
  await expect(spots.nth(2)).toHaveClass(/place-3/)
  await expect(spots.nth(1).locator('.rank-badge')).toBeVisible() // existing TOP 1 art
  await expect(spots.nth(0).locator('.lb-medal-2')).toBeVisible()
  await expect(spots.nth(2).locator('.lb-medal-3')).toBeVisible()
  for (const s of await spots.all()) {
    await expect(s.locator('.lb-avatar')).toBeVisible()
    await expect(s.locator('.lb-podium-name')).toBeVisible()
    await expect(s.locator('.lb-trophy-stat')).toContainText('km²')
  }
  // Rank 1 is the largest.
  const [b1, b2, b3] = await Promise.all(
    [1, 0, 2].map((i) => spots.nth(i).boundingBox())
  )
  expect(b1.height).toBeGreaterThan(b2.height)
  expect(b1.width).toBeGreaterThan(b2.width)
  expect(Math.abs(b2.width - b3.width)).toBeLessThan(2)
  // Rows 4+: rank, avatar, name, area; 48px+ tall.
  const rows = page.locator('.lb-list .lb-row')
  await expect(rows).toHaveCount(11)
  for (const r of (await rows.all()).slice(0, 4)) {
    expect((await r.boundingBox()).height).toBeGreaterThanOrEqual(48)
  }
  await expect(rows.first().locator('.lb-col-rank')).toHaveText('4')
  // Gold/silver/bronze only on ranks 1-3: list rows carry none of them.
  const tinted = await page.evaluate(() =>
    [...document.querySelectorAll('.lb-list .lb-row:not(.is-player)')].some(
      (r) =>
        /242, 193, 78|170, 178, 189|205, 138, 75/.test(
          getComputedStyle(r).backgroundColor
        )
    )
  )
  expect(tinted).toBe(false)
})

test('"You": purple row + chip; a sticky "Your rank" bar appears when your row scrolls away', async ({
  mockedPage: page,
  context,
}) => {
  // Player is rank 14 of 14, off-screen at first.
  await open(page, context, { players: people(14, 13), h: 640, w: 360 })
  const me = page.locator('.lb-list .lb-row.is-player')
  await expect(me).toHaveCount(1)
  await expect(me.locator('.lb-you-tag')).toHaveText('You')
  await expect(me).toHaveCSS('background-color', 'rgb(246, 230, 250)')
  await expect(page.getByTestId('lb-pinned-you')).toBeVisible()
  await page.waitForTimeout(1200) // the menu sheet finishes sliding in
  const bar = await page.getByTestId('lb-pinned-you').boundingBox()
  const vh = 640
  expect(bar.y + bar.height).toBeLessThanOrEqual(vh - 8)
  await expect(page.getByTestId('lb-pinned-you')).toContainText('Your rank')
  await expect(page.getByTestId('lb-pinned-you')).toContainText('Veteran')
  await expect(page.getByTestId('lb-pinned-you')).toContainText('14')
  // The bar tracks the safe area: pad the sheet's bottom like a home
  // indicator would and the bar stays above it.
  await page.addStyleTag({
    content: '.game-menu-sheet{padding-bottom:calc(24px + 34px) !important}',
  })
  await page.waitForTimeout(200)
  const bar2 = await page.getByTestId('lb-pinned-you').boundingBox()
  expect(bar2.y + bar2.height).toBeLessThanOrEqual(vh - 34)
  // Scroll to the real row: the bar goes away (it would be a duplicate).
  await me.scrollIntoViewIfNeeded()
  await page.evaluate(() =>
    document.querySelector('.game-menu-sheet').scrollTo(0, 99999)
  )
  await expect(page.getByTestId('lb-pinned-you')).toHaveCount(0)
  // A player outside the loaded list: no bar, nothing invented.
})

test('no "You" in the data -> no pinned bar', async ({
  mockedPage: page,
  context,
}) => {
  await open(page, context, { players: people(14, -1) })
  await expect(page.locator('.lb-podium-spot')).toHaveCount(3)
  await expect(page.getByTestId('lb-pinned-you')).toHaveCount(0)
})

test('fewer than 3 entries: just the cards that exist, centred, no empty slots', async ({
  mockedPage: page,
  context,
}) => {
  await open(page, context, { players: people(1, -1) })
  await expect(page.locator('.lb-podium-spot')).toHaveCount(1)
  await expect(page.locator('.lb-list')).toHaveCount(0)
  const spot = await page.locator('.lb-podium-spot').boundingBox()
  const panel = await page.locator('.lb').boundingBox()
  expect(
    Math.abs(spot.x + spot.width / 2 - (panel.x + panel.width / 2))
  ).toBeLessThan(3)
  // No huge blank gap under a single card.
  const gap = await page.evaluate(() => {
    const lb = document.querySelector('.lb').getBoundingClientRect()
    const s = document.querySelector('.lb-podium-spot').getBoundingClientRect()
    return lb.bottom - s.bottom
  })
  expect(gap).toBeLessThan(12)
})

test('two entries: two cards, rank 1 first', async ({
  mockedPage: page,
  context,
}) => {
  await open(page, context, { players: people(2, -1) })
  const spots = page.locator('.lb-podium-spot')
  await expect(spots).toHaveCount(2)
  await expect(spots.nth(0)).toHaveClass(/place-1/)
  await expect(spots.nth(1)).toHaveClass(/place-2/)
})

test('clubs: emblem, name, trophies; same structure', async ({
  mockedPage: page,
  context,
}) => {
  await open(page, context, { clubList: clubs(6) })
  await page.getByRole('tab', { name: 'Top Clubs' }).click()
  const spots = page.locator('.lb-podium-spot')
  await expect(spots).toHaveCount(3)
  for (const s of await spots.all())
    await expect(s.locator('svg.club-badge')).toBeVisible()
  await expect(spots.nth(1).locator('.lb-trophy-stat')).toHaveText('900')
  await expect(page.locator('.lb-list .lb-row')).toHaveCount(3)
  await expect(
    page.locator('.lb-list .lb-row').first().locator('svg.club-badge')
  ).toBeVisible()
})

test('states: skeleton while loading, friendly empty, error with Retry', async ({
  mockedPage: page,
  context,
}) => {
  let mode = 'slow'
  let calls = 0
  await open(page, context, {
    leaderboard: async (r) => {
      calls++
      if (mode === 'slow') {
        await new Promise((res) => setTimeout(res, 1500))
        return r.fulfill(ok({ content: [], totalElements: 0 }))
      }
      if (mode === 'error')
        return r.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Server unavailable' }),
        })
      return r.fulfill(ok({ content: people(5, -1), totalElements: 5 }))
    },
  })
  page.allowFailedRequests = true
  await expect(page.getByTestId('lb-skeleton')).toBeVisible()
  await expect(page.locator('.lb-skeleton-row')).toHaveCount(4)
  await expect(page.locator('.lb-empty')).toContainText(
    'No runners here yet. Claim territory to get on the board.'
  )
  // Empty state sits inside the card, readable.
  const rows = await page.evaluate(audit, '.lb-empty')
  expect(rows.filter((r) => r.ratio < 4.5)).toEqual([])
  // Error + Retry: switch to Clubs and back to force a fresh individual load.
  mode = 'error'
  await page.getByRole('tab', { name: 'Top Clubs' }).click()
  await page.getByRole('tab', { name: 'Top Players' }).click()
  await expect(page.locator('.lb-error')).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry' })
  expect((await retry.boundingBox()).height).toBeGreaterThanOrEqual(44)
  const before = calls
  mode = 'ok'
  await retry.click()
  await expect(page.locator('.lb-podium-spot').first()).toBeVisible()
  expect(calls).toBeGreaterThan(before)
  await expect(page.locator('.lb-error')).toHaveCount(0)
})

for (const [w, h] of [
  [390, 844],
  [360, 640],
]) {
  test(`text is plain ink with AA contrast, no outlines, no overflow (${w}x${h})`, async ({
    mockedPage: page,
    context,
  }) => {
    await open(page, context, { w, h, players: people(14, 9) })
    await expect(page.locator('.lb-podium-spot')).toHaveCount(3)
    const rows = await page.evaluate(audit, '.lb')
    const bad = rows.filter((r) => r.ratio < 4.5)
    expect(bad, JSON.stringify(bad)).toEqual([])
    for (const r of rows) {
      expect(r.stroke, r.text).toBe('0px')
      expect(r.shadow, r.text).toBe('none')
    }
    // Tabular numbers on the stat.
    await expect(page.locator('.lb-trophy-stat').first()).toHaveCSS(
      'font-variant-numeric',
      /tabular-nums/
    )
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true)
    // Scrolls inside the sheet, nothing clipped horizontally.
    const clipped = await page.evaluate(
      () =>
        [...document.querySelectorAll('.lb *')].filter(
          (el) => el.getBoundingClientRect().right > innerWidth + 1
        ).length
    )
    expect(clipped).toBe(0)
    await page.evaluate(() =>
      document.querySelector('.game-menu-sheet').scrollTo(0, 99999)
    )
    const sheet = await page.evaluate(() => {
      const s = document.querySelector('.game-menu-sheet')
      return s.scrollTop > 100
    })
    expect(sheet).toBe(true)
  })
}

test('sponsor banner: View > pill bottom-right, dots in a dark pill, middle uncovered', async ({
  mockedPage: page,
  context,
}) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1983" height="793"><rect width="100%" height="100%" fill="#2d6a4f"/></svg>`
  await page.route('https://img.test/p1.svg', (r) =>
    r.fulfill({ contentType: 'image/svg+xml', body: svg })
  )
  await page.route('**/v1/partner/current', (r) =>
    r.fulfill(
      ok([
        {
          id: 'p1',
          name: 'Partner One',
          active: true,
          seasonNumber: 1,
          imageUrl: 'https://img.test/p1.svg',
          socialLink1: 'https://example.com/x',
        },
      ])
    )
  )
  await open(page, context, { w: 360, h: 640 })
  await page.locator('.sponsor-banner-dot').nth(1).click()
  await page.waitForTimeout(700)
  const m = await page.evaluate(() => {
    const li = [...document.querySelectorAll('.sponsor-banner-slide')][1]
    const card = li
      .querySelector('.sponsor-banner-card')
      .getBoundingClientRect()
    const v = li.querySelector('.sponsor-banner-view-btn')
    const vr = v.getBoundingClientRect()
    const d = document.querySelector('.sponsor-banner-dots')
    const dr = d.getBoundingClientRect()
    const mid = document.elementFromPoint(
      card.left + card.width / 2,
      card.top + card.height / 2
    )
    const tag = li
      .querySelector('.sponsor-banner-partner-tag')
      ?.getBoundingClientRect()
    const info = li
      .querySelector('.sponsor-banner-info-btn')
      .getBoundingClientRect()
    return {
      viewCx: (vr.left + vr.width / 2 - card.left) / card.width,
      viewBottomGap: card.bottom - vr.bottom,
      viewRightGap: card.right - vr.right,
      viewH: vr.height,
      text: v.textContent.replace(/\s+/g, ' ').trim(),
      dotsBg: getComputedStyle(d).backgroundColor,
      dotsCx: (dr.left + dr.width / 2 - card.left) / card.width,
      dotsOverlapView: !(dr.right <= vr.left || dr.left >= vr.right),
      midIsPill: Boolean(
        mid?.closest('.sponsor-banner-view-btn, .sponsor-banner-dots')
      ),
      tagTop: tag ? tag.top - card.top : null,
      tagLeft: tag ? tag.left - card.left : null,
      infoTop: info.top - card.top,
      infoW: info.width,
      cardW: card.width,
    }
  })
  expect(m.text).toMatch(/^View\s*>$/)
  expect(m.viewCx).toBeGreaterThan(0.7) // far right, not centred
  expect(m.viewBottomGap).toBeLessThan(16)
  expect(m.viewRightGap).toBeLessThan(16)
  expect(m.viewH).toBeLessThan(36) // small
  expect(m.dotsBg).toMatch(/rgba?\(20, 16, 44/)
  expect(Math.abs(m.dotsCx - 0.5)).toBeLessThan(0.03)
  expect(m.dotsOverlapView).toBe(false)
  expect(m.midIsPill).toBe(false)
  expect(m.tagTop).toBeLessThan(16) // "Season Partner" chip still top-left
  expect(m.tagLeft).toBeLessThan(16)
  expect(m.infoW).toBeGreaterThanOrEqual(44) // the "i" is still a 44px target
  // Behaviour unchanged: the card is still the link and still counts the click.
  await expect(
    page
      .locator('.sponsor-banner-slide')
      .nth(1)
      .locator('a.sponsor-banner-card')
  ).toHaveAttribute('href', 'https://example.com/x')
})
