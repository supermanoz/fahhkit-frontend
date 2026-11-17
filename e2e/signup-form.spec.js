import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// Create Account layout: Country/Date of Birth identical boxes, no
// horizontal overflow, styled checkbox. Run on 360/390 Chromium and on
// iOS-WebKit (see playwright.config.js), where date inputs differ most.
const OUT = 'screenshots/signup-form'

async function openSignup(page) {
  await page.goto('/game')
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .click({ timeout: 30_000 })
  await expect(
    page.getByRole('heading', { name: 'Join Run Conquest' })
  ).toBeVisible()
}

const box = (page, sel) =>
  page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      x: r.x,
      w: r.width,
      h: r.height,
      right: r.right,
      border: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      font: `${cs.fontSize} ${cs.fontFamily}`,
    }
  })

test('signup form: DOB matches Country, fits, styled checkbox', async ({
  mockedPage: page,
}, info) => {
  fs.mkdirSync(OUT, { recursive: true })
  await openSignup(page)
  const vp = page.viewportSize()
  const tag = `${info.project.name}-${vp.width}x${vp.height}`

  const country = await box(page, '#ga-country')
  const dob = await box(page, '#ga-birthDate')
  expect(Math.abs(country.h - dob.h)).toBeLessThanOrEqual(1)
  expect(Math.abs(country.w - dob.w)).toBeLessThanOrEqual(1)
  expect(dob.border).toBe(country.border)
  expect(dob.radius).toBe(country.radius)
  const card = await box(page, '.game-auth-card')
  expect(dob.right).toBeLessThanOrEqual(card.right + 0.5)
  await expect(page.locator('.game-auth-date-text')).toHaveText('Select date')

  await page.locator('#ga-birthDate').fill('2000-11-15')
  await expect(page.locator('.game-auth-date-text')).toHaveText('15 Nov 2000')
  expect(await page.locator('#ga-birthDate').getAttribute('max')).toMatch(
    /^\d{4}-\d{2}-\d{2}$/
  )
  expect(await page.locator('#ga-birthDate').getAttribute('min')).toBe(
    '1900-01-01'
  )

  const cb = page.locator('#game-signup-terms-agreement')
  await cb.check()
  const cbBox = await box(page, '#game-signup-terms-agreement')
  expect(cbBox.w).toBeGreaterThanOrEqual(16)
  expect(
    await cb.evaluate((el) => getComputedStyle(el).backgroundColor)
  ).not.toBe('rgb(246, 243, 232)')

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true)
  await page.screenshot({ path: `${OUT}/${tag}.png` })
})
