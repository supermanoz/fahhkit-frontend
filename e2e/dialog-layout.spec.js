import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Dialog layout at 360px (and with a large system font): no button label is
// ever truncated or clipped, the "Delete account" dialog uses the readable
// body font for its text, and a dialog taller than the screen scrolls inside
// its panel while its buttons stay visible.
const VP = { width: 360, height: 640 }

async function openSettings(page, context) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.setViewportSize(VP)
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
  await page.waitForTimeout(400)
}

// Every button label inside the open dialog: nothing clipped, no ellipsis,
// and the label box stays inside its button.
async function expectNoTruncatedLabels(dialog) {
  const bad = await dialog.evaluate((root) => {
    const out = []
    root.querySelectorAll('.gbtn, .btn').forEach((btn) => {
      const label = btn.querySelector('.gbtn-label') || btn
      const cs = getComputedStyle(label)
      const b = btn.getBoundingClientRect()
      const l = label.getBoundingClientRect()
      const text = (label.textContent || '').trim()
      if (label.scrollWidth > label.clientWidth + 1)
        out.push(
          `${text}: scrollWidth ${label.scrollWidth} > ${label.clientWidth}`
        )
      if (cs.textOverflow === 'ellipsis')
        out.push(`${text}: text-overflow ellipsis`)
      if (l.right > b.right + 1 || l.left < b.left - 1)
        out.push(`${text}: label outside its button`)
    })
    return out
  })
  expect(bad).toEqual([])
}

test.describe('dialog layout @360', () => {
  test.beforeEach(async ({ browserName }, testInfo) => {
    void browserName
    test.skip(testInfo.project.name !== 'mobile-390', 'sets its own viewport')
    test.setTimeout(150_000)
  })

  for (const [name, fontScale] of [
    ['normal font', '100%'],
    ['large system font', '140%'],
  ]) {
    test(`Delete account + Log out: ${name}`, async ({
      mockedPage: page,
      context,
    }) => {
      await openSettings(page, context)
      await page.addStyleTag({ content: `html { font-size: ${fontScale} }` })

      await page.getByTestId('delete-account-btn').scrollIntoViewIfNeeded()
      await page.getByTestId('delete-account-btn').click()
      const del = page.getByRole('dialog', { name: 'Delete your account?' })
      await expect(del).toBeVisible()
      await expect(
        del.getByRole('button', { name: 'Keep account' })
      ).toBeVisible()
      await expect(
        del.getByRole('button', { name: 'Delete account' })
      ).toBeVisible()
      await expectNoTruncatedLabels(del)

      // Readable body text: body font (not the display font), solid ink, no
      // outline / shadow, left-aligned list with real bullets.
      const style = await page
        .getByTestId('delete-account-list')
        .evaluate((ul) => {
          const li = ul.querySelector('li')
          const cs = getComputedStyle(li)
          const ucs = getComputedStyle(ul)
          const title = getComputedStyle(
            document.querySelector('.gm-ribbon-text')
          )
          return {
            font: cs.fontFamily,
            titleFont: title.fontFamily,
            stroke: cs.webkitTextStrokeWidth,
            shadow: cs.textShadow,
            align: cs.textAlign,
            listStyle: ucs.listStyleType,
            indent: parseFloat(ucs.paddingLeft),
          }
        })
      expect(style.font).not.toBe(style.titleFont)
      expect(style.stroke).toBe('0px')
      expect(style.shadow).toBe('none')
      expect(style.align).toBe('left')
      expect(style.listStyle).toBe('disc')
      expect(style.indent).toBeGreaterThan(12)

      // Panel never taller than the screen; buttons inside the viewport.
      const m = await del.evaluate((d) => {
        const r = d.getBoundingClientRect()
        const btn = d.querySelector('[data-testid="delete-account-confirm"]')
        const br = btn.getBoundingClientRect()
        return {
          top: r.top,
          bottom: r.bottom,
          btnBottom: br.bottom,
          vh: innerHeight,
        }
      })
      expect(m.bottom).toBeLessThanOrEqual(m.vh)
      expect(m.btnBottom).toBeLessThanOrEqual(m.vh)

      await del.getByRole('button', { name: 'Keep account' }).click()
      await expect(del).toBeHidden()

      await page.getByTestId('logout-btn').scrollIntoViewIfNeeded()
      await page.getByTestId('logout-btn').click()
      const out = page.getByRole('dialog', { name: 'Log out?' })
      await expect(out).toBeVisible()
      await expectNoTruncatedLabels(out)
    })
  }

  test('the Training chooser buttons are never cut off', async ({
    mockedPage: page,
    context,
  }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
    await seedSession(page, VETERAN)
    await page.setViewportSize(VP)
    await page.goto('/game')
    await expect(page.locator('.game-loading-overlay')).toBeHidden({
      timeout: 60_000,
    })
    await page
      .getByText('Not now')
      .click({ timeout: 2500 })
      .catch(() => {})
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Training', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Training' })
    await expect(dialog).toBeVisible()
    await expectNoTruncatedLabels(dialog)
  })
})
