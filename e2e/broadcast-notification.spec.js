import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Drives the REAL client path for a broadcast: a STOMP MESSAGE frame on
// /all/mail through the app's own useGameSocket (page.routeWebSocket stands
// in for the Spring broker), plus the foreground catch-up fetch. This only
// proves the IN-APP path - nothing in this app turns a broadcast into an OS
// notification (see the audit report), and these tests don't pretend to.
const NOTICE = {
  id: 7001,
  type: 'IMPORTANT_NOTICE',
  title: 'Season 2 starts Friday!',
  body: 'New territory, new rewards. Lace up and claim your streets.',
  publishedAt: '2026-11-12T09:00:00Z',
  readAt: null,
}
const NEWS = {
  id: 7002,
  type: 'MAILBOX_ONLY',
  title: 'Weekend double-XP',
  body: 'Run any distance this weekend for double XP.',
  publishedAt: '2026-11-12T09:30:00Z',
  readAt: null,
}

const NUL = '\u0000'
function frame(command, headers, body = '') {
  const head = Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .join('\n')
  return `${command}\n${head}\n\n${body}${NUL}`
}

test.describe('Broadcast arriving in the app (in-app path only)', () => {
  let socket
  let mailSubscriptionId
  let pendingNotices
  let listedBroadcasts
  let noticeShownCalls

  test.beforeEach(async ({ mockedPage: page, context }) => {
    socket = null
    mailSubscriptionId = null
    pendingNotices = []
    listedBroadcasts = []
    noticeShownCalls = []
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)

    await page.route('**/v1/mail/find', (r) =>
      r.fulfill(ok({ content: [], totalPages: 1 }))
    )
    await page.route('**/v1/mail/broadcast/find', (r) =>
      r.fulfill(ok({ content: listedBroadcasts, totalPages: 1 }))
    )
    await page.route('**/v1/mail/broadcast/notices/pending', (r) =>
      r.fulfill(ok(pendingNotices))
    )
    await page.route('**/v1/mail/broadcast/*/notice-shown', (r) => {
      const url = r.request().url()
      noticeShownCalls.push(url)
      // The real endpoint also marks the broadcast read (see api/mail.js).
      const shownId = Number(/broadcast\/(\d+)\/notice-shown/.exec(url)?.[1])
      listedBroadcasts = listedBroadcasts.map((b) =>
        b.id === shownId ? { ...b, readAt: '2026-11-12T10:00:00Z' } : b
      )
      return r.fulfill(ok({}))
    })
    await page.route('**/v1/mail/broadcast/*/read', (r) => r.fulfill(ok({})))

    // Minimal STOMP broker: answers CONNECT, records the /all/mail
    // subscription id so the test can push MESSAGE frames to it.
    await page.routeWebSocket(/\/ws$/, (ws) => {
      socket = ws
      ws.onMessage((raw) => {
        const text = String(raw)
        if (text.startsWith('CONNECT') || text.startsWith('STOMP')) {
          ws.send(frame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }))
        } else if (text.startsWith('SUBSCRIBE')) {
          const id = /\nid:([^\n]+)/.exec(text)?.[1]
          const dest = /\ndestination:([^\n]+)/.exec(text)?.[1]
          if (dest === '/all/mail') mailSubscriptionId = id
        }
      })
    })
  })

  async function openGame(page) {
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 30_000,
    })
    await expect
      .poll(() => mailSubscriptionId, { timeout: 10_000 })
      .toBeTruthy()
  }

  function pushBroadcast(broadcast) {
    // Mirror the server: a published broadcast is also in its News list.
    if (!listedBroadcasts.some((b) => b.id === broadcast.id))
      listedBroadcasts = [broadcast, ...listedBroadcasts]
    socket.send(
      frame(
        'MESSAGE',
        {
          destination: '/all/mail',
          subscription: mailSubscriptionId,
          'message-id': String(broadcast.id),
          'content-type': 'application/json',
        },
        JSON.stringify(broadcast)
      )
    )
  }

  test('live push: important notice pops up, Got it dismisses it for good, News tab + badge update', async ({
    mockedPage: page,
  }) => {
    await openGame(page)

    // 1. IMPORTANT_NOTICE -> in-app popup (foreground "toast").
    pushBroadcast(NOTICE)
    const prompt = page.locator('.broadcast-prompt')
    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText(NOTICE.title)
    await page.screenshot({
      path: 'screenshots/notifications/broadcast-1-popup.png',
    })

    // 2. "Got it" -> gone, server ack sent, and a re-push of the SAME id
    //    (e.g. a reconnect replay) doesn't bring it back.
    await prompt.getByRole('button', { name: 'Got it' }).click()
    await expect(prompt).toBeHidden()
    await expect.poll(() => noticeShownCalls.length).toBe(1)
    expect(noticeShownCalls[0]).toContain(`/${NOTICE.id}/notice-shown`)
    pushBroadcast(NOTICE)
    await expect(prompt).toBeHidden()

    // 3. A MAILBOX_ONLY broadcast never pops up, only raises the unread
    //    badge; opening the menu shows it in the News tab.
    pushBroadcast(NEWS)
    await expect(prompt).toBeHidden()
    await page.locator('.game-menu-btn').click()
    await page.screenshot({
      path: 'screenshots/notifications/broadcast-2-unread-badge.png',
    })
    await page.getByRole('button', { name: /^Mail/ }).first().click()
    await page.getByRole('tab', { name: /News/ }).click()
    const unreadCards = page.locator('.news-card.is-unread')
    await expect(unreadCards).toHaveCount(1)
    await expect(unreadCards).toContainText(NEWS.title)
    await page.screenshot({
      path: 'screenshots/notifications/broadcast-3-news-tab.png',
    })
  })

  test('app returns to the foreground: notice published while backgrounded is picked up', async ({
    mockedPage: page,
  }) => {
    await openGame(page)
    await expect(page.locator('.broadcast-prompt')).toBeHidden()

    // Published while the phone was locked: the socket never saw it, but the
    // server now lists it as pending.
    pendingNotices = [NOTICE]
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.locator('.broadcast-prompt')).toContainText(NOTICE.title)
    await page.screenshot({
      path: 'screenshots/notifications/broadcast-4-foreground-catchup.png',
    })
  })
})
