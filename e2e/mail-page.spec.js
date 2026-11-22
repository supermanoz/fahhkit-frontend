import {
  test,
  expect,
  seedSession,
  expectNoHorizontalScroll,
} from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Mail page redesign: header clear of the X, shared segmented tabs with
// unread counts, message cards grouped by day, a detail popup with a green
// Claim, news cards with banners, and skeleton / empty / error states.
// Behaviour (read, claim, decline, delete, links) is unchanged. No screenshots.
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]
const NOW = Date.now()
const iso = (msAgo) => new Date(NOW - msAgo).toISOString()
const HOUR = 3600_000
const DAY = 24 * HOUR

const mail = (o) => ({
  senderId: null,
  senderName: null,
  recipientId: VETERAN.id,
  payload: null,
  attachment: null,
  readAt: null,
  resolvedAt: null,
  ...o,
})
const INBOX = [
  mail({
    id: 'm-gift',
    type: 'STORE_ITEM_GRANT',
    status: 'UNREAD',
    title: 'A gift for you',
    body: 'Thanks for running with us. Enjoy!',
    senderName: 'Run Conquest',
    createdDate: iso(2 * HOUR),
    attachment: {
      attachmentType: 'STORE_ITEM_GRANT',
      refId: 'item-x',
      claimed: false,
    },
  }),
  mail({
    id: 'm-invite',
    type: 'CLUB_INVITE',
    status: 'UNREAD',
    title: 'Join Himal Runners',
    body: 'The crew wants you.',
    createdDate: iso(5 * HOUR),
    attachment: {
      attachmentType: 'CLUB_INVITE',
      refId: 'club-1',
      claimed: false,
    },
  }),
  mail({
    id: 'm-notice',
    type: 'NOTICE',
    status: 'READ',
    title: 'Season update',
    body: 'Read the details at https://example.com/season, then javascript:alert(1) stays plain.\n\nSecond paragraph.',
    senderName: 'Admin',
    createdDate: iso(DAY + 2 * HOUR),
    readAt: iso(DAY),
  }),
  mail({
    id: 'm-old',
    type: 'NOTICE',
    status: 'CLAIMED',
    title: 'Old message',
    body: 'From a while ago.',
    createdDate: iso(6 * DAY),
  }),
]
const NEWS = [
  {
    id: 'n1',
    title: 'Big update',
    body: 'We shipped a lot of things this week. '.repeat(8),
    imageUrl: 'https://img.test/banner.svg',
    publishedAt: iso(3 * HOUR),
    readAt: null,
    type: 'IMPORTANT_NOTICE',
  },
  {
    id: 'n2',
    title: 'Quiet post',
    body: 'No picture on this one.',
    imageUrl: null,
    publishedAt: iso(2 * DAY),
    readAt: iso(DAY),
    type: 'MAILBOX_ONLY',
  },
]
const BANNER = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#2d6a4f"/></svg>`

async function boot(
  page,
  context,
  vp,
  { mailData = INBOX, news = NEWS, mailRoute, newsRoute } = {}
) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.setViewportSize(vp)
  await page.route('https://img.test/banner.svg', (r) =>
    r.fulfill({ contentType: 'image/svg+xml', body: BANNER })
  )
  await page.route(
    '**/v1/mail/find',
    mailRoute ||
      ((r) =>
        r.fulfill(
          ok({
            content: mailData,
            totalElements: mailData.length,
            totalPages: 1,
          })
        ))
  )
  await page.route(
    '**/v1/mail/broadcast/find',
    newsRoute ||
      ((r) =>
        r.fulfill(
          ok({ content: news, totalElements: news.length, totalPages: 1 })
        ))
  )
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.waitForTimeout(500)
}
async function openMail(page) {
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Mail', exact: true }).click()
  await expect(page.locator('.mail-panel')).toBeVisible({ timeout: 15_000 })
}

test.beforeEach(async ({ browserName }, testInfo) => {
  void browserName
  test.skip(testInfo.project.name !== 'mobile-390', 'sets its own viewports')
  test.setTimeout(120_000)
})

