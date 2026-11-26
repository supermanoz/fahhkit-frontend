import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'

// The run image popup opened from Me -> History (game-run-viewer) must never
// be cut off at the top or unscrollable on short phones: the card preview
// scales to the screen so the type label, Download button, dots and the
// close (X) are all in view, for every image type and export state.
// Screenshots: ./screenshots/run-image-modal/.
const POINTS = Array.from({ length: 40 }, (_, i) => {
  const t = (i / 39) * Math.PI * 2
  return {
    lat: 27.7172 + Math.sin(t) * 0.0025,
    lng: 85.324 + Math.cos(t) * 0.0032,
  }
})
const RUN = {
  id: 'run-1',
  distance: 5200,
  duration: 1800,
  avgPace: 346,
  startedAt: '2026-11-01T06:30:00',
  points: POINTS,
}
const SLIDES = [
  'Hero Poster',
  'Transparent Route',
  'Overlay',
  'Brand Gradient',
  'Map Snapshot',
]
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 360, height: 700 },
  { width: 390, height: 844 },
]

async function openViewer(page, context, vp) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.setViewportSize(vp)
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.route('**/v1/run/find', (route) =>
    route.fulfill(
      ok({
        content: [RUN],
        totalElements: 1,
        totalPages: 1,
        number: 0,
        size: 10,
      })
    )
  )
  await page.route(/\/v1\/run\/run-1$/, (route) => route.fulfill(ok(RUN)))
  await page.goto('/game')
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 90_000 })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Me', exact: true }).click()
  await page.locator('.game-me-history-row').first().click()
  await expect(page.locator('.share-carousel')).toBeVisible()
  await page.waitForTimeout(700) // pop-in + canvas draw settle
}

// Everything the player needs, in view at once (no scrolling): X, the card,
// its type label, the Download button and the dots.
async function expectAllInView(page, label) {
  const vp = page.viewportSize()
  const close = page.locator('.game-run-viewer-close')
  const cb = await close.boundingBox()
  expect(cb.y, 'close not clipped at top').toBeGreaterThanOrEqual(0)
  expect(cb.x + cb.width, 'close not clipped at right').toBeLessThanOrEqual(
    vp.width
  )
  const slide = page.locator('.share-carousel-slide').nth(SLIDES.indexOf(label))
  await expect(slide.locator('canvas')).toBeInViewport({ ratio: 0.99 })
  await expect(
    slide.locator('.share-carousel-slide-label'),
    `${label} label`
  ).toBeInViewport({ ratio: 1 })
  await expect(
    slide.getByRole('button', { name: /^Download/ }),
    `${label} download`
  ).toBeInViewport({ ratio: 1 })
  await expect(page.locator('.share-carousel-dots')).toBeInViewport({
    ratio: 1,
  })
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true)
}

for (const vp of VIEWPORTS) {
  test(`run image popup fits every type at ${vp.width}x${vp.height}`, async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(180_000)
    await openViewer(page, context, vp)
    for (const [i, label] of SLIDES.entries()) {
      if (i > 0) {
        await page.getByRole('button', { name: 'Next style' }).click()
        await page.waitForTimeout(500)
      }
      await expect(
        page.locator('.share-carousel-slide-label').nth(i)
      ).toHaveText(label)
      const box = await page
        .locator('.share-carousel-slide canvas')
        .nth(i)
        .boundingBox()
      console.log(
        `[fit] ${vp.width}x${vp.height} ${label}: canvas ${Math.round(box.width)}x${Math.round(box.height)}`
      )
      await expectAllInView(page, label)
      if (vp.height === 640 && i <= 2) {
        await page.screenshot({
          path: `screenshots/run-image-modal/${vp.width}x${vp.height}-${['hero-poster', 'transparent', 'overlay'][i]}.png`,
        })
      }
    }
  })
}

test('export states (success, error) keep the popup in view at 360x640', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(180_000)
  await openViewer(page, context, { width: 360, height: 640 })
  const download = page.getByTestId('download-hero-poster')

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    download.click(),
  ])
  expect(file.suggestedFilename()).toContain('run-1')
  await expect(download).toHaveClass(/export-btn--success/)
  await expect(download).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: 'screenshots/run-image-modal/state-saved.png' })
  await expect(download).not.toHaveClass(/export-btn--success/, {
    timeout: 5000,
  })

  // Error: the canvas can't produce a file.
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = (cb) => cb(null)
  })
  await download.click()
  await expect(download).toHaveClass(/export-btn--error/, { timeout: 10_000 })
  await expect(download).toBeInViewport({ ratio: 1 })
  await expect(page.locator('.game-run-viewer-close')).toBeInViewport({
    ratio: 1,
  })
  await page.screenshot({ path: 'screenshots/run-image-modal/state-error.png' })
})

test('landscape phone (640x360): popup scrolls, X not clipped, Download stays reachable', async ({
  mockedPage: page,
  context,
}) => {
  test.setTimeout(180_000)
  await openViewer(page, context, { width: 640, height: 360 })
  const overlay = page.locator('.game-run-viewer-overlay')
  const close = page.locator('.game-run-viewer-close')
  expect((await close.boundingBox()).y).toBeGreaterThanOrEqual(0)
  // It overflows, so it must actually scroll (not be clipped).
  expect(
    await overlay.evaluate((el) => el.scrollHeight > el.clientHeight)
  ).toBe(true)
  // Download is sticky: in view without scrolling...
  const download = page.getByTestId('download-hero-poster')
  await expect(download).toBeInViewport({ ratio: 1 })
  // ...and still in view after scrolling to the bottom; the dots are reachable.
  await overlay.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await expect(download).toBeInViewport({ ratio: 1 })
  await expect(page.locator('.share-carousel-dots')).toBeInViewport({
    ratio: 1,
  })
  await overlay.evaluate((el) => el.scrollTo(0, 0))
  expect((await close.boundingBox()).y).toBeGreaterThanOrEqual(0)
})
