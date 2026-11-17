import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { getRunMode, getRunModeLabel } from '../src/utils/runModeLabel.js'

// The run panel's orange header names the mode. A saved in-progress run is
// seeded into localStorage (the tracker resumes it on load), one per mode.
// Screenshots: ./screenshots/run-mode-label/.
const OUT = 'screenshots/run-mode-label'

const CASES = [
  ['conquer', {}, 'Territory Capture'],
  ['pvp', { challengeId: 7 }, 'PvP Battle'],
  ['club-war', { clubWarId: 3 }, 'Club War Run'],
  ['training', { isTraining: true }, 'Training'],
  ['training-paused', { isTraining: true, paused: true }, 'Training · Paused'],
]

test('label helper', () => {
  expect(getRunModeLabel(getRunMode({}))).toBe('Territory Capture')
  expect(getRunModeLabel('boss')).toBe('Boss Fight')
  expect(getRunModeLabel('mystery')).toBe('Running')
  expect(getRunModeLabel(undefined)).toBe('Running')
  expect(getRunModeLabel('training', 'paused')).toBe('Training · Paused')
})

for (const width of [360, 390]) {
  for (const [name, extra, label] of CASES) {
    test(`${name} @${width}`, async ({ mockedPage: page }) => {
      fs.mkdirSync(OUT, { recursive: true })
      test.setTimeout(150_000)
      await page.setViewportSize({ width, height: width === 360 ? 640 : 844 })
      await seedSession(page, VETERAN)
      await page.addInitScript((extra) => {
        const now = Date.now()
        const pt = (i) => ({
          lat: 27.7172 + i * 0.0001,
          lng: 85.324,
          timestamp: now - 600000 + i * 10000,
          accuracy: 5,
        })
        localStorage.setItem(
          'fahhkit_active_run',
          JSON.stringify({
            startedAt: new Date(now - 600000).toISOString(),
            eventId: null,
            challengeId: null,
            clubWarId: null,
            isTraining: false,
            points: [pt(0), pt(1), pt(2)],
            distance: 220,
            paused: false,
            pausedMs: 0,
            ...extra,
            ...(extra.paused
              ? { pausedAt: new Date(now - 5000).toISOString() }
              : {}),
          })
        )
        navigator.geolocation.getCurrentPosition = (ok) =>
          ok({
            coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
            timestamp: Date.now(),
          })
        navigator.geolocation.watchPosition = () => 1
        navigator.geolocation.clearWatch = () => {}
      }, extra)
      await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
        page.getByText('Not now').click()
      )
      await page.goto('/game')
      const status = page.locator('.game-run-card-status')
      await expect(status).toHaveText(label, { timeout: 90_000 })
      await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
        timeout: 90_000,
      })
      // One line, not cut off.
      const fits = await status.evaluate(
        (el) => el.scrollWidth <= el.clientWidth && el.offsetHeight < 30
      )
      expect(fits).toBe(true)
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        )
      ).toBe(true)
      await page.screenshot({ path: `${OUT}/${name}-${width}.png` })
      // Collapsed vs expanded: same header either way.
      await page.getByRole('button', { name: /run controls/ }).click()
      await expect(status).toHaveText(label)
    })
  }
}
