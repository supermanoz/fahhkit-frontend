// Mail delete (Inbox only - News/broadcasts have no delete endpoint on the
// backend, see src/api/mail.js and MailController.java, read-only). Covers
// the four scenarios the brief asked for: a successful single delete, a
// failed one rolling back, bulk "Delete read" only touching read mail, and
// Cancel in the confirm popup doing nothing.
import {
  test,
  expect,
  seedSession,
  expectNoHorizontalScroll,
} from './fixtures/base.js'
import { mockApi, ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

function mailItem({ id, status, type = 'NOTICE', title, senderName = null }) {
  return {
    id,
    senderId: null,
    senderName,
    recipientId: VETERAN.id,
    type,
    title,
    body: `Body for ${title}`,
    status,
    payload: null,
    attachment: null,
    readAt: status === 'UNREAD' ? null : '2026-01-01T00:00:00',
    resolvedAt: null,
    createdDate: '2026-01-01T00:00:00',
  }
}

const UNREAD_ITEM = mailItem({
  id: 'mail-unread-1',
  status: 'UNREAD',
  title: 'Unread notice',
})
const READ_ITEM_1 = mailItem({
  id: 'mail-read-1',
  status: 'READ',
  title: 'First read mail',
})
const READ_ITEM_2 = mailItem({
  id: 'mail-read-2',
  status: 'READ',
  title: 'Second read mail',
})

async function openMailPanel(page) {
  await page.goto('/game')
  await page
    .locator('.game-loading-overlay')
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => {})
  await page.locator('.game-hud-level').click()
  await page.locator('.game-menu-picker-current').click()
  // Not exact: true - the option's own unread-count badge span isn't
  // aria-hidden, so its accessible name is "Mail" plus that digit.
  await page.getByRole('option', { name: /^Mail/ }).click()
  await page
    .locator('.mail-panel')
    .waitFor({ state: 'visible', timeout: 15000 })
}

async function openRow(page, title) {
  await page.getByRole('button', { name: new RegExp(title) }).click()
}

test.describe.configure({ mode: 'serial' })

test('delete read mail removes it and updates the badge', async ({
  mockedPage: page,
}) => {
  await seedSession(page, VETERAN)
  await mockApi(page, {
    'POST /v1/mail/find': ok({
      content: [UNREAD_ITEM, READ_ITEM_1],
      totalElements: 2,
      totalPages: 1,
    }),
    'POST /v1/mail/broadcast/find': ok({ content: [], totalElements: 0 }),
  })
  let deleteCalled = false
  await page.route('**/v1/mail/mail-read-1', (route) => {
    deleteCalled = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, data: null }),
    })
  })

  await openMailPanel(page)
  await expect(page.locator('.mail-tab-badge')).toHaveText('1')
  await openRow(page, 'First read mail')
  await page.getByRole('button', { name: 'Delete mail' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText('First read mail')).toHaveCount(0)
  await expect(page.getByText('Mail deleted')).toBeVisible()
  expect(deleteCalled).toBe(true)
  // The unread item is untouched - still there, badge still accurate (not
  // dropped to 0 just because a mail got deleted).
  await expect(page.getByText('Unread notice')).toBeVisible()
  await expect(page.locator('.mail-tab-badge')).toHaveText('1')
  await expectNoHorizontalScroll(page)
})

// Plain `page`, not `mockedPage` - that fixture's own blanket "no failed/
// 5xx requests" assertion (see fixtures/base.js) would flag the 500 this
// test deliberately mocks to exercise the rollback path as if it were an
// unexpected bug, rather than the scenario being tested.
test('failed delete restores the row', async ({ page }) => {
  await seedSession(page, VETERAN)
  await mockApi(page, {
    'POST /v1/mail/find': ok({
      content: [READ_ITEM_1],
      totalElements: 1,
      totalPages: 1,
    }),
    'POST /v1/mail/broadcast/find': ok({ content: [], totalElements: 0 }),
  })
  await page.route('**/v1/mail/mail-read-1', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 500,
        data: null,
        message: 'Server error',
      }),
    })
  )

  await openMailPanel(page)
  await openRow(page, 'First read mail')
  await page.getByRole('button', { name: 'Delete mail' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  // Optimistic removal happens immediately, then the failed request rolls
  // it back - wait for the restore rather than asserting mid-flight.
  await expect(page.getByText("Couldn't delete, try again")).toBeVisible()
  await expect(page.locator('.mail-item-title')).toHaveText('First read mail')
})

