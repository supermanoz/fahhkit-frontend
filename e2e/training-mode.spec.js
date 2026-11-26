import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'
import { ok } from './fixtures/mockApi.js'

// Training is fully separate from territory capture: for ANY track shape
// (random zigzag, straight line, a path that happens to close a loop) the
// End -> submit -> results flow shows no territory text, no loop warning, no
// loop HUD, and the request carries mode TRAINING. Conquer is checked next to
// it so we know nothing regressed (open path warns, closed loop shows the
// territory result). GPS is mocked by seeding the run tracker's saved track
// (the same recorded-run path a real run restores), responses use the real
// RunSummaryResponse shape. Screenshots (390 only) -> screenshots/training-mode/.
const OUT = 'screenshots/training-mode'
const M = 111_320

// Seeded PRNG so the "random" zigzag is the same every run.
function rng(seed) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}
function track(shape) {
  const n = 40
  const step = 40 // metres per 20 s fix = 2 m/s
  const rand = rng(7)
  const pts = []
  let north = 0
  let east = 0
  for (let i = 0; i < n; i += 1) {
    if (shape === 'loop') {
      const a = (i / (n - 1)) * Math.PI * 2
      const r = 255
      north = Math.sin(a) * r
      east = Math.cos(a) * r - r
    } else if (shape === 'straight') {
      north = i * step
    } else {
      // zigzag: heading flips +-60 degrees with random jitter around north-east
      const h =
        ((i % 2 ? 60 : -60) + (rand() - 0.5) * 50 + 20) * (Math.PI / 180)
      if (i > 0) {
        north += Math.cos(h) * step
        east += Math.sin(h) * step
      }
    }
    pts.push({ north, east })
  }
  let dist = 0
  for (let i = 1; i < pts.length; i += 1)
    dist += Math.hypot(
      pts[i].north - pts[i - 1].north,
      pts[i].east - pts[i - 1].east
    )
  return { pts, distance: Math.round(dist) }
}

const TERRITORY_WORDS = /territor|loop|perimeter|capture|claim/i

async function seedRun(page, { shape, training }) {
  const { pts, distance } = track(shape)
  await page.addInitScript(
    ({ pts, distance, training, M }) => {
      const now = Date.now()
      const points = pts.map((p, i) => ({
        lat: 27.7172 + p.north / M,
        lng: 85.324 + p.east / (M * 0.885),
        timestamp: now - 800_000 + i * 20_000,
        accuracy: 5,
      }))
      localStorage.setItem(
        'fahhkit_active_run',
        JSON.stringify({
          startedAt: new Date(now - 800_000).toISOString(),
          eventId: null,
          challengeId: null,
          clubWarId: null,
          isTraining: training,
          points,
          distance,
          paused: false,
          pausedMs: 0,
        })
      )
      navigator.geolocation.getCurrentPosition = (cb) =>
        cb({
          coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
          timestamp: Date.now(),
        })
      navigator.geolocation.watchPosition = () => 1
      navigator.geolocation.clearWatch = () => {}
    },
    { pts, distance, training, M }
  )
}

