import { test as plain } from '@playwright/test'
import { test, expect } from './fixtures/base.js'
import { mockApi } from './fixtures/mockApi.js'
import { ok } from './fixtures/mockApi.js'

// Auth screens redesign: friendly inline notices (no codes / raw text), game
// buttons by meaning, game-style fields, the forgot -> reset flow, keyboard-
// height handling, and the Google button (simulated Android shell).
// Screenshots: ./screenshots/auth-redesign/.
const OUT = 'screenshots/auth-redesign'
const VP = { width: 360, height: 640 }

const bad = (message) => ({
  status: 400,
  contentType: 'application/json',
  body: JSON.stringify({ errorMessage: message }),
})

async function openSignIn(page) {
  await page.setViewportSize(VP)
  await page.goto('/game')
  await page
    .getByRole('button', { name: 'Sign In', exact: true })
    .click({ timeout: 30_000 })
  await expect(page.getByText('Welcome Back')).toBeVisible()
}

const notice = (page) => page.locator('.game-auth-notice')

test.describe('Sign In', () => {
  test('wrong password: red friendly notice, clears on edit', async ({
    mockedPage: page,
  }) => {
    await page.route('**/v1/authenticate', (r) =>
      r.fulfill(bad('Given credential is wrong!'))
    )
    await openSignIn(page)
    await page.locator('#game-auth-mobile').fill('sita@example.com')
    await page.locator('#game-auth-password').fill('nope-nope')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(notice(page)).toHaveText(
      "Email or password doesn't match. Try again."
    )
    await expect(notice(page)).toHaveClass(/game-auth-notice--error/)
    await expect(page.locator('body')).not.toContainText(/credential|400|code/i)
    await page.screenshot({ path: `${OUT}/signin-wrong-password.png` })
    // Editing a field dismisses it.
    await page.locator('#game-auth-password').fill('nope-nope2')
    await expect(notice(page)).toHaveCount(0)
  })

  test('no connection: amber notice with the connection sentence', async ({
    mockedPage: page,
  }) => {
    page.allowFailedRequests = true // this test deliberately drops the network
    await page.route('**/v1/authenticate', (r) => r.abort('failed'))
    await openSignIn(page)
    await page.locator('#game-auth-mobile').fill('9800000000')
    await page.locator('#game-auth-password').fill('whatever1')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(notice(page)).toHaveText(
      "Can't reach the game. Check your connection and try again."
    )
    await expect(notice(page)).toHaveClass(/game-auth-notice--warning/)
  })

  test('unknown server failure shows the generic line, never the raw text', async ({
    mockedPage: page,
  }) => {
    await page.route('**/v1/authenticate', (r) =>
      r.fulfill(bad('NullPointerException at Foo.java:42'))
    )
    await openSignIn(page)
    await page.locator('#game-auth-mobile').fill('9800000000')
    await page.locator('#game-auth-password').fill('whatever1')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(notice(page)).toHaveText(
      'Something went wrong. Please try again.'
    )
  })

  test('empty fields: short messages next to each field, nothing sent', async ({
    mockedPage: page,
  }) => {
    let sent = 0
    await page.route('**/v1/authenticate', (r) => {
      sent += 1
      return r.fulfill(ok({}))
    })
    await openSignIn(page)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.locator('#game-auth-mobile-msg')).toHaveText(
      'Enter your email or mobile number.'
    )
    await expect(page.locator('#game-auth-password-msg')).toHaveText(
      'Enter your password.'
    )
    expect(sent).toBe(0)
    await page.screenshot({ path: `${OUT}/signin-field-errors.png` })
  })

  test('game-style fields and buttons by meaning', async ({
    mockedPage: page,
  }) => {
    await openSignIn(page)
    const input = await page.locator('#game-auth-mobile').evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        h: el.getBoundingClientRect().height,
        border: cs.borderTopWidth,
        radius: cs.borderTopLeftRadius,
        font: cs.fontFamily,
      }
    })
    expect(input.h).toBeCloseTo(52, 0)
    expect(input.border).toBe('2px')
    expect(input.radius).toBe('14px')
    expect(input.font).toMatch(/Nunito/)
    // Primary = green gradient, 56px; no orange anywhere on the buttons.
    const primary = page.getByRole('button', { name: 'Sign In', exact: true })
    const pb = await primary.boundingBox()
    expect(pb.height).toBeCloseTo(56, 0)
    const bg = await primary.evaluate(
      (el) => getComputedStyle(el).backgroundImage
    )
    expect(bg).toMatch(/linear-gradient/)
    expect(bg).not.toMatch(/221, 87, 28|242, 123, 67|180, 66, 15/) // old orange
    // The title is the display font, the subtitle the body font.
    await expect(page.locator('.game-auth-title')).toHaveCSS(
      'font-family',
      /Lilita One/
    )
    await expect(page.locator('.game-auth-subtitle')).toHaveCSS(
      'font-family',
      /Nunito/
    )
    // The eye toggles visibility.
    const pw = page.locator('#game-auth-password')
    await expect(pw).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(pw).toHaveAttribute('type', 'text')
    // Purple focus ring.
    await pw.focus()
    await expect(pw).toHaveCSS('border-top-color', 'rgb(143, 31, 163)')
    // The link is purple, 44px tall.
    const link = page.getByRole('button', { name: 'Forgot password?' })
    await expect(link).toHaveCSS('color', 'rgb(143, 31, 163)')
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: `${OUT}/signin-360x640.png` })
  })

  test('keyboard open (short viewport): the form scrolls and the focused field is in view', async ({
    mockedPage: page,
  }) => {
    await openSignIn(page)
    await page.setViewportSize({ width: 360, height: 330 })
    const gate = page.locator('.game-auth-gate')
    // The gate resizes to the visible viewport, then scrolls.
    await expect
      .poll(() => gate.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true)
    await page.locator('#game-auth-password').focus()
    await expect(page.locator('#game-auth-password')).toBeInViewport({
      ratio: 1,
      timeout: 8000,
    })
    // The submit button is reachable by scrolling.
    await page
      .getByRole('button', { name: 'Sign In', exact: true })
      .scrollIntoViewIfNeeded()
    await expect(
      page.getByRole('button', { name: 'Sign In', exact: true })
    ).toBeInViewport({ ratio: 1 })
  })
})

