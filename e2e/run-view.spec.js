import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Regression coverage for two run-view bugs:
//  1. The player's character marker going invisible mid-run - root cause
//     was TerritoryMap.jsx's {playerLocation && <PlayerMarker/>} unmounting
//     (and losing its tween state) on a single falsy/dropped position,
//     fixed by holding the last known fix in a ref and always rendering
//     once any fix has ever arrived (see TerritoryMap.jsx's
//     lastKnownLocationRef). This test can't fabricate a real dropped GPS
//     fix or a backgrounded tab from Playwright, so it covers the part
//     that's actually testable end-to-end: the marker renders immediately
//     once a run starts and stays visible/in the DOM across live GPS
//     updates, never disappearing between fixes.
//  2. The recenter (follow) button overlapping the run stats card's
//     expand/collapse control - verified NOT currently reproducible (see
//     session notes), but this guards the geometry the brief asked for
//     anyway: the button always sits clear above the card, collapsed or
//     expanded.
async function startTrainingRun(page, context) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await seedSession(page, VETERAN)
  await page.goto('/game')
  // The overlay is absent before it first mounts, so "hidden" alone can
  // pass too early - require it to stay gone, then the HUD.
  let goneSince = null
  await expect
    .poll(
      async () => {
        if ((await page.locator('.game-loading-overlay').count()) > 0) {
          goneSince = null
          return false
        }
        goneSince ??= Date.now()
        return Date.now() - goneSince > 2500
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe(true)
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 20_000 })
  await page
    .getByText('Not now')
    .click({ timeout: 2500 })
    .catch(() => {})
  // Training lives under the radial Play menu now (not the tab switcher).
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Training', exact: true }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('.game-run-card')).toBeVisible({ timeout: 30_000 })
}

test.describe('Run view - character marker and recenter button', () => {
  test('player marker stays visible through live GPS updates during a run', async ({
    mockedPage: page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await startTrainingRun(page, context)

    const marker = page.locator('.territory-map-player-icon')
    await expect(marker).toBeVisible()
    await expect(marker).toHaveCount(1)

    // A handful of real GPS fixes in a row - the marker must never drop out
    // of the DOM between any of them (that's exactly the bug: a dropped/
    // falsy fix used to unmount it).
    const base = { latitude: 27.7172, longitude: 85.324 }
    for (let i = 1; i <= 4; i++) {
      await context.setGeolocation({
        latitude: base.latitude + i * 0.00005,
        longitude: base.longitude + i * 0.00005,
      })
      await page.waitForTimeout(300)
      await expect(marker).toBeVisible()
      await expect(marker).toHaveCount(1)
    }
  })

  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [430, 932],
  ]) {
    test(`recenter button never overlaps the run card header at ${width}px`, async ({
      mockedPage: page,
      context,
    }) => {
      await page.setViewportSize({ width, height })
      await startTrainingRun(page, context)

      const locateBox = await page.locator('.game-locate-btn').boundingBox()
      const headerBox = await page
        .locator('.game-run-card-header')
        .boundingBox()
      expect(locateBox.y + locateBox.height).toBeLessThanOrEqual(headerBox.y)

      await page.locator('.game-run-card-header').click()
      await page.waitForTimeout(400)
      const locateBoxExpanded = await page
        .locator('.game-locate-btn')
        .boundingBox()
      const headerBoxExpanded = await page
        .locator('.game-run-card-header')
        .boundingBox()
      expect(
        locateBoxExpanded.y + locateBoxExpanded.height
      ).toBeLessThanOrEqual(headerBoxExpanded.y)
    })
  }
})