test('bulk delete read only removes read mail', async ({
  mockedPage: page,
}) => {
  await seedSession(page, VETERAN)
  await mockApi(page, {
    'POST /v1/mail/broadcast/find': ok({ content: [], totalElements: 0 }),
  })
  // Keyed on whether the bulk delete has actually happened yet (not a call
  // counter) - React 18 StrictMode double-invokes the initial fetch effect
  // in dev, so a plain "1st call vs later calls" counter would serve the
  // post-delete page before the test ever gets to see the pre-delete one.
  let bulkDeleteCalled = false
  await page.route('**/v1/mail/find', (route) => {
    const content = bulkDeleteCalled
      ? [UNREAD_ITEM]
      : [UNREAD_ITEM, READ_ITEM_1, READ_ITEM_2]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: { content, totalElements: content.length, totalPages: 1 },
      }),
    })
  })
  await page.route('**/v1/mail/read', (route) => {
    if (route.request().method() !== 'DELETE') return route.continue()
    bulkDeleteCalled = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, data: 2 }),
    })
  })

  await openMailPanel(page)
  await expect(page.getByText('First read mail')).toBeVisible()
  await expect(page.getByText('Second read mail')).toBeVisible()

  await page.getByRole('button', { name: /Delete read/ }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  expect(bulkDeleteCalled).toBe(true)
  await expect(page.getByText('Deleted 2 read mails')).toBeVisible()
  await expect(page.getByText('First read mail')).toHaveCount(0)
  await expect(page.getByText('Second read mail')).toHaveCount(0)
  // Unread mail is never part of the bulk op - still there.
  await expect(page.getByText('Unread notice')).toBeVisible()
})

test('confirm Cancel does nothing', async ({ mockedPage: page }) => {
  await seedSession(page, VETERAN)
  await mockApi(page, {
    'POST /v1/mail/find': ok({
      content: [READ_ITEM_1],
      totalElements: 1,
      totalPages: 1,
    }),
    'POST /v1/mail/broadcast/find': ok({ content: [], totalElements: 0 }),
  })
  let deleteCalled = false
  await page.route('**/v1/mail/mail-read-1', (route) => {
    deleteCalled = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, data: null }),
    })
  })

  await openMailPanel(page)
  await openRow(page, 'First read mail')
  await page.getByRole('button', { name: 'Delete mail' }).click()
  await expect(page.getByText('Delete this mail?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByText('Delete this mail?')).toHaveCount(0)
  await expect(page.locator('.mail-item-title')).toHaveText('First read mail')
  expect(deleteCalled).toBe(false)
})

test('Escape also cancels the confirm popup', async ({ mockedPage: page }) => {
  await seedSession(page, VETERAN)
  await mockApi(page, {
    'POST /v1/mail/find': ok({
      content: [READ_ITEM_1],
      totalElements: 1,
      totalPages: 1,
    }),
    'POST /v1/mail/broadcast/find': ok({ content: [], totalElements: 0 }),
  })
  let deleteCalled = false
  await page.route('**/v1/mail/mail-read-1', (route) => {
    deleteCalled = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, data: null }),
    })
  })

  await openMailPanel(page)
  await openRow(page, 'First read mail')
  await page.getByRole('button', { name: 'Delete mail' }).click()
  await expect(page.getByText('Delete this mail?')).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(page.getByText('Delete this mail?')).toHaveCount(0)
  expect(deleteCalled).toBe(false)
})
