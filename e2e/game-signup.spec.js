import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'

// In-game Create Account: only what POST /v1/athlete/signup truly needs from
// the player (name, email, mobile, country, date of birth); gender/address
// go as accepted placeholders and every optional field is gone.
const OUT = 'screenshots/game-signup'

async function openSignup(page) {
  await page.goto('/game')
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .click({ timeout: 30_000 })
  await expect(
    page.getByRole('heading', { name: 'Join FahhKit' })
  ).toBeVisible()
}

async function fillValid(page, over = {}) {
  const v = {
    fullName: 'Sita Rai',
    email: 'sita@example.com',
    mobileNumber: '9812345678',
    country: 'NEPAL',
    birthDate: '2000-05-17',
    ...over,
  }
  await page.locator('#ga-fullName').fill(v.fullName)
  await page.locator('#ga-email').fill(v.email)
  await page.locator('#ga-mobileNumber').fill(v.mobileNumber)
  await page.locator('#ga-country').selectOption(v.country)
  await page.locator('#ga-birthDate').fill(v.birthDate)
  await page.locator('#game-signup-terms-agreement').check()
}

test.describe('Game Create Account', () => {
  test('shows only the required fields and fits the screen', async ({
    mockedPage: page,
  }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 360, height: 640 })
    await openSignup(page)
    for (const id of [
      'fullName',
      'email',
      'mobileNumber',
      'country',
      'birthDate',
    ])
      await expect(page.locator(`#ga-${id}`)).toBeVisible()
    for (const gone of [
      'confirmEmail',
      'gender',
      'address',
      'city',
      'nationality',
      'occupation',
      'bloodGroup',
      'emergencyContactName',
      'emergencyContactPhone',
    ])
      await expect(page.locator(`#ga-${gone}`)).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Create Account', exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Already got your login email? Set your password')
    ).toBeVisible()
    const card = await page.locator('.game-auth-card').boundingBox()
    expect(card.height).toBeLessThanOrEqual(640)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true)
    await page.screenshot({ path: `${OUT}/signup-360x640.png` })
  })

  test('inline validation matches the backend rules', async ({
    mockedPage: page,
  }) => {
    let posted = 0
    await page.route('**/v1/athlete/signup', (r) => {
      posted += 1
      return r.fulfill(ok({}))
    })
    await openSignup(page)
    await page.locator('#ga-fullName').fill('X1')
    await page.locator('#ga-email').fill('sita@gmail')
    await page.locator('#ga-mobileNumber').fill('1234')
    await page.locator('#ga-birthDate').fill('2024-01-01')
    await page.locator('#ga-fullName').blur()
    await page.locator('#ga-email').blur()
    await page.locator('#ga-mobileNumber').blur()
    await page.locator('#ga-birthDate').blur()
    await expect(
      page.getByText('Enter a valid name using letters only')
    ).toBeVisible()
    await expect(page.getByText(/valid email address/)).toBeVisible()
    await expect(
      page.getByText(/10-digit mobile number starting with 9/)
    ).toBeVisible()
    await expect(page.getByText(/at least 10 to join/)).toBeVisible()
    await page.locator('#game-signup-terms-agreement').check()
    await page
      .getByRole('button', { name: 'Create Account', exact: true })
      .click()
    await expect(page.getByText('Pick your country.')).toBeVisible()
    expect(posted).toBe(0)
  })

  test('happy path sends the minimal payload and shows the emailed-password screen', async ({
    mockedPage: page,
  }) => {
    let body = ''
    await page.route('**/v1/athlete/signup', (r) => {
      body = r.request().postData() || ''
      return r.fulfill(ok({ email: 'sita@example.com' }))
    })
    await openSignup(page)
    await fillValid(page)
    await page
      .getByRole('button', { name: 'Create Account', exact: true })
      .click()
    await expect(page.getByText("You're in!")).toBeVisible()
    for (const [k, v] of Object.entries({
      fullName: 'Sita Rai',
      email: 'sita@example.com',
      mobileNumber: '9812345678',
      country: 'NEPAL',
      birthDate: '2000-05-17',
      gender: 'OTHERS',
      address: 'Not provided',
    }))
      (expect(body).toContain(`name="${k}"`), expect(body).toContain(v))
    for (const gone of [
      'city',
      'nationality',
      'occupation',
      'bloodGroup',
      'emergencyContactName',
    ])
      expect(body).not.toContain(`name="${gone}"`)
  })

  for (const [what, message] of [
    ['email', 'An account with this email already exists.'],
    ['mobile number', 'An account with this mobile number already exists.'],
  ]) {
    test(`backend 409 for an existing ${what} is shown and the form stays`, async ({
      mockedPage: page,
    }) => {
      await page.route('**/v1/athlete/signup', (r) =>
        r.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ status: 409, errorMessage: message }),
        })
      )
      await openSignup(page)
      await fillValid(page)
      await page
        .getByRole('button', { name: 'Create Account', exact: true })
        .click()
      await expect(page.getByText(message)).toBeVisible()
      await expect(page.locator('#ga-email')).toHaveValue('sita@example.com')
    })
  }
})
