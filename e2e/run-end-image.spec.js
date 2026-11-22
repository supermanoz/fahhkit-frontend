import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { ok } from './fixtures/mockApi.js'

// End of a run: rewards sequence -> run image step (dialog "Your run") (the same
// ShareRunCarousel Me -> History uses) -> Done. Mocked run response, route
// and XP. Screenshots: ./screenshots/run-end-image/. (No 03-perk: the perk
// needs a score push over the websocket, which can't be mocked here.)
const OUT = 'screenshots/run-end-image'

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  small: { width: 360, height: 640 },
  desktop: { width: 1440, height: 900 },
}
const MODES = { conquer: {}, pvp: { challengeId: 7 } }

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const [mode, extra] of Object.entries(MODES)) {
    test(`end of run (${mode}, ${vpName})`, async ({ mockedPage: page }) => {
      test.setTimeout(150_000)
      fs.mkdirSync(OUT, { recursive: true })
      await page.setViewportSize(vp)
      await seedSession(page, VETERAN)
      await page.addInitScript((extra) => {
        const now = Date.now()
        const points = Array.from({ length: 40 }, (_, i) => ({
          lat: 27.7172 + 0.002 * Math.sin(i / 6.3),
          lng: 85.324 + 0.002 * Math.cos(i / 6.3) - 0.002,
          timestamp: now - 900000 + i * 20000,
          accuracy: 5,
        }))
        localStorage.setItem(
          'fahhkit_active_run',
          JSON.stringify({
            startedAt: new Date(now - 900000).toISOString(),
            eventId: null,
            challengeId: null,
            clubWarId: null,
            isTraining: false,
            points,
            distance: 3200,
            paused: false,
            pausedMs: 0,
            ...extra,
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
      let saved = false
      await page.route('**/v1/run', (r) => {
        if (r.request().method() !== 'POST') return r.fallback()
        saved = true
        return r.fulfill(ok({ id: 901, avgPace: 4.7 }))
      })
      await page.route('**/v1/territory/profile', (r) =>
        r.fulfill(
          ok({
            ...VETERAN.territoryProfile,
            xp: VETERAN.territoryProfile.xp + (saved ? 120 : 0),
          })
        )
      )
      await page.route('**/v1/territory/event/find', (r) =>
        r.fulfill(
          ok({
            content: [
              {
                eventType: 'CAPTURED',
                areaDeltaSqMeters: 42000,
                occurredAt: new Date(Date.now() + 60000).toISOString(),
              },
            ],
            totalElements: 1,
          })
        )
      )
      await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
        page.getByText('Not now').click()
      )
      await page.goto('/game')
      await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
        timeout: 90_000,
      })
      await page.getByRole('button', { name: /run controls/ }).click()
      await page.locator('.game-run-btn-end').click()
      await page.getByRole('button', { name: 'Yes, End' }).click()
      await page.getByRole('button', { name: /Submit Run/ }).click()

      // Territory/PvP result toast first, then the rewards sequence.
      const card = page.locator('.run-rewards-card')
      const toastBtn = page
        .locator('.run-result-card')
        .getByRole('button', { name: /^(Nice|OK|Got it|Close)/ })
      await expect(toastBtn.or(card).first()).toBeVisible({ timeout: 60_000 })
      if (!(await card.isVisible())) await toastBtn.click()
      await expect(card).toBeVisible({ timeout: 30_000 })
      const dir = `${OUT}/${mode}-${vpName}`
      fs.mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: `${dir}/01-stats.png` })
      await expect(
        page.getByRole('button', { name: 'Next', exact: true })
      ).toBeVisible()
      await page.screenshot({ path: `${dir}/02-xp-and-points.png` })

      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
      await expect(
        page.locator('.run-rewards-image-step canvas').first()
      ).toBeVisible()
      await page.waitForTimeout(600) // slide-in + canvas draw settle
      await page.screenshot({ path: `${dir}/04-run-image.png` })
      // Fits: the card needs no inner scroll, no page overflow.
      const fit = await card.evaluate(
        (el) => el.scrollHeight <= el.clientHeight + 1
      )
      expect(fit).toBe(true)
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        )
      ).toBe(true)

      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(card).toHaveCount(0)
      await page.screenshot({ path: `${dir}/05-after-done.png` })
    })
  }
}
