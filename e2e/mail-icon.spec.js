import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// The Mail tab icon sits in the same .game-menu-picker-medal ring as the other
// tabs (same border, shadow, size). Checks the ring box matches Me's, the
// unread badge sits at the icon's top-right, and screenshots both states.
// Screenshots: ./screenshots/mail-icon/.
const SHOT_DIR = 'screenshots/mail-icon'

for (const unread of [0, 3]) {
  test(`mail icon matches neighbours (unread=${unread})`, async ({
    mockedPage: page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000)
    const name = testInfo.project.name
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.route('**/v1/mail/find', (r) =>
      r.fulfill(
        ok({
          content: Array.from({ length: unread }, (_, i) => ({
            id: `m${i}`,
            type: 'TEXT',
            status: 'UNREAD',
            title: 'Hi',
            body: 'x',
            createdDate: '2026-11-01T06:00:00Z',
          })),
          totalPages: 1,
          totalElements: unread,
        })
      )
    )
    await page.route('**/v1/mail/broadcast/find', (r) =>
      r.fulfill(ok({ content: [], totalPages: 1, totalElements: 0 }))
    )
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 60_000,
    })
    // A daily-run reminder can pop over the HUD depending on the clock.
    await page
      .getByText('Not now')
      .click({ timeout: 4000 })
      .catch(() => {})
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
    await expect(page.locator('.game-menu-sheet')).toBeVisible()

    const picker = page.locator('.game-menu-picker-current')
    const onPhone = await picker.isVisible()
    const shot = (n) =>
      page.screenshot({ path: `${SHOT_DIR}/${n}-u${unread}-${name}.png` })

    if (onPhone) {
      // Collapsed picker (current = Leaderboard/default), then dropdown list.
      await shot('picker-closed')
      await picker.click()
      const list = page.locator('.game-menu-picker')
      await page.waitForTimeout(700) // let the list finish animating
      await shot('picker-open')
      const mailMedal = list.locator('.tone-mail').first()
      const meMedal = list.locator('.tone-green').nth(1)
      const a = await mailMedal.boundingBox()
      const b = await meMedal.boundingBox()
      expect(Math.abs(a.width - b.width)).toBeLessThan(0.5)
      expect(Math.abs(a.height - b.height)).toBeLessThan(0.5)
      await list.getByText('Mail', { exact: true }).click()
      await shot('picker-mail-selected')
      if (unread === 0)
        await expect(page.locator('.game-menu-picker-badge')).toHaveCount(0)
    } else {
      const tabs = page.locator('.game-menu-tabs')
      const mailTab = tabs.getByRole('button', { name: /Mail/ })
      const meTab = tabs.getByRole('button', { name: 'Me', exact: true })
      await shot('row-mail-unselected')
      const a = await mailTab.locator('.game-menu-picker-medal').boundingBox()
      const b = await meTab.locator('.game-menu-picker-medal').boundingBox()
      expect(Math.abs(a.width - b.width)).toBeLessThan(0.5)
      expect(Math.abs(a.height - b.height)).toBeLessThan(0.5)
      // Same ring + shadow computed styles.
      const style = (l) =>
        l.evaluate((el) => {
          const s = getComputedStyle(el)
          return [s.borderTopWidth, s.borderTopColor].join(' ')
        })
      expect(await style(mailTab.locator('.game-menu-picker-medal'))).toBe(
        await style(meTab.locator('.game-menu-picker-medal'))
      )
      if (unread > 0) {
        const badge = mailTab.locator('.game-menu-tab-badge')
        await expect(badge).toBeVisible()
        const bb = await badge.boundingBox()
        const tb = await mailTab.boundingBox()
        // top-right of the tab, not covering the icon.
        expect(bb.x + bb.width / 2).toBeGreaterThan(tb.x + tb.width - 30)
        expect(bb.x).toBeGreaterThanOrEqual(a.x + a.width - 2)
      } else {
        await expect(mailTab.locator('.game-menu-tab-badge')).toHaveCount(0)
      }
      await mailTab.click()
      await shot('row-mail-selected')
    }
  })
}
