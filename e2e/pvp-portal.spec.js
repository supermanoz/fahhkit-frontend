import { test, expect, seedSession } from './fixtures/base.js'
import { ok } from './fixtures/mockApi.js'
import { VETERAN } from './mocks/personas.js'
import { scriptGps } from './helpers/gps.js'

// The way into PvP: enterPvp -> rollout/run rules -> location -> Visibility
// gate -> cloud transition -> hub, and the way out. API calls are mocked.
// Screenshots: ./screenshots/pvp-portal/.
const OUT = 'screenshots/pvp-portal'
const ME = VETERAN.user.id
const SMALL = { width: 360, height: 640 }
const PHONE = { width: 390, height: 844 }

const liveRace = () => ({
  id: 'live1',
  challengerId: ME,
  challengerName: 'Veteran Runner',
  opponentId: 'rival-1',
  opponentName: 'Aarav Sharma',
  distanceMeters: 1000,
  stakeAmount: 100,
  source: 'DIRECT',
  status: 'IN_PROGRESS',
  challengerConfirmed: true,
  opponentConfirmed: true,
  challengerRunId: null,
  opponentRunId: null,
  winnerId: null,
  resolutionType: null,
  expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
})

// toggle: 'ok' | 'fail' (HTTP 500) | 'offline' (network error)
async function prep(
  page,
  {
    discoverable = false,
    challenges = [],
    locationDenied = false,
    toggle = 'ok',
  } = {}
) {
  await seedSession(page, VETERAN)
  await scriptGps(page)
  await page.addInitScript((on) => {
    if (on) localStorage.setItem('fahhkit_pvp_discoverable', 'true')
  }, discoverable)
  if (locationDenied) {
    await page.addInitScript(() => {
      const q = navigator.permissions.query.bind(navigator.permissions)
      navigator.permissions.query = (d) =>
        d?.name === 'geolocation' ? Promise.resolve({ state: 'denied' }) : q(d)
    })
  }
  page.toggleCalls = []
  page.toggleMode = toggle
  await page.route('**/v1/pvp/discovery/toggle', (r) => {
    page.toggleCalls.push(r.request().postDataJSON())
    if (page.toggleMode === 'offline') return r.abort('failed')
    if (page.toggleMode === 'fail')
      return r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errorMessage: 'boom' }),
      })
    return r.fulfill(ok(null))
  })
  await page.route('**/v1/run-challenge/find', (r) =>
    r.fulfill(ok({ content: challenges, totalElements: challenges.length }))
  )
  await page.route('**/v1/pvp/queue/status', (r) =>
    r.fulfill(ok(page.queueStatus ?? null))
  )
  await page.route('**/v1/pvp/discovery/**', (r) => r.fulfill(ok([])))
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
}

async function loadGame(page, context, vp = PHONE) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 })
  await page.setViewportSize(vp)
  await page.goto('/game')
  await expect(page.locator('.game-hud-level')).toBeVisible({ timeout: 90_000 })
}

const playPvp = async (page) => {
  await page.locator('.game-menu-btn').click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'PvP', exact: true }).click()
}
const gate = (page) => page.locator('.pvp-gate')
const clouds = (page) => page.locator('.portal-clouds')
const arena = (page) => page.locator('.pvp-arena')

// eslint-disable-next-line no-unused-vars -- a fixture must be destructured
test.beforeEach(async ({ mockedPage: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'one project is enough')
})