async function setup(page, opts) {
  await seedSession(page, VETERAN)
  await seedRun(page, opts)
  const posts = []
  let saved = false
  await page.route('**/v1/run', (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    posts.push(r.request().postDataJSON())
    saved = true
    // Real RunSummaryResponse shape (RunController.createRun).
    return r.fulfill(
      ok({
        id: 901,
        distance: 1560,
        duration: 780,
        avgPace: 8.3,
        mode: opts.training ? 'TRAINING' : 'TERRITORY_CAPTURE',
        score: null,
      })
    )
  })
  await page.route('**/v1/territory/profile', (r) =>
    r.fulfill(
      ok({
        ...VETERAN.territoryProfile,
        level: 14,
        xp: saved ? 18000 : 17000,
      })
    )
  )
  await page.route('**/v1/territory/event/find', (r) =>
    r.fulfill(
      ok({
        content: opts.training
          ? []
          : [
              {
                eventType: 'CLAIMED',
                areaDeltaSqMeters: 42000,
                occurredAt: new Date(Date.now() + 60_000).toISOString(),
              },
            ],
        totalElements: opts.training ? 0 : 1,
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
  return posts
}

const SHAPES = [
  ['zigzag', 'a random zigzag line with no loop'],
  ['straight', 'a straight line'],
  ['loop', 'a path that returns to the start (closed loop)'],
]

test.describe('Training is separate from territory', () => {
  test.setTimeout(170_000)
  for (const [shape, label] of SHAPES) {
    test(`Training: ${label}`, async ({ mockedPage: page }, testInfo) => {
      const shot = async (name) => {
        if (testInfo.project.name !== 'mobile-390' || shape !== 'zigzag') return
        fs.mkdirSync(OUT, { recursive: true })
        await page.screenshot({ path: `${OUT}/${name}.png` })
      }
      const posts = await setup(page, { shape, training: true })

      // During the run: header says Training, no loop HUD.
      await page.getByRole('button', { name: /run controls/ }).click()
      const card = page.locator('.game-run-card')
      await expect(card).toBeVisible()
      await expect(card).toContainText('Training')
      // The weather pop-up's lines mention territory: not during Training.
      await expect(
        page.locator('.game-weather-hype, .game-weather-toast')
      ).toHaveCount(0)
      const hud = await card.innerText()
      expect(hud).not.toMatch(/loop area|perimeter|territor/i)
      await shot('1-during-run-hud')

      // End -> the plain confirm, never "Loop not closed yet".
      await page.locator('.game-run-btn-end').click()
      await expect(page.getByText('End this run?')).toBeVisible()
      await expect(page.getByText('Loop not closed yet')).toHaveCount(0)
      await shot('2-end-confirm')
      await page.getByRole('button', { name: 'Yes, End' }).click()

      // The finished run waits for Submit: no loop stats, no loop warning.
      await expect(
        page.getByRole('button', { name: /Submit Run/ })
      ).toBeVisible()
      await expect(page.getByText(/Heads up — your loop/)).toHaveCount(0)
      await expect(page.getByText(/Loop Area|Perimeter/)).toHaveCount(0)
      await expect(page.getByText(/loop isn.t closed/i)).toHaveCount(0)
      await page.getByRole('button', { name: /Submit Run/ }).click()

      // "Run submitted!" with the run's stats, nothing about territory.
      const result = page.locator('.run-result-card')
      await expect(result).toBeVisible({ timeout: 30_000 })
      await expect(result).toContainText('Run submitted!')
      await expect(result.getByText('Distance', { exact: true })).toBeVisible()
      await expect(result.getByText('Pace', { exact: true })).toBeVisible()
      await expect(result.getByText('Time', { exact: true })).toBeVisible()
      expect(await result.innerText()).not.toMatch(TERRITORY_WORDS)
      await page.waitForTimeout(700) // let the card finish fading in
      await shot('3-run-submitted')
      await result.getByRole('button', { name: /^(Nice|OK|Got it)$/ }).click()

      // "Run Complete": XP animation, then the run image.
      const rewards = page.locator('.run-rewards-card')
      await expect(rewards).toBeVisible({ timeout: 30_000 })
      await expect(rewards).toContainText('Run Complete')
      await expect(page.locator('.run-rewards-xp-gained')).toBeVisible()
      expect(await rewards.innerText()).not.toMatch(TERRITORY_WORDS)
      await shot('4-run-complete')
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
      await expect(page.getByTestId('download-hero-poster')).toBeEnabled()
      await page.waitForTimeout(600)
      await shot('5-image-download')

      // The request: separate mode, run saved once, never polled territory.
      expect(posts).toHaveLength(1)
      expect(posts[0].mode).toBe('TRAINING')
      expect(posts[0].points.length).toBeGreaterThan(10)
    })
  }

  test('Conquer + open path: still warns "Loop not closed yet", sends no mode', async ({
    mockedPage: page,
  }, testInfo) => {
    const posts = await setup(page, { shape: 'zigzag', training: false })
    await page.getByRole('button', { name: /run controls/ }).click()
    await page.locator('.game-run-btn-end').click()
    await expect(page.getByText('Loop not closed yet')).toBeVisible()
    if (testInfo.project.name === 'mobile-390') {
      fs.mkdirSync(OUT, { recursive: true })
      await page.screenshot({ path: `${OUT}/6-conquer-open-path-warning.png` })
    }
    await page.getByRole('button', { name: 'End Anyway' }).click()
    // Conquer keeps its second heads-up on the unsubmitted open run.
    await expect(page.getByText(/Heads up — your loop/)).toBeVisible()
    await page.getByRole('button', { name: 'Got it' }).click()
    await page.getByRole('button', { name: /Submit Run/ }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0].mode).toBeUndefined()
  })

  test('Conquer + closed loop: still shows the territory result', async ({
    mockedPage: page,
  }) => {
    const posts = await setup(page, { shape: 'loop', training: false })
    await page.getByRole('button', { name: /run controls/ }).click()
    await page.locator('.game-run-btn-end').click()
    await expect(page.getByText('End this run?')).toBeVisible()
    await page.getByRole('button', { name: 'Yes, End' }).click()
    await page.getByRole('button', { name: /Submit Run/ }).click()
    const result = page.locator('.run-result-card')
    await expect(result).toBeVisible({ timeout: 30_000 })
    await expect(result).toContainText(/territor/i, { timeout: 60_000 })
    expect(posts[0].mode).toBeUndefined()
  })
})
