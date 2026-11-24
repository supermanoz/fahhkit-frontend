import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Play menu: Conquer, Training, PvP - in that order, evenly spaced and centred,
// on 360 and 390 wide screens. PvP is violet; offline it is shaded ("Needs
// internet"). Screenshots go to PLAY_MENU_SHOTS when set.
const SHOTS = process.env.PLAY_MENU_SHOTS || ''

async function openPlay(page) {
  await seedSession(page, VETERAN)
  // Scripted GPS: real Chrome geolocation never calls back in this setup.
  await page.addInitScript(() => {
    const fix = () => ({
      coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
      timestamp: Date.now(),
    })
    navigator.geolocation.getCurrentPosition = (ok) => ok(fix())
    navigator.geolocation.watchPosition = (ok) => {
      setTimeout(() => ok(fix()), 50)
      return 1
    }
    navigator.geolocation.clearWatch = () => {}
  })
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-hud')).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.game-radial-btn')).toHaveCount(3)
  await page.waitForTimeout(900) // springs settle
}

const box = (page, name) =>
  page.getByRole('button', { name, exact: true }).boundingBox()

test.describe('Play menu', () => {
  test.setTimeout(150_000)

  test('Conquer, Training, PvP: in order, evenly spaced, centred, inside the screen', async ({
    mockedPage: page,
  }, testInfo) => {
    await openPlay(page)
    const [c, t, p] = [
      await box(page, 'Conquer'),
      await box(page, 'Training'),
      await box(page, 'PvP'),
    ]
    const vw = page.viewportSize().width
    // order left -> right
    expect(c.x).toBeLessThan(t.x)
    expect(t.x).toBeLessThan(p.x)
    // evenly spaced (centre to centre) and no overlap
    const cx = (b) => b.x + b.width / 2
    expect(Math.abs(cx(t) - cx(c) - (cx(p) - cx(t)))).toBeLessThan(2)
    expect(c.x + c.width).toBeLessThan(t.x)
    expect(t.x + t.width).toBeLessThan(p.x)
    // centred on the screen, fully visible
    expect(Math.abs(cx(t) - vw / 2)).toBeLessThan(3)
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(p.x + p.width).toBeLessThanOrEqual(vw)
    // distinct colours
    const bg = (n) =>
      page
        .getByRole('button', { name: n, exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    const colours = new Set([
      await bg('Conquer'),
      await bg('Training'),
      await bg('PvP'),
    ])
    expect(colours.size).toBe(3)
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({
        path: `${SHOTS}/play-menu-${testInfo.project.name}.png`,
      })
    }
  })

  test('tapping PvP opens the existing PvP flow', async ({
    mockedPage: page,
  }) => {
    await openPlay(page)
    await page.getByRole('button', { name: 'PvP', exact: true }).click()
    // First time: the existing Visibility gate; once on: the arena/portal.
    await expect(
      page
        .getByText('Turn on Visibility')
        .or(page.locator('.pvp-arena, .portal-clouds'))
        .first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('offline: PvP is shaded and answers "Needs internet"', async ({
    mockedPage: page,
  }, testInfo) => {
    await openPlay(page)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    page.allowFailedRequests = true
    await page.route('**/v1/**', (r) => r.abort('internetdisconnected'))
    await expect(
      page.getByRole('button', { name: 'PvP', exact: true })
    ).toHaveClass(/is-offline-locked/, { timeout: 30_000 })
    // aria-disabled buttons are not "actionable" for Playwright: force the tap.
    await page
      .getByRole('button', { name: 'PvP', exact: true })
      .click({ force: true })
    await expect(page.getByText(/needs internet/i).first()).toBeVisible()
    await expect(page.locator('.pvp-arena')).toHaveCount(0)
    if (SHOTS) {
      await page.screenshot({
        path: `${SHOTS}/play-menu-offline-${testInfo.project.name}.png`,
      })
    }
  })

  test('section drop-down: no PvP row, others intact and evenly spaced; PvP stays in the Play menu', async ({
    mockedPage: page,
  }, testInfo) => {
    await openPlay(page)
    // PvP is in the round Play menu...
    await expect(
      page.getByRole('button', { name: 'PvP', exact: true })
    ).toBeVisible()
    // ...and the drop-down of the menu sections does not list it.
    await page.locator('.game-menu-btn').click() // close the menu...
    await expect(page.locator('.game-radial-btn')).toHaveCount(0)
    await page.locator('.game-menu-btn').click() // ...and open it fresh
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
    await expect(page.locator('.game-menu-sheet')).toBeVisible()
    await page.locator('.game-menu-picker-current').click()
    const options = page.locator('.game-menu-picker-option')
    await expect(options.first()).toBeVisible()
    await page.waitForTimeout(900) // list animation
    const labels = await options
      .locator('.game-menu-picker-label')
      .allInnerTexts()
    expect(labels).toEqual([
      'Leaderboard',
      'Club',
      'Mail',
      'Me',
      'Shop',
      'Settings',
    ])
    expect(labels).not.toContain('PvP')
    // no gap where PvP used to be: equal step between neighbouring rows
    const ys = []
    for (const o of await options.all()) ys.push((await o.boundingBox()).y)
    const steps = ys.slice(1).map((y, i) => Math.round(y - ys[i]))
    expect(new Set(steps).size).toBe(1)
    // default/current selection is marked, and other rows still navigate
    await expect(options.first()).toHaveClass(/active/)
    if (process.env.PLAY_MENU_SHOTS) {
      await page.screenshot({
        path: `${process.env.PLAY_MENU_SHOTS}/dropdown-${testInfo.project.name}.png`,
      })
    }
    await options.filter({ hasText: 'Mail' }).click()
    await expect(page.locator('.game-menu-picker-current')).toContainText(
      'Mail'
    )
  })
})
