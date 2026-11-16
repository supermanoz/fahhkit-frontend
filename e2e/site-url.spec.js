import { test, expect } from './fixtures/base.js'

// Buy Fahhcoin / website links must use the site's OWN origin on the web
// (netlify -> netlify/shop, vercel -> vercel/shop, localhost -> localhost/shop)
// and VITE_SITE_URL only inside the native app. Runs the real siteUrl.js
// resolver with simulated origins, plus openShopPack() against the real
// page origin.
test.describe('site base URL', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/')
  })

  test('web uses its own origin, native uses the configured site', async ({
    mockedPage: page,
  }, testInfo) => {
    if (testInfo.project.name !== 'desktop-1440') test.skip()
    const r = await page.evaluate(async () => {
      const { resolveSiteBaseUrl } = await import('/src/utils/siteUrl.js')
      const shop = (o) => `${resolveSiteBaseUrl(o)}/shop?pack=500`
      // VITE_SITE_URL baked into the web build (as .env.production does) must
      // NOT override the origin.
      const configured = 'https://fahhkit.vercel.app'
      return {
        netlify: shop({
          native: false,
          origin: 'https://fahhkit.netlify.app',
          configured,
        }),
        vercel: shop({
          native: false,
          origin: 'https://fahhkit.vercel.app',
          configured,
        }),
        localhost: shop({
          native: false,
          origin: 'http://localhost:5173',
          configured,
        }),
        nativeConfigured: shop({
          native: true,
          origin: 'https://localhost',
          configured: 'https://example.test/',
        }),
        nativeFallback: shop({
          native: true,
          origin: 'https://localhost',
          configured: undefined,
        }),
      }
    })
    expect(r.netlify).toBe('https://fahhkit.netlify.app/shop?pack=500')
    expect(r.vercel).toBe('https://fahhkit.vercel.app/shop?pack=500')
    expect(r.localhost).toBe('http://localhost:5173/shop?pack=500')
    expect(r.nativeConfigured).toBe('https://example.test/shop?pack=500')
    expect(r.nativeFallback).toBe('https://fahhkit.vercel.app/shop?pack=500')
  })

  test("openShopPack opens this page's own origin /shop", async ({
    mockedPage: page,
  }, testInfo) => {
    if (testInfo.project.name !== 'desktop-1440') test.skip()
    const opened = await page.evaluate(async () => {
      let url = null
      window.open = (u) => {
        url = u
        return null
      }
      const { openShopPack } = await import('/src/utils/siteUrl.js')
      await openShopPack(1200)
      return { url, origin: window.location.origin }
    })
    expect(opened.url).toBe(`${opened.origin}/shop?pack=1200`)
  })
})
