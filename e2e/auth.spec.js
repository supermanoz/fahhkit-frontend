import { test, expect } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'

test.describe('Auth', () => {
  test('login screen renders: mobile/email + password fields, Google button, forgot-password link', async ({
    mockedPage: page,
  }) => {
    await page.goto('/login')
    await expect(page.locator('#mobileNumber')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByText(/forgot.*password/i)).toBeVisible()
    // Google sign-in only renders when VITE_GOOGLE_CLIENT_ID is configured
    // (GoogleSignInButton.jsx/hasGoogle in LoginPage.jsx) - confirmed
    // configured in this dev env (Google's own script logs an origin-
    // mismatch warning for localhost, filtered as known noise in
    // fixtures/base.js, which only happens once the button has mounted and
    // tried to render the real widget).
    await expect(page.locator('.google-signin-button')).toBeAttached()
  })

  test('wrong password shows an error, stays on the login screen', async ({
    mockedPage: page,
  }) => {
    await page.route('**/v1/authenticate', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 401,
          errorMessage: 'Invalid credentials',
        }),
      })
    )
    await page.goto('/login')
    await page.locator('#mobileNumber').fill('nobody@example.com')
    await page.locator('#password').fill('wrong-password')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid credentials/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('forgot-password link navigates to its own screen', async ({
    mockedPage: page,
  }) => {
    await page.goto('/login')
    await page.getByText(/forgot.*password/i).click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('successful login navigates away from /login (session restored, no stuck login flash)', async ({
    mockedPage: page,
  }) => {
    await page.route('**/v1/authenticate', (route) =>
      route.fulfill(ok({ tokenId: 'mock-token' }))
    )
    await page.goto('/login')
    await page.locator('#mobileNumber').fill('vet@example.com')
    await page.locator('#password').fill('correct-password')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