test.describe('Visibility gate', () => {
  test('off: the popup explains it truthfully; Not Now closes it and stays on the map (360x640)', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: false })
    await loadGame(page, context, SMALL)
    await playPvp(page)
    await expect(gate(page)).toBeVisible()
    await expect(gate(page).locator('.pvp-gate-title')).toHaveText(
      'Turn on Visibility'
    )
    await expect(gate(page)).toContainText(
      'PvP lets runners challenge each other nearby. Turn on Visibility so rivals can find you.'
    )
    // What others actually see (checked against the backend's nearby response).
    await expect(gate(page).locator('.pvp-gate-info')).toContainText(
      'name, photo, level and how far away you are'
    )
    await expect(gate(page)).toContainText(
      'You can turn it off anytime in Settings.'
    )
    // No false promise about location privacy.
    expect((await gate(page).innerText()).toLowerCase()).not.toMatch(
      /never|exact location|private/
    )
    // No clouds yet.
    await expect(clouds(page)).toHaveCount(0)
    // Buttons: green primary, neutral secondary.
    await expect(page.getByRole('button', { name: 'Turn On' })).toHaveClass(
      /gbtn-primary/
    )
    await expect(page.getByRole('button', { name: 'Not Now' })).toHaveClass(
      /gbtn-neutral/
    )
    await page.screenshot({ path: `${OUT}/gate-visibility-360x640.png` })
    // It was NOT turned on silently.
    expect(page.toggleCalls).toEqual([])
    await page.getByRole('button', { name: 'Not Now' }).click()
    await expect(gate(page)).toHaveCount(0)
    await expect(arena(page)).toHaveCount(0)
    await expect(page.locator('.game-hud-level')).toBeVisible() // still on the map
    expect(page.toggleCalls).toEqual([])
  })

  test('Turn On: calls the same API, shows a spinner, then clouds -> PvP hub within 1.4s of the popup closing', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: false })
    await loadGame(page, context)
    await playPvp(page)
    await page.getByRole('button', { name: 'Turn On' }).click()
    await expect.poll(() => page.toggleCalls).toEqual([{ enabled: true }])
    const t0 = Date.now()
    await expect(clouds(page)).toBeVisible()
    await page.waitForTimeout(560)
    await page.screenshot({ path: `${OUT}/clouds-covering-390x844.png` })
    await expect(arena(page)).toBeVisible({ timeout: 5000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 5000 })
    expect(Date.now() - t0).toBeLessThan(2200) // 1.3s + test overhead
    expect(
      await page.evaluate(() =>
        localStorage.getItem('fahhkit_pvp_discoverable')
      )
    ).toBe('true')
    await page.screenshot({ path: `${OUT}/hub-after-portal-390x844.png` })
  })

  for (const mode of ['fail', 'offline']) {
    test(`Turn On ${mode === 'fail' ? 'API failure' : 'offline'}: friendly retry message, never enters, then retry works`, async ({
      mockedPage: page,
      context,
    }) => {
      test.setTimeout(90_000)
      await prep(page, { discoverable: false, toggle: mode })
      await loadGame(page, context)
      await playPvp(page)
      await page.getByRole('button', { name: 'Turn On' }).click()
      await expect(gate(page).locator('.pvp-gate-error')).toHaveText(
        "Couldn't turn on Visibility. Check your connection and try again."
      )
      await expect(
        page.getByRole('button', { name: 'Try again' })
      ).toBeVisible()
      await expect(clouds(page)).toHaveCount(0)
      await expect(arena(page)).toHaveCount(0)
      expect(
        await page.evaluate(() =>
          localStorage.getItem('fahhkit_pvp_discoverable')
        )
      ).not.toBe('true')
      if (mode === 'fail')
        await page.screenshot({ path: `${OUT}/gate-error-390x844.png` })
      page.toggleMode = 'ok'
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(arena(page)).toBeVisible({ timeout: 8000 })
    })
  }

  test('on already: straight to the clouds, no popup', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true })
    await loadGame(page, context)
    await playPvp(page)
    await expect(clouds(page)).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
    await expect(arena(page)).toBeVisible({ timeout: 5000 })
    expect(page.toggleCalls).toEqual([])
  })
})

test.describe('location + active race', () => {
  test('location denied: "Location is off" popup (web: OK only), no clouds', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true, locationDenied: true })
    await loadGame(page, context)
    await playPvp(page)
    await expect(gate(page).locator('.pvp-gate-title')).toHaveText(
      'Location is off'
    )
    await expect(gate(page)).toContainText('PvP needs your location')
    await expect(page.getByRole('button', { name: 'Turn On' })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Open Settings' })
    ).toHaveCount(0) // native-only
    await page.screenshot({ path: `${OUT}/gate-location-390x844.png` })
    await expect(clouds(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(gate(page)).toHaveCount(0)
    await expect(arena(page)).toHaveCount(0)
  })

  test('a live race still gets in with Visibility off; only starting a new match is gated', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: false, challenges: [liveRace()] })
    await loadGame(page, context)
    await playPvp(page)
    await expect(gate(page)).toHaveCount(0)
    await expect(arena(page)).toBeVisible({ timeout: 6000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 5000 })
    await expect(page.locator('.pvp-race')).toHaveCount(1) // the live race is there
    // Battle = a new match: the Visibility popup, no clouds.
    await page.getByRole('button', { name: 'Battle', exact: true }).click()
    await expect(gate(page).locator('.pvp-gate-title')).toHaveText(
      'Turn on Visibility'
    )
    await expect(clouds(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Turn On' }).click()
    await expect(page.getByText('Pick a distance')).toBeVisible({
      timeout: 5000,
    })
    expect(page.toggleCalls).toEqual([{ enabled: true }])
    await expect(clouds(page)).toHaveCount(0)
  })
})