test('forgot password: email -> check inbox -> reset -> success -> Sign In', async ({
  mockedPage: page,
}) => {
  let changed = false
  await page.route('**/v1/user/forgot-password', (r) => r.fulfill(ok({})))
  await page.route('**/v1/authenticate', (r) => r.fulfill(ok({ tokenId: 't' })))
  await page.route('**/v1/user/change-password', (r) => {
    changed = true
    return r.fulfill(ok({}))
  })
  await openSignIn(page)
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  // Step 1
  await expect(
    page.getByRole('heading', { name: 'Forgot Password' })
  ).toBeVisible()
  await expect(page.locator('.game-auth-steps li.current')).toHaveText(/Email/)
  await page.getByRole('button', { name: 'Send New Password' }).click()
  await expect(page.locator('#ga-forgot-mobile-msg')).toHaveText(
    'Enter your email or mobile number.'
  )
  await page.locator('#ga-forgot-mobile').fill('sita@example.com')
  await page.getByRole('button', { name: 'Send New Password' }).click()
  // Step 2
  await expect(
    page.getByRole('heading', { name: 'Check your inbox!' })
  ).toBeVisible()
  await expect(page.locator('.game-auth-steps li.current')).toHaveText(/Inbox/)
  await page.screenshot({ path: `${OUT}/forgot-check-inbox.png` })
  await page.getByRole('button', { name: 'I have my new password' }).click()
  // Step 3
  await expect(
    page.getByRole('heading', { name: 'Set Your Password' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save New Password' }).click()
  await expect(page.locator('#ga-sp-old-msg')).toBeVisible()
  await page.locator('#ga-sp-old').fill('emailed-pass-1')
  await page.locator('#ga-sp-new').fill('BrandNew123')
  await page.locator('#ga-sp-confirm').fill('Different123')
  await page.getByRole('button', { name: 'Save New Password' }).click()
  await expect(page.locator('#ga-sp-confirm-msg')).toHaveText(
    "Passwords don't match."
  )
  await page.locator('#ga-sp-confirm').fill('BrandNew123')
  await page.getByRole('button', { name: 'Save New Password' }).click()
  // Success + Sign In (mobile pre-filled)
  await expect(
    page.getByRole('heading', { name: 'Password updated!' })
  ).toBeVisible()
  expect(changed).toBe(true)
  await page.screenshot({ path: `${OUT}/reset-success.png` })
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByText('Welcome Back')).toBeVisible()
  await expect(page.locator('#game-auth-mobile')).toHaveValue(
    'sita@example.com'
  )
})

// The simulated native shell has no real Capacitor plugins (App,
// LocalNotifications...) so the strict mockedPage fixture would flag those
// as page errors: a plain page with the API mocks instead.
const native = plain.extend({
  page: async ({ page }, use) => {
    await mockApi(page)
    await use(page)
  },
})

native.describe('Google button (simulated Android shell)', () => {
  async function simulateAndroid(page, googleError) {
    await page.addInitScript((err) => {
      window.androidBridge = { postMessage() {} }
      window.Capacitor = {
        PluginHeaders: [
          {
            name: 'GoogleAuth',
            methods: ['initialize', 'signIn', 'signOut', 'refresh'].map(
              (n) => ({
                name: n,
                rtype: 'promise',
              })
            ),
          },
        ],
        nativePromise(plugin, method) {
          if (plugin === 'GoogleAuth' && method === 'signIn')
            return Promise.reject(err)
          return Promise.resolve({})
        },
      }
    }, googleError)
    await page.setViewportSize(VP)
    await page.goto('/game')
    await expect(page.locator('.game-auth-card')).toBeVisible({
      timeout: 30_000,
    })
  }
  const google = (page) => page.locator('.google-signin-button--native')

  native(
    'white button, official multicolour G, same height as the others',
    async ({ page }) => {
      await simulateAndroid(page, { code: '12501', message: 'cancelled' })
      await expect(google(page)).toBeVisible()
      await expect(google(page)).toHaveText('Continue with Google')
      const fills = await google(page)
        .locator('svg path')
        .evaluateAll((ps) => ps.map((p) => p.getAttribute('fill')))
      expect(fills).toEqual(['#EA4335', '#4285F4', '#FBBC05', '#34A853'])
      await expect(google(page)).toHaveCSS(
        'background-color',
        'rgb(255, 255, 255)'
      )
      const gb = await google(page).boundingBox()
      const signIn = await page
        .getByRole('button', { name: 'Sign In', exact: true })
        .boundingBox()
      expect(gb.height).toBeCloseTo(signIn.height, 0)
      expect(gb.width).toBeCloseTo(signIn.width, 0)
      // Preview of the Apple button (black / white logo) with the exact markup
      // + classes AppleSignInButton renders - it is hidden in this build.
      await page.evaluate(() => {
        const wrap = document.querySelector('.game-auth-oauth')
        const btn = document.createElement('button')
        btn.className = 'apple-signin-button'
        btn.innerHTML =
          '<svg viewBox="0 0 814 1000" class="apple-signin-icon"><path fill="#fff" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-163.9-39.5c-76.7 0-104 39.5-166.5 39.5s-105.9-57-150.5-121.9C50.1 823.6 1.4 683.2 1.4 550.3c0-203.1 132-310.8 262.1-310.8 70.2 0 128.8 41.6 169.2 41.6 38.4 0 101.3-44.1 174.1-44.1 28.1 0 129.1 2.3 180.6 136.9zm-257-266.5c17.7-22.4 32.4-55.2 32.4-88.2 0-4.8-.4-9.6-1.3-13.6-26 1.1-56.4 17.4-78.6 41.4-20.3 22.4-37.8 54.7-37.8 87.7 0 5.1.9 10.1 1.3 11.6 2 .3 5.2.6 8.6.6 22.3 0 50.4-15.3 75.4-39.5z"/></svg>Continue with Apple'
        wrap.appendChild(btn)
      })
      const ab = await page.locator('.apple-signin-button').boundingBox()
      expect(ab.height).toBeCloseTo(gb.height, 0)
      await page.locator('.game-auth-card').scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `${OUT}/welcome-oauth-buttons.png`,
        fullPage: false,
      })
    }
  )

  native('closing the account picker shows nothing', async ({ page }) => {
    await simulateAndroid(page, {
      code: '-5',
      message: 'The user canceled the sign-in flow.',
    })
    await google(page).click()
    await page.waitForTimeout(600)
    await expect(notice(page)).toHaveCount(0)
    await expect(google(page)).toBeEnabled()
  })

  native(
    'a setup problem (code 10) shows the friendly line, no codes',
    async ({ page }) => {
      await simulateAndroid(page, {
        code: '10',
        message: 'Something went wrong',
      })
      await google(page).click()
      await expect(notice(page)).toHaveText(
        "Google sign-in isn't working right now. Try email sign-in or try again later."
      )
      await expect(notice(page)).toHaveClass(/game-auth-notice--warning/)
      await expect(page.locator('body')).not.toContainText(/code 10|\(code/i)
      await page.screenshot({ path: `${OUT}/welcome-google-problem.png` })
    }
  )
})
