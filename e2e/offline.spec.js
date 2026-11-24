import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { ok } from './fixtures/mockApi.js'

// Offline mode end to end (see installNetworkGate for how "offline" is faked).
// Screenshots (when OFFLINE_SHOTS is set) go to screenshots/offline/.
const SHOTS = process.env.OFFLINE_SHOTS || ''

async function grantGeolocation(page) {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 27.7172, longitude: 85.324 })
}

// Run-recording tests: a scriptable GPS stream (window.__gps).
async function mockGeolocation(page) {
  await grantGeolocation(page)
  await page.addInitScript(() => {
    const watchers = new Map()
    let id = 1
    navigator.geolocation.getCurrentPosition = (cb) =>
      cb({
        coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
        timestamp: Date.now(),
      })
    navigator.geolocation.watchPosition = (cb) => {
      watchers.set(id, cb)
      // a first fix right away (the map waits for one before it is "ready")
      setTimeout(
        () =>
          cb({
            coords: {
              latitude: 27.7172,
              longitude: 85.324,
              accuracy: 5,
              speed: 0,
            },
            timestamp: Date.now(),
          }),
        50
      )
      return id++
    }
    navigator.geolocation.clearWatch = (i) => watchers.delete(i)
    window.__gps = (lat, lng) =>
      watchers.forEach((cb) =>
        cb({
          coords: { latitude: lat, longitude: lng, accuracy: 5, speed: 3 },
          timestamp: Date.now(),
        })
      )
  })
}

async function seedClosedRun(page) {
  await mockGeolocation(page)
  await page.addInitScript(() => {
    // Seed once per tab (a reload must NOT re-seed - see the recovery test).
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    const now = Date.now()
    const n = 40
    const points = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI
      return {
        lat: 27.7172 + 0.002 * Math.sin(a),
        lng: 85.324 + 0.002 * Math.cos(a) - 0.002,
        timestamp: now - 900000 + i * 20000,
        accuracy: 5,
      }
    })
    points[n - 1] = { ...points[0], timestamp: points[n - 1].timestamp }
    localStorage.setItem(
      'fahhkit_active_run',
      JSON.stringify({
        startedAt: new Date(now - 900000).toISOString(),
        eventId: null,
        challengeId: null,
        clubWarId: null,
        isTraining: false,
        clientRunId: 'run-e2e-0001',
        points,
        distance: 2800,
        paused: false,
        pausedMs: 0,
      })
    )
  })
}

// Mocks POST /v1/run: `behaviour(n, body)` -> a Playwright fulfill/abort action.
async function mockRunApi(page, behaviour) {
  const calls = []
  await page.route('**/v1/run', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    const body = r.request().postDataJSON()
    calls.push(body.clientRunId)
    const out = behaviour(calls.length, body)
    if (out === 'abort') return r.abort('internetdisconnected')
    return r.fulfill(out)
  })
  return calls
}

// Registered LAST so it wins: while offline every /v1 call fails like a dead
// connection (the app's own probe included).
async function installNetworkGate(page) {
  // NOT context.setOffline(): on the dev server that also kills Vite's HMR
  // websocket, which makes the page reload itself. Instead every /v1 call
  // fails like a dead connection (the app's own reachability probe included)
  // and the browser's own offline/online events are fired.
  page.allowFailedRequests = true // dead-connection calls are the point here
  const net = { offline: false }
  await page.route('**/v1/**', (r) =>
    net.offline ? r.abort('internetdisconnected') : r.fallback()
  )
  return {
    async goOffline() {
      net.offline = true
      await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    },
    async goOnline() {
      net.offline = false
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
    },
  }
}

async function openGame(page) {
  await seedSession(page, VETERAN)
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  // The HUD only exists once the loading screen is really done (the menu
  // button can't be used: a run in progress replaces it with the run card).
  await expect(page.locator('.game-hud')).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
}

const banner = (page) => page.getByTestId('connection-banner')
const shot = async (page, testInfo, name) => {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({
    path: `${SHOTS}/${name}-${testInfo.project.name}.png`,
  })
}