for (const vp of VIEWPORTS) {
  test(`header: the X never covers the dropdown arrow, and nothing scrolls sideways (${vp.width}x${vp.height})`, async ({
    mockedPage: page,
    context,
  }) => {
    await boot(page, context, vp)
    await openMail(page)
    const r = await page.evaluate(() => {
      const b = (s) => document.querySelector(s).getBoundingClientRect()
      const x = b('.game-menu-close'),
        k = b('.game-menu-picker-knob')
      return {
        xl: x.left,
        xr: x.right,
        xt: x.top,
        xb: x.bottom,
        kl: k.left,
        kr: k.right,
        kt: k.top,
        kb: k.bottom,
        vw: innerWidth,
      }
    })
    const overlap = !(
      r.kr <= r.xl ||
      r.kl >= r.xr ||
      r.kb <= r.xt ||
      r.kt >= r.xb
    )
    expect(overlap, JSON.stringify(r)).toBe(false)
    expect(r.xl - r.kr).toBeGreaterThanOrEqual(8)
    expect(r.xr).toBeLessThanOrEqual(r.vw)
    await expectNoHorizontalScroll(page)
  })

  test(`tabs + inbox cards: icons, purple selection, unread counts, day groups, rows (${vp.width}x${vp.height})`, async ({
    mockedPage: page,
    context,
  }) => {
    await boot(page, context, vp)
    await openMail(page)
    const tabs = page.locator('.mail-tabs [role="tab"]')
    await expect(tabs.nth(0)).toContainText('Inbox')
    await expect(tabs.nth(1)).toContainText('News')
    // one icon style: an SVG of the same family on both, selected = shop purple
    for (const i of [0, 1])
      await expect(tabs.nth(i).locator('svg')).toHaveCount(1)
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.nth(0)).toHaveCSS('background-color', 'rgb(190, 46, 214)')
    await expect(tabs.nth(0)).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(tabs.nth(1)).toHaveCSS('color', 'rgb(43, 42, 36)')
    await expect(tabs.nth(1)).toHaveCSS('-webkit-text-stroke-width', '0px')
    // unread counts on the tabs (inbox: 2 unread, news: 1 unread)
    await expect(page.locator('.mail-tabs .g-tab-badge').nth(0)).toHaveText('2')
    await expect(page.locator('.mail-tabs .g-tab-badge').nth(1)).toHaveText('1')

    // day groups in order, labels sticky
    await expect(page.locator('.mail-date-group-label')).toHaveText([
      'Today',
      'Yesterday',
      'Earlier',
    ])
    await expect(page.locator('.mail-date-group-label').first()).toHaveCSS(
      'position',
      'sticky'
    )

    const rows = page.locator('.mail-item-row')
    await expect(rows).toHaveCount(4)
    for (const row of await rows.all())
      expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(56)
    // unread: purple dot + bolder title; read: no dot, lighter title
    const gift = page.locator('.mail-item', { hasText: 'A gift for you' })
    const notice = page.locator('.mail-item', { hasText: 'Season update' })
    await expect(gift.locator('.mail-item-dot')).toHaveCount(1)
    await expect(notice.locator('.mail-item-dot')).toHaveCount(0)
    await expect(gift.locator('.mail-item-title')).toHaveCSS(
      'font-weight',
      '800'
    )
    await expect(notice.locator('.mail-item-title')).toHaveCSS(
      'font-weight',
      '600'
    )
    // one-line preview, relative time, resolved status, type icon circle
    await expect(gift.locator('.mail-item-preview')).toHaveCSS(
      'white-space',
      'nowrap'
    )
    await expect(gift.locator('.mail-item-date')).toHaveText('2h ago')
    await expect(
      page
        .locator('.mail-item', { hasText: 'Old message' })
        .locator('.mail-item-status')
    ).toHaveText('Claimed')
    const icon = gift.locator('.mail-item-icon')
    expect((await icon.boundingBox()).width).toBe(44)
    // body font, ink text, no outline
    for (const sel of [
      '.mail-item-title',
      '.mail-item-preview',
      '.mail-item-date',
    ]) {
      const l = gift.locator(sel)
      await expect(l).toHaveCSS('font-family', /Nunito/)
      await expect(l).toHaveCSS('-webkit-text-stroke-width', '0px')
      await expect(l).toHaveCSS('text-shadow', 'none')
    }
    await expectNoHorizontalScroll(page)
  })
}

