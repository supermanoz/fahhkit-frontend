import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { ok } from './fixtures/mockApi.js'

// The real GamePage, end to end, for every mode: result card (stats) ->
// rewards (stats, XP bar filling, level-up) -> run image slide -> Done.
// Asserts the ORDER (the image never shows before the XP/rewards finish, never
// layered on the result card, never twice) and that nothing leaves the player
// stuck. Screenshots (390 only) go to PRE_RUN_SHOTS, default: the OS temp dir.
const SHOTS = process.env.POST_RUN_SHOTS || ''

// Level curve: floor(level) = 100 * (level - 1)^2 (utils/territoryGame.js).
const MODES = {
  training: { extra: { isTraining: true }, after: { level: 14, xp: 18000 } },
  conquer: { extra: {}, after: { level: 14, xp: 18000 } },
  pvp: { extra: { challengeId: 7 }, after: { level: 14, xp: 18000 } },
  war: { extra: { clubWarId: 'war-1' }, after: { level: 14, xp: 18000 } },
  'conquer-levelup': {
    extra: {},
    before: { level: 14, xp: 19400 },
    after: { level: 15, xp: 19800 },
  },
}
const BEFORE = { level: 14, xp: 17000 }

for (const [mode, cfg] of Object.entries(MODES)) {
  test(`post-run sequence: ${mode}`, async ({ mockedPage: page }, testInfo) => {
    test.setTimeout(170_000)
    const shot = async (name) => {
      if (!SHOTS || testInfo.project.name !== 'mobile-390') return
      fs.mkdirSync(`${SHOTS}/${mode}`, { recursive: true })
      await page.screenshot({ path: `${SHOTS}/${mode}/${name}.png` })
    }
    const before = cfg.before || BEFORE
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
      navigator.geolocation.getCurrentPosition = (cb) =>
        cb({
          coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
          timestamp: Date.now(),
        })
      navigator.geolocation.watchPosition = () => 1
      navigator.geolocation.clearWatch = () => {}
    }, cfg.extra)
    let saved = false
    let runPosts = 0
    await page.route('**/v1/run', (r) => {
      if (r.request().method() !== 'POST') return r.fallback()
      saved = true
      runPosts += 1
      return r.fulfill(ok({ id: 901, avgPace: 4.7 }))
    })
    await page.route('**/v1/territory/profile', (r) =>
      r.fulfill(
        ok({
          ...VETERAN.territoryProfile,
          ...(saved ? cfg.after : before),
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

    const resultCard = page.locator('.run-result-card')
    const rewards = page.locator('.run-rewards-card')
    const imageDialog = page.getByRole('dialog', { name: 'Your run' })

    // 1) Result card with the run's stats. No rewards/image under or beside it.
    await expect(resultCard).toBeVisible({ timeout: 30_000 })
    await expect(
      resultCard.getByText('Distance', { exact: true })
    ).toBeVisible()
    await expect(resultCard.getByText('Pace', { exact: true })).toBeVisible()
    await expect(resultCard.getByText('Time', { exact: true })).toBeVisible()
    await expect(rewards).toHaveCount(0)
    await shot('1-stats')
    const dismiss = resultCard.getByRole('button', {
      name: /^(Nice|OK|Got it)$/,
    })
    // Conquer shows "Checking your territory..." first (no button yet).
    await expect(dismiss).toBeVisible({ timeout: 60_000 })
    await dismiss.click()
    await expect(resultCard).toHaveCount(0)

    // 2) Rewards sequence: XP first - the run image is NOT shown yet and no
    //    Next/Done exists until the animation has finished.
    await expect(rewards).toBeVisible({ timeout: 30_000 })
    await expect(imageDialog).toHaveCount(0)
    await expect(page.locator('.run-rewards-xp-gained')).toBeVisible({
      timeout: 5_000,
    })
    if (mode === 'conquer-levelup') {
      await expect(page.getByText('Level 15!')).toBeVisible({ timeout: 5_000 })
      await shot('3-level-up')
    } else {
      await page.waitForTimeout(300)
      await shot('2-xp-midway')
    }
    await expect(page.locator('.run-rewards-image-step')).toBeHidden()
    // The XP really counted up (not stuck at +0).
    await expect(
      page.getByRole('button', { name: 'Next', exact: true })
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.run-rewards-xp-gained')).not.toHaveText('+0 XP')

    // 3) Image slide, only after "Next".
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(imageDialog).toBeVisible()
    await expect(
      page.locator('.run-rewards-image-step canvas').first()
    ).toBeVisible()
    await page.waitForTimeout(600)
    await shot('4-run-image')
    // Slides: Transparent Route / Overlay / map card, each with its own
    // Download PNG. The first one is the visible slide.
    const download = page.getByTestId('download-hero-poster')
    await expect(download).toBeVisible()
    await expect(download).toHaveText('Download PNG')
    await expect(download).toBeEnabled()
    await download.click()
    await expect(download).toHaveAttribute('data-state', /loading|success/, {
      timeout: 5_000,
    })
    await shot('5-download-state')
    await expect(download).toHaveAttribute('data-state', 'idle', {
      timeout: 15_000,
    })
    await expect(
      imageDialog.getByRole('button', { name: 'Close', exact: true })
    ).toBeVisible()

    // 4) Done returns to the map, and nothing re-opens (not twice).
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(rewards).toHaveCount(0)
    await page.waitForTimeout(1500)
    await expect(rewards).toHaveCount(0)
    await expect(resultCard).toHaveCount(0)
    await expect(page.locator('.game-menu-btn')).toBeVisible()
    expect(runPosts).toBe(1)
  })
}
