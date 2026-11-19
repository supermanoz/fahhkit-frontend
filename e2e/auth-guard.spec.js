import { test, expect } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// Website account pages (Shop, Edit profile, payment-status, ...) need a
// session: signed out they go to /login?next=<page + query> with a friendly
// line, and come back after signing in. Screenshots: ./screenshots/auth-guard/.
const OUT = 'screenshots/auth-guard'

const b64 = (o) =>
  Buffer.from(JSON.stringify(o))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const jwt = (expSecondsFromNow) =>
  `${b64({ alg: 'HS256' })}.${b64({
    sub: 'sita',
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
  })}.sig`

async function signInOnLoginPage(page) {
  await page.locator('#mobileNumber').fill('sita@example.com')
  await page.locator('#password').fill('correct-horse-1')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}

test.beforeEach(async ({ mockedPage: page }) => {
  await page.route('**/v1/authenticate', (r) =>
    r.fulfill(ok({ tokenId: jwt(3600) }))
  )
})

test.describe('signed out', () => {
  for (const [path, line] of [
    ['/shop', 'Sign in to continue to the shop.'],
    ['/profile/edit', 'Sign in to edit your profile.'],
    [
      '/payment-status?purchaseId=77&status=PAID',
      'Sign in to see your payment status.',
    ],
  ]) {
    test(`${path} -> sign-in with ?next and a friendly line, then back with the query kept`, async ({
      mockedPage: page,
    }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login\?next=/)
      const url = new URL(page.url())
      expect(url.searchParams.get('next')).toBe(path)
      await expect(page.locator('.banner.info')).toHaveText(line)
      // Nothing credential-like in the URL.
      expect(page.url()).not.toMatch(/token|password|bearer|jwt/i)
      if (path === '/shop') {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.screenshot({ path: `${OUT}/signed-out-redirect.png` })
      }
      await signInOnLoginPage(page)
      await expect(page).toHaveURL(
        new RegExp(`${path.replace(/[?.]/g, '\\$&')}$`)
      )
      expect(page.url()).not.toContain('/login')
    })
  }

  test('a pack the game linked to survives the round trip (/shop?pack=500)', async ({
    mockedPage: page,
  }) => {
    await page.goto('/shop?pack=500')
    await expect(page).toHaveURL(/\/login\?next=%2Fshop%3Fpack%3D500$/)
    await signInOnLoginPage(page)
    await expect(page).toHaveURL(/\/shop\?pack=500$/)
  })

  test('other account pages are guarded too, public pages are not', async ({
    mockedPage: page,
  }) => {
    for (const path of [
      '/history',
      '/runs/5',
      '/athletes',
      '/admin/dashboard',
    ]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login\?next=/)
    }
    for (const path of ['/', '/events', '/contact', '/login']) {
      await page.goto(path)
      await expect(page).toHaveURL(
        new RegExp(`${path === '/' ? '/$' : path + '$'}`)
      )
    }
  })

  for (const bad of [
    '//evil.com',
    'https://evil.com/shop',
    '/\\evil.com',
    'javascript:alert(1)',
    '/login?next=/shop',
  ]) {
    test(`unsafe next ${JSON.stringify(bad)} falls back to the default page`, async ({
      mockedPage: page,
    }) => {
      await page.goto(`/login?next=${encodeURIComponent(bad)}`)
      await expect(page.locator('.banner.info')).toHaveCount(0)
      await signInOnLoginPage(page)
      await expect(page).toHaveURL(/^https?:\/\/localhost:\d+\/$/)
    })
  }
})

test.describe('session ends while on the page', () => {
  const seed = (page, token) =>
    page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('fahhkit_token', token)
        localStorage.setItem('fahhkit_user', JSON.stringify(user))
      },
      { token, user: VETERAN.user }
    )

  test('a valid session opens the page (no redirect)', async ({
    mockedPage: page,
  }) => {
    await seed(page, jwt(3600))
    await page.goto('/shop?pack=500')
    await expect(page).toHaveURL(/\/shop\?pack=500$/)
    await expect(page.locator('.login-card')).toHaveCount(0)
  })

  test('an expired token redirects at once, without a stuck page', async ({
    mockedPage: page,
  }) => {
    await seed(page, jwt(-60))
    await page.goto('/profile/edit')
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Fedit$/)
    await expect(page.locator('.banner.info')).toBeVisible()
    expect(
      await page.evaluate(() => localStorage.getItem('fahhkit_token'))
    ).toBeNull()
  })

  test('a token the server rejects (401) redirects with next', async ({
    mockedPage: page,
  }) => {
    await seed(page, 'opaque-but-rejected')
    await page.route('**/v1/user/find/logged-in', (r) =>
      r.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errorMessage: 'Unauthorized' }),
      })
    )
    await page.goto('/shop?pack=250')
    await expect(page).toHaveURL(/\/login\?next=%2Fshop%3Fpack%3D250$/, {
      timeout: 15_000,
    })
    await signInOnLoginPage(page)
  })

  test('signing out in another tab redirects this page', async ({
    mockedPage: page,
  }) => {
    await seed(page, jwt(3600))
    await page.goto('/shop')
    await expect(page).toHaveURL(/\/shop$/)
    await page.evaluate(() => {
      localStorage.removeItem('fahhkit_token')
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'fahhkit_token', newValue: null })
      )
    })
    await expect(page).toHaveURL(/\/login\?next=%2Fshop$/)
  })

  test('the token expiring while the page is open redirects at that moment', async ({
    mockedPage: page,
  }) => {
    await seed(page, jwt(3))
    await page.goto('/shop')
    await expect(page).toHaveURL(/\/shop$/)
    await expect(page).toHaveURL(/\/login\?next=%2Fshop$/, { timeout: 12_000 })
  })

  test('the Navbar sign-out still goes home', async ({ mockedPage: page }) => {
    await seed(page, jwt(3600))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/shop')
    await page.locator('.navbar-user-trigger').click()
    await page.getByRole('button', { name: 'Sign Out' }).click()
    await expect(page).toHaveURL(/^https?:\/\/localhost:\d+\/$/)
  })
})
