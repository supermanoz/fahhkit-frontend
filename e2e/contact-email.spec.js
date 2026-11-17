import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// The contact email: a mailto link in the game Terms / Privacy (page) and in
// Settings -> Contact, with a copy button that toasts "Copied".
const EMAIL = 'runconquest.game@gmail.com'
const OUT = 'screenshots/contact-email'

for (const doc of ['terms', 'privacy']) {
  test(`/game/${doc}: contact email is a dark-red mailto link`, async ({
    mockedPage: page,
  }, testInfo) => {
    await page.goto(`/game/${doc}`)
    const links = page.locator('a.game-legal-mail')
    await expect(links.first()).toBeVisible({ timeout: 30_000 })
    for (const l of await links.all()) {
      await expect(l).toHaveAttribute('href', `mailto:${EMAIL}`)
      await expect(l).toHaveText(EMAIL)
      await expect(l).toHaveCSS('color', 'rgb(113, 9, 19)')
    }
    await expect(page.locator('.game-legal-doc')).not.toContainText(
      '[CONTACT EMAIL]'
    )
    await links.first().scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `${OUT}/${doc}-${testInfo.project.name}.png`,
    })
  })
}

test('Settings contact: email row, mailto link, copy toast', async ({
  mockedPage: page,
  context,
}, testInfo) => {
  await context.grantPermissions([
    'geolocation',
    'clipboard-read',
    'clipboard-write',
  ])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.goto('/game')
  await expect(page.locator('.game-menu-btn')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 60_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const card = page.locator('.game-settings-contact')
  await card.scrollIntoViewIfNeeded()
  const mail = card.locator(`a[href="mailto:${EMAIL}"]`)
  await expect(mail).toHaveText(EMAIL)
  await expect(mail).toHaveCSS('color', 'rgb(113, 9, 19)')
  // Plain dark text on the light card: no heavy stroke at this size.
  await expect(mail).toHaveCSS('-webkit-text-stroke-width', '0px')
  await expect(mail).toHaveCSS('text-shadow', 'none')
  // Fits: nothing wider than the card, address not cut.
  const fit = await card.evaluate((el) => {
    const c = el.getBoundingClientRect()
    return [...el.querySelectorAll('*:not(wbr)')].every((n) => {
      const r = n.getBoundingClientRect()
      return r.right <= c.right + 1 && r.left >= c.left - 1
    })
  })
  expect(fit).toBe(true)
  await card.screenshot({
    path: `${OUT}/settings-${testInfo.project.name}.png`,
  })
  await card.getByRole('button', { name: 'Copy email address' }).click()
  await expect(page.getByText('Copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EMAIL)
  await page.screenshot({
    path: `${OUT}/settings-copied-${testInfo.project.name}.png`,
  })
})
