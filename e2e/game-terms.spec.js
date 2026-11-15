import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Run Conquest's own Terms & Privacy: public pages (no login), in-game modal
// from Create Account, Settings entries, locally recorded acceptance.
const OUT = 'screenshots/game-terms'
const DOCS = [
  { path: '/game/terms', title: 'Terms & Conditions' },
  { path: '/game/privacy', title: 'Privacy Policy' },
]
const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const d of DOCS) {
  for (const vp of SIZES) {
    test(`${d.path} renders without login at ${vp.name}`, async ({
      mockedPage: page,
    }) => {
      fs.mkdirSync(OUT, { recursive: true })
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(d.path)
      await expect(
        page.getByRole('heading', { name: d.title, level: 1 })
      ).toBeVisible()
      await expect(
        page.getByText(/Last updated 15 November 2026/)
      ).toBeVisible()
      await expect(
        page.getByRole('navigation', { name: 'Contents' })
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`${d.path}$`)) // no login redirect
      // Short: well under 350 words of body text.
      const words = await page
        .locator('.game-legal-doc')
        .evaluate((el) => el.innerText.split(/\s+/).filter(Boolean).length)
      expect(words).toBeLessThan(350)
      // Not clipped; no sideways scroll.
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        )
      ).toBe(true)
      // Screenshot at the top of the document, then TOC jump check.
      await page.screenshot({
        path: `${OUT}${d.path.replace('/game', '')}-${vp.name}.png`,
      })
      // TOC link jumps to its section.
      await page
        .getByRole('navigation', { name: 'Contents' })
        .getByRole('link')
        .nth(3)
        .click()
    })
  }
}

test('Create Account opens Terms/Privacy in an in-game modal and records acceptance', async ({
  mockedPage: page,
}) => {
  await page.route('**/v1/athlete/signup', (r) =>
    r.fulfill(ok({ email: 'sita@example.com' }))
  )
  await page.goto('/game')
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .click({ timeout: 30_000 })
  await page
    .locator('.game-auth-terms')
    .getByRole('button', { name: 'Terms' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Terms & Conditions' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/game$/) // stayed in the game, no website page
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
  await page
    .locator('.game-auth-terms')
    .getByRole('button', { name: 'Privacy Policy' })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Privacy Policy' })
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await page.locator('#ga-fullName').fill('Sita Rai')
  await page.locator('#ga-email').fill('sita@example.com')
  await page.locator('#ga-mobileNumber').fill('9812345678')
  await page.locator('#ga-country').selectOption('NEPAL')
  await page.locator('#ga-birthDate').fill('2000-05-17')
  await page.locator('#game-signup-terms-agreement').check()
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .click()
  await expect(page.getByText("You're in!")).toBeVisible()
  const rec = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fahhkit.gameTermsAccepted'))
  )
  expect(rec.version).toBe('2026-11-15')
  expect(rec.email).toBe('sita@example.com')
})

test('Settings lists Terms & Conditions and Privacy Policy', async ({
  mockedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedSession(page, VETERAN)
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
  await page
    .getByText('Not now')
    .click({ timeout: 3000 })
    .catch(() => {})
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Terms & Conditions/ }).click()
  await expect(
    page.getByRole('dialog', { name: 'Terms & Conditions' })
  ).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Terms & Conditions' })
    .getByRole('button', { name: 'Close' })
    .click()
  await page.getByRole('button', { name: /Privacy Policy/ }).click()
  await expect(
    page.getByRole('dialog', { name: 'Privacy Policy' })
  ).toBeVisible()
})

test('Settings contact block links to Instagram in a new tab', async ({
  mockedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedSession(page, VETERAN)
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
  await page
    .getByText('Not now')
    .click({ timeout: 3000 })
    .catch(() => {})
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const block = page.locator('.game-settings-contact')
  await block.scrollIntoViewIfNeeded()
  await expect(block).toContainText('Issues? Reach out to us at @run_conquest')
  const link = block.getByRole('link', { name: '@run_conquest' })
  await expect(link).toHaveAttribute(
    'href',
    'https://www.instagram.com/runconquest.game/'
  )
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  const box = await block.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  fs.mkdirSync(OUT, { recursive: true })
  await block.screenshot({ path: `${OUT}/settings-contact-390.png` })
  await page.screenshot({ path: `${OUT}/settings-bottom-390.png` })
})
