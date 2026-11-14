import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Game-only native app. E2E_PROD=1 serves two production builds: the website
// build (`npm run build`, :5175 = default baseURL) and the Capacitor shell
// build (`npm run build:app` -> dist-app, :5176). "Native" is simulated by
// the Capacitor Android bridge stub below; the redirect itself is build-time
// (VITE_APP_SHELL), the same bundle the APK ships.
test.skip(
  process.env.E2E_PROD !== '1',
  'needs the production builds - run with E2E_PROD=1'
)

const NATIVE = 'https://localhost:5176'
const WEBSITE_ROUTES = [
  '/',
  '/events',
  '/shop',
  '/login',
  '/register',
  '/forgot-password',
  '/contact',
  '/history',
  '/athletes',
  '/admin/dashboard',
  '/payment-status?status=PAID',
  '/terms/signup',
  '/some/unknown/route',
]

test.describe('native app build: game only', () => {
  test.use({ baseURL: NATIVE })

  test.beforeEach(async ({ mockedPage: page }) => {
    await page.addInitScript(() => {
      window.androidBridge = { postMessage() {} } // Capacitor.isNativePlatform() === true
      // No native side here, so plugin calls reject "not implemented" - an
      // artifact of the simulation, not an app error.
      window.addEventListener('unhandledrejection', (e) => {
        if (/not implemented on android/.test(e.reason?.message || ''))
          e.preventDefault()
      })
    })
    await seedSession(page, VETERAN)
  })

  for (const route of WEBSITE_ROUTES) {
    test(`${route} lands on /game`, async ({ mockedPage: page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/game$/)
      await expect(page.locator('header.navbar')).toHaveCount(0)
      await expect(page.locator('footer')).toHaveCount(0)
    })
  }

  test('a reload on /game stays on /game (bundled SPA fallback)', async ({
    mockedPage: page,
  }) => {
    await page.goto('/game')
    // Let the first load settle so the reload doesn't abort in-flight fetches
    // (which log "Failed to fetch" - the fixture fails on any console.error).
    await page.waitForLoadState('networkidle')
    await page.reload()
    await expect(page).toHaveURL(/\/game$/)
  })

  test('logged out: the in-game sign-in shows, not the website login', async ({
    mockedPage: page,
  }) => {
    await page.addInitScript(() => localStorage.clear())
    await page.goto('/login')
    await expect(page).toHaveURL(/\/game$/)
    await expect(
      page.locator('.game-auth, [class*="game-auth"]').first()
    ).toBeVisible({
      timeout: 30_000,
    })
  })

  test('the website pages are not in the native bundle', async ({
    mockedPage: page,
  }) => {
    const scripts = []
    page.on('request', (r) => {
      if (r.url().endsWith('.js')) scripts.push(r.url())
    })
    await page.goto('/')
    await expect(page).toHaveURL(/\/game$/)
    const bodies = await Promise.all(
      scripts.map((u) => page.request.get(u).then((r) => r.text()))
    )
    const all = bodies.join('\n')
    expect(all).not.toContain('territory-slide-title') // LandingPage
    expect(all).not.toContain('navbar-brand') // Navbar
    expect(all).not.toContain('fahhkit-test')
    expect(all).not.toContain('netlify')
  })
})

test.describe('website build is unchanged', () => {
  for (const [route, marker] of [
    ['/', 'header.navbar'],
    ['/events', 'header.navbar'],
    ['/shop', 'header.navbar'],
    ['/login', 'header.navbar'],
  ]) {
    test(`${route} still serves the website page`, async ({
      mockedPage: page,
    }) => {
      await seedSession(page, VETERAN)
      await page.goto(route)
      await expect(page.locator(marker).first()).toBeVisible({
        timeout: 20_000,
      })
      await expect(page).toHaveURL(
        new RegExp(`${route === '/' ? '/$' : route}`)
      )
    })
  }

  test('/game still works on the website', async ({ mockedPage: page }) => {
    await seedSession(page, VETERAN)
    await page.goto('/game')
    await expect(page).toHaveURL(/\/game$/)
  })
})
