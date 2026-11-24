import fs from 'node:fs'
import { test as base, expect } from '@playwright/test'
import { mockApi } from './fixtures/mockApi.js'
import { seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Frontend health smoke + metrics (docs/frontend-health-report.md). Walks one
// mocked run (resumed, ended and submitted) and then every menu screen, and
// COUNTS (does not fail on) console errors/warnings, uncaught page errors and
// failed requests, so the same script gives the before/after numbers.
//   HEALTH_OUT=/path/file.json npx playwright test e2e/health-smoke.spec.js --project=mobile-390
const OUT = process.env.HEALTH_OUT || ''
const ok = (body) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ status: 200, data: body }),
})

const norm = (t) =>
  t
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\d+/g, '#')
    .slice(0, 110)

base('health smoke: mocked run + every menu screen', async ({ page }) => {
  base.setTimeout(240_000)
  const errors = []
  const warnings = []
  const pageErrors = []
  const failed = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(norm(m.text()))
    if (m.type() === 'warning') warnings.push(norm(m.text()))
  })
  const reqs = new Map()
  let reqBytesTotal = 0
  page.on('request', (r) => {
    if (!/\/v1\//.test(r.url())) return
    const k = `${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} ${r.postData() || ''}`
    reqs.set(k, (reqs.get(k) || 0) + 1)
    reqBytesTotal += 1
  })
  page.on('pageerror', (e) => pageErrors.push(norm(e.message)))
  page.on('requestfailed', (r) => {
    if (r.failure()?.errorText === 'net::ERR_ABORTED') return
    failed.push(norm(`${r.method()} ${r.url()}`))
  })
  page.on('response', (r) => {
    if (r.status() >= 500) failed.push(norm(`HTTP ${r.status()} ${r.url()}`))
  })

  await mockApi(page)
  await seedSession(page, VETERAN)
  await page.addInitScript(() => {
    // Seed the resumed run once only (not again after the scripted reload).
    const seeded = sessionStorage.getItem('health_seeded')
    sessionStorage.setItem('health_seeded', '1')
    const now = Date.now()
    const points = Array.from({ length: 40 }, (_, i) => ({
      lat: 27.7172 + 0.002 * Math.sin(i / 6.3),
      lng: 85.324 + 0.002 * Math.cos(i / 6.3) - 0.002,
      timestamp: now - 900000 + i * 20000,
      accuracy: 5,
    }))
    if (!seeded)
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
        })
      )
    const fix = () => ({
      coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
      timestamp: Date.now(),
    })
    navigator.geolocation.getCurrentPosition = (cb) => cb(fix())
    navigator.geolocation.watchPosition = (cb) => {
      setTimeout(() => cb(fix()), 50)
      return 1
    }
    navigator.geolocation.clearWatch = () => {}
  })
  await page.route('**/v1/run', (r) =>
    r.request().method() !== 'POST'
      ? r.fallback()
      : r.fulfill(ok({ id: 901, avgPace: 4.7 }))
  )
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )

  const steps = {}
  const step = async (name, fn) => {
    try {
      await fn()
      steps[name] = 'ok'
    } catch (e) {
      steps[name] = `FAILED: ${String(e.message).split('\n')[0].slice(0, 120)}`
    }
  }

  await step('open game', async () => {
    await page.goto('/game')
    await expect(page.locator('.game-hud')).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 90_000,
    })
  })
  await step('end + submit run', async () => {
    await page.getByRole('button', { name: /run controls/ }).click()
    await page.locator('.game-run-btn-end').click()
    await page.getByRole('button', { name: 'Yes, End' }).click()
    await page.getByRole('button', { name: /Submit Run/ }).click()
    await expect(page.locator('.run-result-card')).toBeVisible({
      timeout: 30_000,
    })
  })
  await step('reload clean', async () => {
    await page.evaluate(() => localStorage.removeItem('fahhkit_active_run'))
    await page.reload()
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 90_000,
    })
  })
  // Menu: first open via the HUD button; afterwards the section picker
  // ("Open menu") lists the other screens.
  let menuOpened = false
  const goTab = async (name) => {
    if (menuOpened) {
      await page
        .getByRole('button', { name: 'Close menu' })
        .click({ timeout: 15_000 })
      await page.waitForTimeout(700)
    }
    await page.locator('.game-menu-btn').click({ timeout: 15_000 })
    menuOpened = true
    await page
      .getByRole('button', { name, exact: true })
      .click({ timeout: 15_000 })
    await page.waitForTimeout(1800)
  }
  for (const tab of ['Me', 'Shop', 'Club', 'Leaderboard', 'Mail', 'Settings']) {
    await step(`screen: ${tab}`, () => goTab(tab))
  }
  await step('screen: PvP', async () => {
    await page
      .getByRole('button', { name: 'Close menu' })
      .click({ timeout: 15_000 })
    await page.waitForTimeout(600)
    menuOpened = false
    await page.locator('.game-menu-btn').click({ timeout: 15_000 })
    await page
      .getByRole('button', { name: 'Play', exact: true })
      .click({ timeout: 15_000 })
    await page
      .getByRole('button', { name: 'PvP', exact: true })
      .click({ timeout: 15_000 })
    await expect(page.locator('[class*="pvp"]').first()).toBeVisible({
      timeout: 20_000,
    })
    await page.waitForTimeout(1500)
  })

  const count = (list) => {
    const m = new Map()
    for (const t of list) m.set(t, (m.get(t) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }
  const summary = {
    steps,
    apiRequests: reqBytesTotal,
    apiDuplicates: [...reqs.values()].reduce(
      (a, n) => a + (n > 1 ? n - 1 : 0),
      0
    ),
    topDuplicated: [...reqs.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, n]) => [k.slice(0, 90), n]),
    consoleErrors: errors.length,
    consoleWarnings: warnings.length,
    pageErrors: pageErrors.length,
    failedRequests: failed.length,
    topErrors: count(errors),
    topWarnings: count(warnings),
    topPageErrors: count(pageErrors),
    topFailed: count(failed),
  }
  console.log('HEALTH_SMOKE ' + JSON.stringify(summary))
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(summary, null, 2))
})
