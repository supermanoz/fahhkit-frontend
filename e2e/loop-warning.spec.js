import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { ok } from './fixtures/mockApi.js'

// "Loop not closed yet": ending a CONQUER run whose path hasn't come back near
// its start shows a warning INSTEAD of "End this run?". Training/PvP/War and a
// closed loop keep the normal confirm. GPS is mocked: the run is restored from
// a seeded active run and further fixes are pushed through window.__gps(lat,lng).
// Screenshots (360 + 390 projects) go to LOOP_WARNING_SHOTS when set.
const SHOTS = process.env.LOOP_WARNING_SHOTS || ''

// 'open' = half circle (ends ~440 m from where it began), 'closed' = full loop.
async function seedRun(page, { shape, extra = {} }) {
  await page.addInitScript(
    ({ shape, extra }) => {
      const now = Date.now()
      const n = shape === 'open' ? 20 : 40
      const end =
        shape === 'open'
          ? Math.PI
          : shape === 'almost'
            ? 2 * Math.PI - 0.18 // ends ~40 m short of the start
            : 2 * Math.PI
      const points = Array.from({ length: n }, (_, i) => {
        const a = (i / (n - (shape === 'closed' ? 0 : 1))) * end
        return {
          lat: 27.7172 + 0.002 * Math.sin(a),
          lng: 85.324 + 0.002 * Math.cos(a) - 0.002,
          timestamp: now - 900000 + i * 20000,
          accuracy: 5,
        }
      })
      // closed: last point lands on the first
      if (shape === 'closed')
        points[n - 1] = { ...points[0], timestamp: points[n - 1].timestamp }
      localStorage.setItem(
        'fahhkit_active_run',
        JSON.stringify({
          startedAt: new Date(now - 900000).toISOString(),
          eventId: null,
          challengeId: null,
          clubWarId: null,
          isTraining: false,
          points,
          distance: shape === 'open' ? 1400 : 2800,
          paused: false,
          pausedMs: 0,
          ...extra,
        })
      )
      window.__ends = { first: points[0], last: points[n - 1] }
      const watchers = new Map()
      let nextId = 1
      navigator.geolocation.getCurrentPosition = (ok) =>
        ok({
          coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
          timestamp: Date.now(),
        })
      // Several parts of the app watch the position (the map's own dot AND the
      // run tracker): every fix goes to all of them.
      navigator.geolocation.watchPosition = (ok) => {
        const id = nextId++
        watchers.set(id, ok)
        return id
      }
      navigator.geolocation.clearWatch = (id) => watchers.delete(id)
      // Push one fix (about a running pace apart when called ~1/s).
      window.__gps = (lat, lng) =>
        watchers.forEach((cb) =>
          cb({
            coords: { latitude: lat, longitude: lng, accuracy: 5, speed: 3 },
            timestamp: Date.now(),
          })
        )
    },
    { shape, extra }
  )
}

async function openGame(page, shape, extra) {
  await seedSession(page, VETERAN)
  await seedRun(page, { shape, extra })
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
  await page.getByRole('button', { name: /run controls/ }).click()
}

const warning = (page) =>
  page.getByRole('dialog').filter({ hasText: 'Loop not closed yet' })
const normalConfirm = (page) => page.getByText('End this run?')
const km = async (page) => {
  const t = await page.getByTestId('loop-warning-stats').innerText()
  return (
    parseFloat(t.split('·')[0].replace(/[^\d.]/g, '')) *
    (/\bkm\b/.test(t) ? 1000 : 1)
  )
}

test.describe('loop-not-closed warning', () => {
  test('(a) open Conquer path: warning, Keep Running continues, distance keeps growing', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const shot = async (n) => {
      if (!SHOTS) return
      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({
        path: `${SHOTS}/${n}-${testInfo.project.name}.png`,
      })
    }
    await openGame(page, 'open')
    await page.locator('.game-run-btn-end').click()
    await expect(warning(page)).toBeVisible()
    await expect(normalConfirm(page)).toHaveCount(0) // never two popups
    await expect(
      page.getByRole('button', { name: 'Keep Running' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'End Anyway' })).toBeVisible()
    await expect(page.getByText(/no territory will be claimed/)).toBeVisible()
    await shot('1-warning')
    const before = await km(page)

    await page.getByRole('button', { name: 'Keep Running' }).click()
    await expect(warning(page)).toHaveCount(0)
    // GPS keeps being tracked: walk further along the arc's tail.
    for (let i = 1; i <= 6; i++) {
      await page.evaluate((i) => window.__gps(27.7172 + 0.00004 * i, 85.32), i)
      await page.waitForTimeout(1100)
    }
    await shot('2-after-keep-running')
    await page.locator('.game-run-btn-end').click()
    await expect(warning(page)).toBeVisible()
    expect(await km(page)).toBeGreaterThan(before)
  })

  test('(b) End Anyway ends the run and it submits as today', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    let posts = 0
    await page.route('**/v1/run', (r) => {
      if (r.request().method() !== 'POST') return r.fallback()
      posts += 1
      return r.fulfill(ok({ id: 901, avgPace: 4.7 }))
    })
    await openGame(page, 'open')
    await page.locator('.game-run-btn-end').click()
    await page.getByRole('button', { name: 'End Anyway' }).dblclick() // double tap = one stop
    await expect(warning(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Submit Run/ })).toBeVisible()
    await page.getByRole('button', { name: /Submit Run/ }).click()
    await expect.poll(() => posts, { timeout: 30_000 }).toBe(1)
  })

  test('(c) closed loop: normal confirm, no warning', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(150_000)
    await openGame(page, 'closed')
    await page.locator('.game-run-btn-end').click()
    await expect(normalConfirm(page)).toBeVisible()
    await expect(warning(page)).toHaveCount(0)
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({
        path: `${SHOTS}/3-closed-normal-confirm-${testInfo.project.name}.png`,
      })
    }
  })

  test('(d) Training mode: no warning even with an open path', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await openGame(page, 'open', { isTraining: true })
    await page.locator('.game-run-btn-end').click()
    await expect(normalConfirm(page)).toBeVisible()
    await expect(warning(page)).toHaveCount(0)
  })

  test('(e) loop closes while the warning is open -> swaps to the normal confirm', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await openGame(page, 'almost')
    await page.locator('.game-run-btn-end').click()
    await expect(warning(page)).toBeVisible()
    // walk the last ~40 m back to the start in ~4 m steps (about 1/s)
    for (let k = 1; k <= 9; k++) {
      await page.evaluate((k) => {
        const { first, last } = window.__ends
        const f = k / 10
        window.__gps(
          last.lat + (first.lat - last.lat) * f,
          last.lng + (first.lng - last.lng) * f
        )
      }, k)
      await page.waitForTimeout(1100)
    }
    await expect(normalConfirm(page)).toBeVisible()
    await expect(warning(page)).toHaveCount(0)
  })
})
