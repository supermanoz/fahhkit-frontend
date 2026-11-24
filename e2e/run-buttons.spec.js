import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Run panel buttons (Pause / End / Discard): one equal-width row, labels never
// truncated, 44px touch targets, at 340-430px. Training has all three; the
// Conquer / PvP / Club War panels use the same row markup with Pause absent
// (checked here by removing it). Screenshots only when RUN_BTN_SHOTS=<dir>.
const WIDTHS = [340, 360, 390, 430]

async function startTraining(page, context, width) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await page.setViewportSize({ width, height: 800 })
  await page.addInitScript(() => {
    const fix = () => ({
      coords: {
        latitude: 27.7172,
        longitude: 85.324,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    })
    navigator.geolocation.getCurrentPosition = (ok) => ok(fix())
    navigator.geolocation.watchPosition = (ok) => {
      setTimeout(() => ok(fix()), 0)
      return setInterval(() => ok(fix()), 1000)
    }
    navigator.geolocation.clearWatch = (id) => clearInterval(id)
  })
  await seedSession(page, VETERAN)
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 60_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Training', exact: true }).click()
  await expect(page.locator('.game-run-card')).toBeVisible({ timeout: 40_000 })
  await page.getByRole('button', { name: 'Show run controls' }).click()
  await expect(page.locator('.game-run-btn-pause')).toBeVisible()
  await page.waitForTimeout(800) // expand animation
}

const measure = (page) =>
  page.evaluate(() => {
    const row = document.querySelector('.game-run-actions')
    const btns = [...row.querySelectorAll('.gbtn')].map((b) => {
      const r = b.getBoundingClientRect()
      const l = b.querySelector('.gbtn-label')
      return {
        text: l.textContent,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
        labelClipped: l.scrollWidth > l.clientWidth + 0.5,
        labelRight: l.getBoundingClientRect().right,
        btnRight: r.right,
        ellipsis: getComputedStyle(l).textOverflow === 'ellipsis',
        iconShown:
          !!b.querySelector('.gbtn-icon') &&
          getComputedStyle(b.querySelector('.gbtn-icon')).display !== 'none',
      }
    })
    return {
      btns,
      vw: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }
  })

function check(m, count, width) {
  expect(m.btns).toHaveLength(count)
  for (const b of m.btns) {
    expect(b.text.length).toBeGreaterThan(2)
    expect(b.labelClipped, `${b.text} clipped at ${width}`).toBe(false)
    expect(b.ellipsis).toBe(false)
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.labelRight).toBeLessThanOrEqual(b.btnRight + 0.5)
    expect(b.right).toBeLessThanOrEqual(m.vw)
  }
  const w0 = m.btns[0].width
  for (const b of m.btns) expect(Math.abs(b.width - w0)).toBeLessThan(1.5)
  for (let i = 1; i < m.btns.length; i++)
    expect(Math.round(m.btns[i].left - m.btns[i - 1].right)).toBe(8)
  expect(m.scroll).toBeLessThanOrEqual(m.vw)
}

test.describe('run buttons fit', () => {
  test.setTimeout(150_000)
  // eslint-disable-next-line no-empty-pattern -- a fixture arg is required before testInfo
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'sets its own widths')
  })
  for (const width of WIDTHS) {
    test(`Training Pause/End/Discard, then End/Discard only (${width}px)`, async ({
      mockedPage: page,
      context,
    }) => {
      await startTraining(page, context, width)
      const three = await measure(page)
      check(three, 3, width)
      expect(three.btns.map((b) => b.text)).toEqual(['Pause', 'End', 'Discard'])
      if (process.env.RUN_BTN_SHOTS)
        await page.screenshot({
          path: `${process.env.RUN_BTN_SHOTS}/run-${width}-3.png`,
        })
      // Conquer / PvP / Club War: the same row without Pause.
      await page.evaluate(() =>
        document.querySelector('.game-run-btn-pause').remove()
      )
      const two = await measure(page)
      check(two, 2, width)
      // Discard still asks first.
      await page.getByRole('button', { name: 'Discard', exact: true }).click()
      await expect(page.getByText(/Discard this run\?/)).toBeVisible()
    })
  }
})