async function endRunAndSave(page) {
  await page.getByRole('button', { name: /run controls/ }).click()
  await page.locator('.game-run-btn-end').click()
  await page.getByRole('button', { name: 'Yes, End' }).click()
}

async function openMeTab(page) {
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('button', { name: 'Me', exact: true }).click()
}

test.describe('offline mode', () => {
  test('banner: none while online, offline pill, then "Back online" that slides away', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(120_000)
    await mockGeolocation(page)
    const gate = await installNetworkGate(page)
    await openGame(page)
    await expect(banner(page)).toHaveCount(0)

    await gate.goOffline()
    await expect(banner(page)).toHaveAttribute('data-state', 'offline', {
      timeout: 15_000,
    })
    await expect(banner(page)).toContainText(
      "You're offline - runs are saved on your phone"
    )
    await page.waitForTimeout(600) // slide-in finished
    await shot(page, testInfo, '1-banner-offline')
    // stays while offline
    await page.waitForTimeout(3500)
    await expect(banner(page)).toHaveAttribute('data-state', 'offline')

    await gate.goOnline()
    await expect(banner(page)).toHaveAttribute('data-state', 'back', {
      timeout: 20_000,
    })
    await expect(banner(page)).toContainText('Back online')
    await page.waitForTimeout(400)
    await shot(page, testInfo, '2-banner-back-online')
    await expect(banner(page)).toHaveCount(0, { timeout: 8_000 })
  })

  test('online-only menu entries are shaded and say "Needs internet"; Me/Settings still open', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(120_000)
    await mockGeolocation(page)
    const gate = await installNetworkGate(page)
    await openGame(page)
    await gate.goOffline()
    await expect(banner(page)).toHaveAttribute('data-state', 'offline', {
      timeout: 15_000,
    })
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.waitForTimeout(900) // radial spring-in
    for (const name of ['Leaderboard', 'Shop', 'Mail', 'Club']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveClass(
        /is-offline-locked/
      )
    }
    await expect(
      page.getByRole('button', { name: 'Me', exact: true })
    ).not.toHaveClass(/is-offline-locked/)
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true })
    ).not.toHaveClass(/is-offline-locked/)
    await shot(page, testInfo, '4-shaded-menu')
    // aria-disabled (not `disabled`): a real tap works and explains itself
    await page
      .getByRole('button', { name: 'Leaderboard', exact: true })
      .click({ force: true })
    await expect(page.getByText('Needs internet')).toBeVisible()
    await expect(page.locator('.game-menu-sheet')).toHaveCount(0)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.locator('.game-menu-sheet')).toBeVisible()
  })

  test('record offline -> "Run saved" -> auto-upload once when back online (a forced retry never duplicates)', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(170_000)
    await seedClosedRun(page)
    // 1st attempt: the connection dies mid-upload (server may have it, the
    // answer is lost). 2nd: succeeds. The server dedups on clientRunId.
    const created = new Set()
    const calls = await mockRunApi(page, (n, body) => {
      if (n === 1) return 'abort'
      created.add(body.clientRunId)
      return ok({ id: 901, avgPace: 4.7 })
    })
    const gate = await installNetworkGate(page)
    await openGame(page)
    await gate.goOffline()
    await expect(banner(page)).toHaveAttribute('data-state', 'offline', {
      timeout: 15_000,
    })

    await endRunAndSave(page)
    const popup = page.getByRole('dialog').filter({ hasText: 'Run saved' })
    await expect(popup).toBeVisible()
    await expect(popup.getByTestId('offline-saved-status')).toHaveText(
      /Waiting for internet to submit/
    )
    await expect(popup).toContainText(
      'Turn on Wi-Fi or mobile data to submit your run and get XP/territory'
    )
    await expect(popup).toContainText('pending')
    await expect(popup.getByTestId('offline-saved-stats')).toContainText(
      'Distance'
    )
    await shot(page, testInfo, '3-run-saved-popup')
    await popup.getByTestId('offline-saved-ok').click()
    expect(calls).toHaveLength(0) // nothing sent while offline

    // Pending runs list: waiting
    await openMeTab(page)
    const pending = page.getByTestId('pending-runs')
    await expect(pending).toBeVisible()
    await expect(pending.locator('[data-status="waiting"]')).toHaveCount(1)
    await pending.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await shot(page, testInfo, '5-pending-runs-waiting')

    // Back online: it uploads by itself. Attempt 1 is lost, backoff, attempt 2 lands.
    await gate.goOnline()
    await expect.poll(() => created.size, { timeout: 60_000 }).toBe(1)
    await expect(pending.locator('[data-status="done"]')).toHaveCount(1, {
      timeout: 30_000,
    })
    // every attempt carried the SAME idempotency key; the server created it once
    expect(new Set(calls)).toEqual(new Set(['run-e2e-0001']))
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(created.size).toBe(1)
    await expect(page.getByText('Your offline run was submitted')).toBeVisible()
    // nothing more is sent afterwards (done runs are never re-sent)
    const settled = calls.length
    await gate.goOffline()
    await gate.goOnline()
    await page.waitForTimeout(4000)
    expect(calls.length).toBe(settled)
  })

  test('a permanent 4xx marks the run failed with the reason; Retry sends it again', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(170_000)
    await seedClosedRun(page)
    let reject = true
    const calls = await mockRunApi(page, () =>
      reject
        ? {
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              errorMessage: 'Run rejected: pace not humanly possible',
            }),
          }
        : ok({ id: 902, avgPace: 4.7 })
    )
    const gate = await installNetworkGate(page)
    await openGame(page)
    await gate.goOffline()
    await expect(banner(page)).toHaveAttribute('data-state', 'offline', {
      timeout: 15_000,
    })
    await endRunAndSave(page)
    await page.getByTestId('offline-saved-ok').click()
    await gate.goOnline()
    await openMeTab(page)
    const failed = page
      .getByTestId('pending-runs')
      .locator('[data-status="failed"]')
    await expect(failed).toHaveCount(1, { timeout: 60_000 })
    await expect(failed).toContainText(
      'Run rejected: pace not humanly possible'
    )
    await failed.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await shot(page, testInfo, '6-pending-runs-failed')
    // never retried automatically
    await page.waitForTimeout(6000)
    expect(calls).toHaveLength(1)
    // Retry works
    reject = false
    await failed.getByRole('button', { name: 'Retry' }).click()
    await expect(
      page.getByTestId('pending-runs').locator('[data-status="done"]')
    ).toHaveCount(1, { timeout: 30_000 })
    expect(calls).toHaveLength(2)
  })

  test('an interrupted run is recovered from IndexedDB after the app is killed and localStorage is gone', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await seedClosedRun(page)
    await installNetworkGate(page)
    await openGame(page)
    // the tracker keeps the durable mirror up to date as fixes arrive
    await page.evaluate(() => window.__gps(27.7172, 85.324))
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise((resolve) => {
                const req = indexedDB.open('fahhkit-offline')
                req.onerror = () => resolve(false)
                req.onsuccess = () => {
                  try {
                    const g = req.result
                      .transaction('activeRun')
                      .objectStore('activeRun')
                      .get('current')
                    g.onsuccess = () =>
                      resolve(Boolean(g.result?.points?.length))
                    g.onerror = () => resolve(false)
                  } catch {
                    resolve(false)
                  }
                }
              })
          ),
        { timeout: 20_000 }
      )
      .toBe(true)
    // "app killed" + the WebView lost localStorage's run record
    await page.evaluate(() => localStorage.removeItem('fahhkit_active_run'))
    await page.reload()
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 90_000,
    })
    // The run is back: the tracker resumed it (End is available again).
    await page.getByRole('button', { name: /run controls/ }).click()
    await expect(page.locator('.game-run-btn-end')).toBeVisible()
  })
})
