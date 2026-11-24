import { test, expect } from './fixtures/base.js'

// Accidental page zoom: every text field is >= 16px on touch devices (iOS
// zooms the page when a smaller one is focused), the viewport forbids scaling,
// and the pinch guard cancels gestures outside the map. Run at the phone
// projects (mobile-390 / small-360); desktop keeps its own font sizes.
const PAGES = ['/login', '/register', '/forgot-password', '/contact']

test.describe('no accidental page zoom', () => {
  test('viewport meta forbids user scaling', async ({ mockedPage: page }) => {
    await page.goto('/login')
    const content = await page
      .locator('meta[name=viewport]')
      .getAttribute('content')
    expect(content).toContain('user-scalable=no')
    expect(content).toContain('maximum-scale=1')
    expect(content).toContain('viewport-fit=cover')
  })

  for (const path of PAGES) {
    test(`${path}: every input/textarea/select is >= 16px`, async ({
      mockedPage: page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name.startsWith('desktop'),
        'phone font rule only'
      )
      await page.goto(path)
      await page.locator('input, textarea, select').first().waitFor()
      const sizes = await page.evaluate(() =>
        [...document.querySelectorAll('input, textarea, select')]
          .filter(
            (el) =>
              !['checkbox', 'radio', 'range', 'file', 'hidden'].includes(
                el.type
              )
          )
          .map((el) => ({
            id: el.name || el.id || el.type,
            px: parseFloat(getComputedStyle(el).fontSize),
          }))
      )
      expect(sizes.length).toBeGreaterThan(0)
      for (const s of sizes) expect(s.px, s.id).toBeGreaterThanOrEqual(16)
    })
  }

  test('page pinch is cancelled, a focused field does not scroll the page sideways', async ({
    mockedPage: page,
  }) => {
    await page.goto('/login')
    const prevented = await page.evaluate(() => {
      const e = new Event('gesturestart', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(e)
      return e.defaultPrevented
    })
    expect(prevented).toBe(true)
    await page.locator('input').first().focus()
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