test.describe('the cloud transition', () => {
  test('rapid taps enter once; input is locked while the clouds are up', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true })
    await loadGame(page, context)
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page
      .getByRole('button', { name: 'PvP', exact: true })
      .click({ clickCount: 3, delay: 15 })
    await expect(clouds(page)).toBeVisible()
    // Whatever is under the centre of the screen is the cloud layer.
    const covered = await page.evaluate(() => {
      const el = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight / 2
      )
      return Boolean(el?.closest('.portal-clouds'))
    })
    expect(covered).toBe(true)
    await expect(arena(page)).toHaveCount(1, { timeout: 5000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 5000 })
    await expect(page.locator('.game-menu-sheet')).toHaveCount(1)
  })

  test('clouds are above everything (HUD, sheets, popups) and cover the safe areas', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true })
    await loadGame(page, context)
    await playPvp(page)
    await expect(clouds(page)).toBeVisible()
    const info = await page.evaluate(() => {
      const c = document.querySelector('.portal-clouds')
      const r = c.getBoundingClientRect()
      const cs = getComputedStyle(c)
      return {
        z: Number(cs.zIndex),
        pos: cs.position,
        w: r.width,
        h: r.height,
        vw: innerWidth,
        vh: innerHeight,
      }
    })
    expect(info.pos).toBe('fixed')
    expect(info.z).toBeGreaterThan(3000)
    expect(info.w).toBe(info.vw)
    expect(info.h).toBe(info.vh)
  })

  test('X leaves PvP through a shorter reverse transition back to the map', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true })
    await loadGame(page, context)
    await playPvp(page)
    await expect(arena(page)).toBeVisible({ timeout: 6000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 5000 })
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Close PvP' }).click()
    await expect(clouds(page)).toBeVisible()
    await expect(arena(page)).toHaveCount(0, { timeout: 3000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 3000 })
    expect(Date.now() - t0).toBeLessThan(1500) // ~0.8s + overhead
    await expect(page.locator('.game-menu-sheet')).toHaveCount(0)
    await expect(page.locator('.game-hud-level')).toBeVisible()
  })

  test('leaving PvP while searching cancels the search', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true })
    let left = 0
    await page.route('**/v1/pvp/queue/join', (r) => {
      page.queueStatus = { status: 'WAITING', mode: 'ONE_KM' }
      return r.fulfill(ok({ status: 'WAITING', mode: 'ONE_KM' }))
    })
    await page.route('**/v1/pvp/queue/leave', (r) => {
      left += 1
      page.queueStatus = null
      return r.fulfill(ok({}))
    })
    await loadGame(page, context)
    await playPvp(page)
    await expect(arena(page)).toBeVisible({ timeout: 6000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 5000 })
    await page.getByRole('button', { name: 'Battle', exact: true }).click()
    await page.locator('.pvp-tier').nth(1).click()
    await page.locator('.pvp-option').nth(0).click()
    await expect(page.getByText('Finding a rival…')).toBeVisible()
    await page.getByRole('button', { name: 'Close PvP' }).click()
    await expect.poll(() => left).toBe(1)
    await expect(arena(page)).toHaveCount(0, { timeout: 4000 })
  })

  test('backgrounding the app mid-transition never leaves clouds stuck', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true })
    await loadGame(page, context)
    await playPvp(page)
    await expect(clouds(page)).toBeVisible()
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(clouds(page)).toHaveCount(0, { timeout: 1000 })
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        value: false,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(arena(page)).toBeVisible()
  })

  test('returning from the background on the PvP page keeps it as it was', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true, challenges: [liveRace()] })
    await loadGame(page, context)
    await playPvp(page)
    await expect(arena(page)).toBeVisible({ timeout: 6000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 5000 })
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'hidden', {
        value: false,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(500)
    await expect(arena(page)).toBeVisible()
    await expect(clouds(page)).toHaveCount(0)
    await expect(page.locator('.pvp-race')).toHaveCount(1)
  })

  test('reduced motion: a quick crossfade (<= 200ms), no sliding clouds', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await prep(page, { discoverable: true })
    await loadGame(page, context)
    await playPvp(page)
    await expect(arena(page)).toBeVisible({ timeout: 3000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 1500 })
    // (The cloud layers are display:none under reduced motion.)
    await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'portal-cloud'
      document.body.appendChild(probe)
      probe.dataset.display = getComputedStyle(probe).display
    })
    expect(
      await page.evaluate(
        () => document.querySelector('.portal-cloud').dataset.display
      )
    ).toBe('none')
  })
})

test.describe('other ways in all use the same gate', () => {
  test('the section picker lists PvP and routes through it', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: false })
    await loadGame(page, context)
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.locator('.game-settings-row').first()).toBeVisible()
    await page.locator('.game-menu-picker-current').click()
    await page.getByRole('option', { name: /PvP/ }).click()
    await expect(gate(page).locator('.pvp-gate-title')).toHaveText(
      'Turn on Visibility'
    )
    await expect(arena(page)).toHaveCount(0)
  })

  test('PvP keeps its own header while other sections keep the dropdown', async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout(90_000)
    await prep(page, { discoverable: true })
    await loadGame(page, context)
    // Another section: the dropdown picker is there.
    await page.locator('.game-menu-btn').click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.locator('.game-menu-picker-knob')).toBeVisible()
    // Through the picker into PvP: static pill, no knob / list.
    await page.locator('.game-menu-picker-current').click()
    await page.getByRole('option', { name: /PvP/ }).click()
    await expect(arena(page)).toBeVisible({ timeout: 6000 })
    await expect(clouds(page)).toHaveCount(0, { timeout: 5000 })
    await expect(page.locator('.game-menu-picker-knob')).toHaveCount(0)
    await expect(
      page.locator('.game-menu-picker-current.is-static h1')
    ).toHaveText('PvP')
  })
})