test('detail popup: ribbon title, chips, readable body with safe links, closes; opening marks it read', async ({
  mockedPage: page,
  context,
}) => {
  const reads = []
  await page.route('**/v1/mail/*/read', (r) => {
    reads.push(r.request().url())
    return r.fulfill(ok({ ...INBOX[2], status: 'READ' }))
  })
  await boot(page, context, VIEWPORTS[0])
  await openMail(page)
  await page.locator('.mail-item-row', { hasText: 'Season update' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.gm-ribbon')).toHaveText('Season update')
  await expect(dialog.locator('.mail-chip.is-type')).toContainText('Notice')
  await expect(dialog.locator('.mail-chip').nth(1)).toHaveText('Admin')
  // body: 16px / 1.4, body font; two paragraphs
  const p = dialog.locator('.mail-detail-text')
  await expect(p).toHaveCount(2)
  await expect(p.first()).toHaveCSS('font-size', '16px')
  await expect(p.first()).toHaveCSS('line-height', '22.4px')
  await expect(p.first()).toHaveCSS('font-family', /Nunito/)
  // https link styled + safe; javascript: stays plain text
  const link = dialog.locator('a.mail-detail-link')
  await expect(link).toHaveCount(1)
  await expect(link).toHaveAttribute('href', 'https://example.com/season')
  await expect(link).toHaveAttribute('rel', /noopener/)
  await expect(link).toHaveCSS('text-decoration-line', 'underline')
  await expect(dialog).toContainText('javascript:alert(1)')
  // a plain notice has no Claim button
  await expect(
    dialog.getByRole('button', { name: /Claim|Join Club/ })
  ).toHaveCount(0)
  // fits the screen
  const box = await dialog.boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(640)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Escape closes it too
  await page.locator('.mail-item-row', { hasText: 'Old message' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('reward mail: icon chip + green Claim; claiming calls the same endpoint and shows Claimed', async ({
  mockedPage: page,
  context,
}) => {
  const calls = []
  await page.route('**/v1/mail/m-gift/read', (r) =>
    r.fulfill(ok({ ...INBOX[0], status: 'READ' }))
  )
  await page.route('**/v1/mail/m-gift/claim', (r) => {
    calls.push('claim')
    return r.fulfill(
      ok({
        ...INBOX[0],
        status: 'CLAIMED',
        attachment: { ...INBOX[0].attachment, claimed: true },
      })
    )
  })
  await boot(page, context, VIEWPORTS[0])
  await openMail(page)
  await page.locator('.mail-item-row', { hasText: 'A gift for you' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.gm-ribbon')).toHaveText('A gift for you')
  await expect(dialog.locator('.mail-reward-chip')).toContainText('Gift item') // catalog not loaded -> generic name
  const claim = dialog.getByRole('button', { name: 'Claim', exact: true })
  await expect(claim).toHaveClass(/gb-success/) // the green primary
  await expect(claim).toBeEnabled()
  await claim.click()
  expect(calls).toEqual(['claim'])
  await expect(dialog.locator('.mail-chip.is-status')).toHaveText(/Claimed/)
  await expect(
    dialog.getByRole('button', { name: 'Claim', exact: true })
  ).toHaveCount(0)
})

test('club invite keeps Join Club + Decline (Decline calls the same endpoint)', async ({
  mockedPage: page,
  context,
}) => {
  let declined = false
  await page.route('**/v1/mail/m-invite/read', (r) =>
    r.fulfill(ok({ ...INBOX[1], status: 'READ' }))
  )
  await page.route('**/v1/mail/m-invite/decline', (r) => {
    declined = true
    return r.fulfill(ok({ ...INBOX[1], status: 'DECLINED' }))
  })
  await boot(page, context, VIEWPORTS[0])
  await openMail(page)
  await page
    .locator('.mail-item-row', { hasText: 'Join Himal Runners' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.mail-reward-chip')).toContainText('Club invite')
  await expect(dialog.getByRole('button', { name: 'Join Club' })).toHaveClass(
    /gb-success/
  )
  await dialog.getByRole('button', { name: 'Decline' }).click()
  expect(declined).toBe(true)
  await expect(dialog.locator('.mail-chip.is-status')).toHaveText(/Declined/)
})

for (const vp of VIEWPORTS) {
  test(`news: banner cards, fallback, tag, two-line summary, no "Read more" (no link field) (${vp.width}x${vp.height})`, async ({
    mockedPage: page,
    context,
  }) => {
    const reads = []
    await page.route('**/v1/mail/broadcast/n1/read', (r) => {
      reads.push('n1')
      return r.fulfill(ok({}))
    })
    await boot(page, context, vp)
    await openMail(page)
    await page.getByRole('tab', { name: /News/ }).click()
    const cards = page.locator('.news-card')
    await expect(cards).toHaveCount(2)
    // banner on top with a fixed 16:9 ratio, same for the card with no image
    for (const card of await cards.all()) {
      const m = await card.locator('.news-card-media').boundingBox()
      expect(Math.abs(m.width / m.height - 16 / 9)).toBeLessThan(0.03)
    }
    await expect(cards.nth(0).locator('.news-card-media img')).toBeVisible()
    await expect(cards.nth(1).locator('.news-card-fallback svg')).toBeVisible()
    await expect(cards.nth(1).locator('.news-card-media img')).toHaveCount(0)
    // tag only where the data has one (IMPORTANT_NOTICE)
    await expect(cards.nth(0).locator('.news-card-tag')).toHaveText('Important')
    await expect(cards.nth(1).locator('.news-card-tag')).toHaveCount(0)
    // unread card: purple dot; read card: none
    await expect(cards.nth(0).locator('.mail-item-dot')).toHaveCount(1)
    await expect(cards.nth(1).locator('.mail-item-dot')).toHaveCount(0)
    // 2-line summary, readable font, date
    const sum = cards.nth(0).locator('.news-card-summary')
    await expect(sum).toHaveCSS('-webkit-line-clamp', '2')
    const lines = await sum.evaluate((el) =>
      Math.round(
        el.getBoundingClientRect().height /
          parseFloat(getComputedStyle(el).lineHeight)
      )
    )
    expect(lines).toBeLessThanOrEqual(2)
    await expect(sum).toHaveCSS('font-family', /Nunito/)
    await expect(cards.nth(0).locator('.news-card-meta')).toHaveText(/\w/)
    await expect(page.getByText('Read more')).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    // tapping opens the full post and marks it read (same endpoint)
    await cards.nth(0).locator('.news-card-trigger').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.gm-ribbon')).toHaveText('Big update')
    await expect(dialog.locator('.mail-detail-banner img')).toBeVisible()
    await expect(dialog.locator('.mail-detail-text')).toContainText(
      'We shipped a lot of things'
    )
    expect(reads).toEqual(['n1'])
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    // Reading the post clears the News badge; the Inbox keeps its own (2 unread mail).
    await expect(
      page.locator('.mail-tabs [role="tab"]').nth(1).locator('.g-tab-badge')
    ).toHaveCount(0)
    await expect(
      page.locator('.mail-tabs [role="tab"]').nth(0).locator('.g-tab-badge')
    ).toHaveText('2')
  })
}

test('states: skeleton while loading, illustrated empty Inbox + News, error with Retry', async ({
  mockedPage: page,
  context,
}) => {
  page.allowFailedRequests = true
  let phase = 'slow'
  await boot(page, context, VIEWPORTS[0], {
    mailRoute: async (r) => {
      if (phase === 'slow') {
        // Still loading when the Mail page opens (the game takes ~5s to boot).
        await new Promise((res) => setTimeout(res, 16_000))
        return r.fulfill(ok({ content: [], totalElements: 0, totalPages: 1 }))
      }
      if (phase === 'error')
        return r.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Mail server is down' }),
        })
      return r.fulfill(ok({ content: INBOX, totalElements: 4, totalPages: 1 }))
    },
    newsRoute: (r) =>
      r.fulfill(ok({ content: [], totalElements: 0, totalPages: 1 })),
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Mail', exact: true }).click()
  // loading: skeleton rows shaped like the real ones
  await expect(page.getByTestId('mail-skeleton')).toBeVisible()
  await expect(page.locator('.mail-skel-row')).toHaveCount(4)
  // empty inbox: the winged envelope + the copy
  await expect(page.locator('.mail-empty')).toContainText(
    'Inbox zero. Suspiciously peaceful out here.',
    { timeout: 30_000 }
  )
  await expect(page.locator('.mail-empty .mail-illustration')).toBeVisible()
  expect(await page.locator('.mail-empty').innerText()).not.toMatch(
    /🕊|[\u{1F300}-\u{1FAFF}]/u
  )
  // empty news
  await page.getByRole('tab', { name: /News/ }).click()
  await expect(page.locator('.mail-empty')).toContainText(
    'No news yet. Check back soon.'
  )
  await expect(page.locator('.mail-empty .mail-illustration')).toBeVisible()
})

test('error: friendly message with Retry; Retry loads the mail', async ({
  mockedPage: page,
  context,
}) => {
  page.allowFailedRequests = true
  let fail = true
  await boot(page, context, VIEWPORTS[0], {
    mailRoute: (r) =>
      fail
        ? r.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Mail server is down' }),
          })
        : r.fulfill(ok({ content: INBOX, totalElements: 4, totalPages: 1 })),
  })
  await openMail(page)
  const err = page.locator('.mail-error')
  await expect(err).toBeVisible()
  await expect(err).toContainText('Check your connection and try again.')
  await expect(err.locator('.mail-illustration')).toBeVisible()
  const retry = err.getByRole('button', { name: 'Retry' })
  expect((await retry.boundingBox()).height).toBeGreaterThanOrEqual(44)
  fail = false
  await retry.click()
  await expect(page.locator('.mail-item-row')).toHaveCount(4)
  await expect(page.locator('.mail-error')).toHaveCount(0)
})
