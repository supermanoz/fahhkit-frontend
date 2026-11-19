import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Hero marker and map centre must come from the same fix: after the intro,
// after a recenter, and after a position change.
const OUT = 'screenshots/location-sync'
const A = { latitude: 27.7172, longitude: 85.324, accuracy: 10 }
const B = { latitude: 27.7185, longitude: 85.3262, accuracy: 10 }

async function offsets(page) {
  return page.evaluate(() => {
    const map = document
      .querySelector('.leaflet-container')
      .getBoundingClientRect()
    const hero = document
      .querySelector('.territory-map-player-icon')
      .getBoundingClientRect()
    return {
      dx: Math.round(hero.left + hero.width / 2 - (map.left + map.width / 2)),
      dy: Math.round(hero.bottom - (map.top + map.height / 2)),
    }
  })
}

test('hero and map share one position', async ({
  mockedPage: page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(A)
  await seedSession(page, VETERAN)
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toBeHidden({
    timeout: 40_000,
  })
  await expect(page.locator('.territory-map-player-icon').first()).toBeVisible()
  await expect(page.locator('.game-loading-bg-img')).toHaveCount(0, {
    timeout: 15_000,
  })
  await expect(page.getByText('Zeroing in on your turf')).toHaveCount(0, {
    timeout: 20_000,
  })
  await page.waitForTimeout(1500)
  const o1 = await offsets(page)
  console.log('after intro', o1)
  expect(Math.abs(o1.dx)).toBeLessThanOrEqual(3)
  await page.screenshot({ path: `${OUT}/1-after-intro.png` })

  // Pan away, then recenter.
  const box = await page.locator('.leaflet-container').boundingBox()
  const sx = box.x + box.width / 2
  const sy = box.y + 160
  await page.evaluate(
    ([x, y]) => {
      const el = document.querySelector('.leaflet-container')
      const fire = (target, type, dx, dy) =>
        target.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            button: 0,
            buttons: 1,
            clientX: x + dx,
            clientY: y + dy,
          })
        )
      fire(el, 'mousedown', 0, 0)
      for (let i = 1; i <= 8; i++) fire(el, 'mousemove', i * 15, i * 20)
      fire(el, 'mouseup', 120, 160)
    },
    [sx, sy]
  )
  await page.waitForTimeout(300)
  const away = await offsets(page)
  expect(Math.abs(away.dx) + Math.abs(away.dy)).toBeGreaterThan(60)
  await page.locator('.territory-map-locate').click()
  await page.waitForTimeout(600)
  const o2 = await offsets(page)
  console.log('after recenter', o2)
  expect(Math.abs(o2.dx)).toBeLessThanOrEqual(3)
  expect(Math.abs(o2.dy - o1.dy)).toBeLessThanOrEqual(3)
  await page.screenshot({ path: `${OUT}/2-after-recenter.png` })

  // Position change, then recenter again.
  await context.setGeolocation(B)
  await page.waitForTimeout(2500)
  await page.locator('.territory-map-locate').click()
  await page.waitForTimeout(700)
  const o3 = await offsets(page)
  console.log('after move', o3)
  expect(Math.abs(o3.dx)).toBeLessThanOrEqual(3)
  expect(Math.abs(o3.dy - o1.dy)).toBeLessThanOrEqual(3)
  await page.screenshot({ path: `${OUT}/3-after-move.png` })

  // Zoom all the way in: never tilts, hero stays upright.
  const c = await page.locator('.leaflet-container').boundingBox()
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400)
  await page.waitForTimeout(1200)
  await expect(page.locator('.territory-map-tilt.is-close-in')).toHaveCount(0)
  const tf = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.territory-map-tilt')).transform
  )
  console.log('tilt transform at max zoom', tf)
  expect(tf).toBe('none')
})
