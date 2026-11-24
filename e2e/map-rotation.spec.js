import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// Heading-up map rotation during a run (MapRotation.jsx + headingTracker.js).
// The run is a resumed one (as post-run-flow.spec.js does) and the test drives
// the GPS stream itself: window.__gps.push(bearing, { metres, speed, ... })
// moves the runner `metres` along `bearing` and delivers a fix 3 s later (the
// tracker drops fixes closer than 2.5 s apart, so timestamps are scripted).
//
// 390px screenshots of the map at 0 / ~90 / ~180 degrees: MAP_ROTATION_SHOTS=dir
const SHOTS = process.env.MAP_ROTATION_SHOTS || ''
// The feature is OFF by default (MAP_ROTATION_ENABLED in src/config/features.js).
// The rotation tests below only run when the dev server was started with
// VITE_MAP_ROTATION=true; the "flag off" block at the bottom runs otherwise.
const ROT_ON = process.env.VITE_MAP_ROTATION === 'true'

async function startRun(
  page,
  { rotate = true, debug = false, mode = 'conquer' } = {}
) {
  await seedSession(page, VETERAN)
  await page.addInitScript(
    ({ rotate, debug, mode }) => {
      if (debug) localStorage.setItem('fahhkit_debug_map', '1')
      if (!rotate)
        localStorage.setItem('fahhkit_map_rotate_while_running', 'false')
      localStorage.setItem('fahhkit_map_rotation_hint_seen', 'true')
      const now = Date.now()
      const points = Array.from({ length: 6 }, (_, i) => ({
        lat: 27.7172,
        lng: 85.324,
        timestamp: now - 600000 + i * 20000,
        accuracy: 5,
      }))
      localStorage.setItem(
        'fahhkit_active_run',
        JSON.stringify({
          startedAt: new Date(now - 600000).toISOString(),
          eventId: null,
          challengeId: mode === 'pvp' ? 'e2e-challenge-1' : null,
          clubWarId: null,
          isTraining: mode === 'training',
          points,
          distance: 60,
          paused: false,
          pausedMs: 0,
          clientRunId: 'run-e2e-rot-1',
        })
      )
      const g = (window.__gps = {
        cbs: [],
        lat: 27.7172,
        lng: 85.324,
        t: now,
        push(bearing, o = {}) {
          const {
            metres = 9,
            speed = 3,
            heading = null,
            accuracy = 5,
            dt = 3000,
          } = o
          const r = (bearing * Math.PI) / 180
          g.lat += (Math.cos(r) * metres) / 111320
          g.lng +=
            (Math.sin(r) * metres) /
            (111320 * Math.cos((g.lat * Math.PI) / 180))
          g.t += dt
          g.cbs.forEach((cb) =>
            cb({
              coords: {
                latitude: g.lat,
                longitude: g.lng,
                accuracy,
                speed,
                heading,
              },
              timestamp: g.t,
            })
          )
        },
      })
      navigator.geolocation.getCurrentPosition = (cb) =>
        cb({
          coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
          timestamp: now,
        })
      navigator.geolocation.watchPosition = (cb) => {
        g.cbs.push(cb)
        return g.cbs.length
      }
      navigator.geolocation.clearWatch = () => {}
    },
    { rotate, debug, mode }
  )
  await page.addLocatorHandler(page.locator('.idle-nudge-backdrop'), () =>
    page.getByText('Not now').click()
  )
  await page.goto('/game')
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 90_000,
  })
  await expect(page.locator('.game-locate-btn')).toBeVisible()
}

// Current CSS rotation of the map, degrees (-180..180).
const mapRotation = (page) =>
  page.evaluate(() => {
    const t = getComputedStyle(
      document.querySelector('.territory-map-tilt')
    ).transform
    if (!t || t === 'none') return 0
    const [a, b] = t
      .match(/matrix\(([^)]+)\)/)[1]
      .split(',')
      .map(Number)
    return Math.round(((Math.atan2(b, a) * 180) / Math.PI) * 10) / 10
  })

const push = (page, bearing, o) =>
  page.evaluate(([b, opts]) => window.__gps.push(b, opts), [bearing, o])

async function run(page, bearing, fixes, o) {
  for (let i = 0; i < fixes; i += 1) {
    await push(page, bearing, o)
    await page.waitForTimeout(120)
  }
}

const near = (a, b, tol) =>
  Math.abs(((((a - b) % 360) + 540) % 360) - 180) <= tol

async function expectRotation(page, expected, tol = 8, timeout = 12_000) {
  await expect
    .poll(async () => near(await mapRotation(page), expected, tol), { timeout })
    .toBe(true)
}

// Drags the map with synthetic mouse events dispatched straight at Leaflet's
// container (Leaflet's own listeners: mousedown on it, move/up on document),
// so the game's loading backdrop that can still sit on top in a test run does
// not swallow it.
function dragMap(page, dx, dy) {
  return page.evaluate(
    async ([dx, dy]) => {
      const el = document.querySelector('.leaflet-container')
      const r = el.getBoundingClientRect()
      const x0 = r.left + r.width / 2
      const y0 = r.top + r.height / 2
      const ev = (type, x, y) =>
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'mouseup' ? 0 : 1,
          view: window,
        })
      el.dispatchEvent(ev('mousedown', x0, y0))
      for (let i = 1; i <= 10; i += 1) {
        el.dispatchEvent(
          ev('mousemove', x0 + (dx * i) / 10, y0 + (dy * i) / 10)
        )
        await new Promise((res) => setTimeout(res, 16))
      }
      el.dispatchEvent(ev('mouseup', x0 + dx, y0 + dy))
    },
    [dx, dy]
  )
}

// Screenshot once the game's loading / intro overlay is really gone (it can
// still be fading out right after the run resumes).
async function shoot(page, name) {
  await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
    timeout: 30_000,
  })
  await page.waitForTimeout(900)
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

test.describe('heading-up map rotation', () => {
  test.skip(!ROT_ON, 'map rotation flag is off (VITE_MAP_ROTATION=true to run)')
  test('straight line east: the map turns so east points up', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(120_000)
    await startRun(page)
    expect(await mapRotation(page)).toBeCloseTo(0, 0)
    await run(page, 90, 12)
    await expectRotation(page, -90)
    await expect(page.locator('.territory-map-tilt')).toHaveClass(/is-rotor/)
    await expect(page.getByTestId('map-compass')).toBeVisible()
    if (SHOTS && testInfo.project.name === 'mobile-390') {
      await shoot(page, 'bearing-090')
    }
  })

  test('hero stays upright while the map turns', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page)
    await run(page, 90, 12)
    await expectRotation(page, -90)
    // Counter-rotation cancels the map's rotation on the marker.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector('.territory-map-upright')
          return el ? getComputedStyle(el).rotate : null
        })
      )
      .toMatch(/90deg|90\.\d+deg/)
  })

  test('gentle curve glides: never faster than ~45 deg/s', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await startRun(page)
    await run(page, 90, 10)
    await expectRotation(page, -90)
    await page.evaluate(() => {
      window.__samples = []
      const el = document.querySelector('.territory-map-tilt')
      const t0 = performance.now()
      window.__sampler = setInterval(() => {
        const [a, b] = getComputedStyle(el)
          .transform.match(/matrix\(([^)]+)\)/)[1]
          .split(',')
          .map(Number)
        window.__samples.push([
          performance.now() - t0,
          (Math.atan2(b, a) * 180) / Math.PI,
        ])
      }, 100)
    })
    for (let b = 90; b <= 130; b += 5) await run(page, b, 2)
    await run(page, 130, 8)
    await expectRotation(page, -130, 12)
    const samples = await page.evaluate(() => {
      clearInterval(window.__sampler)
      return window.__samples
    })
    let worst = 0
    for (let i = 1; i < samples.length; i += 1) {
      const dt = (samples[i][0] - samples[i - 1][0]) / 1000
      const d = Math.abs(
        ((((samples[i][1] - samples[i - 1][1]) % 360) + 540) % 360) - 180
      )
      if (dt > 0.05) worst = Math.max(worst, d / dt)
    }
    expect(worst).toBeLessThan(45)
  })

  test('U-turn: held for ~2 s, then turns by the short way', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(150_000)
    await startRun(page)
    await run(page, 90, 12)
    await expectRotation(page, -90)
    await run(page, 270, 1)
    await page.waitForTimeout(700)
    expect(near(await mapRotation(page), -90, 4)).toBe(true)
    await run(page, 270, 14)
    await expectRotation(page, -270, 10, 20_000)
    if (SHOTS && testInfo.project.name === 'mobile-390') {
      await shoot(page, 'bearing-270')
    }
  })

  test('manual pan pauses follow and rotation; Follow resumes both', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await startRun(page)
    await run(page, 90, 12)
    await expectRotation(page, -90)
    await dragMap(page, 0, 80)
    await expect(page.locator('.game-locate-btn')).toHaveAttribute(
      'aria-label',
      'Follow your run'
    )
    // Heading changes while paused do not turn the map.
    const paused = await mapRotation(page)
    await run(page, 0, 14)
    await page.waitForTimeout(1500)
    expect(near(await mapRotation(page), paused, 2)).toBe(true)
    // Recentre: follow + rotation resume.
    await page.locator('.game-locate-btn').click()
    await expectRotation(page, 0, 10, 20_000)
  })

  test('dragging a rotated map moves it with the finger (not along the old axes)', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page)
    await run(page, 90, 12)
    await expectRotation(page, -90)
    const heroPos = () =>
      page.evaluate(() => {
        const r = document
          .querySelector('.territory-map-player-icon')
          .getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
    const before = await heroPos()
    await dragMap(page, 0, 80)
    await expect(page.locator('.game-locate-btn')).toHaveAttribute(
      'aria-label',
      'Follow your run'
    )
    await page.waitForTimeout(500)
    const after = await heroPos()
    // 80 px down on screen, no sideways drift.
    expect(after.y - before.y).toBeGreaterThan(65)
    expect(after.y - before.y).toBeLessThan(95)
    expect(Math.abs(after.x - before.x)).toBeLessThan(8)
  })

  test('compass: tap = north-up, tap again = heading-up', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page)
    // Wait for the loading screen BEFORE running: with no GPS fixes the run
    // (correctly) drops back to the fixed IDLE view after a few seconds.
    const overlay = page.locator('.game-loading-overlay')
    await expect(overlay).toHaveCount(0, { timeout: 60_000 })
    await page.waitForTimeout(2500)
    await expect(overlay).toHaveCount(0, { timeout: 60_000 })
    await run(page, 90, 12)
    await expectRotation(page, -90)
    const compass = page.getByTestId('map-compass')
    await compass.click()
    await expectRotation(page, 0, 2, 5000)
    // Still there (so it can be turned back), and a new heading does not turn it.
    await expect(compass).toBeVisible()
    await run(page, 180, 8)
    await page.waitForTimeout(1200)
    expect(near(await mapRotation(page), 0, 2)).toBe(true)
    await compass.click()
    await expectRotation(page, -180, 10, 15_000)
  })

  test('setting off: the map never rotates and there is no compass', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page, { rotate: false })
    await run(page, 90, 14)
    await page.waitForTimeout(1500)
    expect(await mapRotation(page)).toBeCloseTo(0, 0)
    await expect(page.locator('.territory-map-tilt')).not.toHaveClass(
      /is-rotor/
    )
    await expect(page.getByTestId('map-compass')).toHaveCount(0)
  })

  test('phone-like walk (1 Hz, 1.4 m/s, accuracy 25 m, no course): turns with the walker and follows a 90 degree corner', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await startRun(page)
    // Fixes worse than 20 m and closer than 2.5 s apart never reach the run
    // recorder - the raw feed is what drives the heading.
    const walk = { metres: 1.4, speed: 1.4, accuracy: 25, dt: 1000 }
    await run(page, 90, 30, walk)
    await expectRotation(page, -90, 30, 20_000)
    await run(page, 0, 30, walk)
    await expectRotation(page, 0, 30, 25_000)
  })

  test('test mode (debug switch on): a slow 0.6 m/s walk turns the map and plays the run animation', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await startRun(page, { debug: true })
    await run(page, 90, 30, { metres: 0.6, speed: 0.6, accuracy: 8, dt: 1000 })
    await expectRotation(page, -90, 30, 20_000)
    await expect(page.locator('.territory-map-blaze.is-running')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('map-debug')).toContainText('TEST MODE')
  })

  // --- RUN view (heading-up) vs IDLE view (fixed north-up), one shared state ---
  const FAST = { metres: 3, speed: 3, dt: 1000 } // a run: 3 m/s, a fix per second
  const STILL = { metres: 0, speed: 0, dt: 1000 }
  const heroState = (page) =>
    page.evaluate(() =>
      document
        .querySelector('.territory-map-blaze')
        ?.classList.contains('is-running')
        ? 'run'
        : 'idle'
    )

  for (const mode of ['conquer', 'training', 'pvp']) {
    test(`${mode}: standing = fixed; running -> RUN view after ~2 s (smooth turn); stopping -> fixed again after ~3 s`, async ({
      mockedPage: page,
    }) => {
      test.setTimeout(150_000)
      await startRun(page, { mode })
      await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
        timeout: 60_000,
      })
      // Standing: fixed, hero idles.
      await run(page, 90, 4, STILL)
      await page.waitForTimeout(600)
      expect(await mapRotation(page)).toBeCloseTo(0, 0)
      expect(await heroState(page)).toBe('idle')
      // First second of running: still fixed (needs ~2 s of continuous movement).
      await push(page, 90, FAST)
      await page.waitForTimeout(300)
      expect(await mapRotation(page)).toBeCloseTo(0, 0)
      expect(await heroState(page)).toBe('idle')
      // Keep running: RUN view. Sample the turn: smooth, short way, no jump.
      const seen = []
      const sampler = setInterval(
        () =>
          mapRotation(page)
            .then((r) => seen.push(r))
            .catch(() => {}),
        60
      )
      for (let i = 0; i < 6; i += 1) {
        await push(page, 90, FAST)
        await page.waitForTimeout(150)
      }
      await expectRotation(page, -90, 6, 12_000)
      clearInterval(sampler)
      for (let i = 1; i < seen.length; i += 1) {
        const d = Math.abs(
          ((((seen[i] - seen[i - 1]) % 360) + 540) % 360) - 180
        )
        expect(
          d,
          `jump between samples ${seen[i - 1]} -> ${seen[i]}`
        ).toBeLessThan(60)
      }
      await expect.poll(() => heroState(page)).toBe('run')
      // Stop: 2 s of standing still keeps RUN view (a red light) ...
      await run(page, 90, 2, STILL)
      await page.waitForTimeout(500)
      expect(near(await mapRotation(page), -90, 6)).toBe(true)
      // ... ~3 s turns the map back to north-up and the hero to idle, and it holds.
      await run(page, 90, 4, STILL)
      await expectRotation(page, 0, 4, 8000)
      await expect.poll(() => heroState(page)).toBe('idle')
      await page.waitForTimeout(1200)
      expect(await mapRotation(page)).toBeCloseTo(0, 0)
    })
  }

  test('slow jitter around the run threshold never flickers the view', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page)
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 60_000,
    })
    const states = new Set()
    for (let i = 0; i < 24; i += 1) {
      await push(page, 90, {
        metres: 1,
        speed: i % 2 === 0 ? 0.9 : 1.1, // straddles the 1.0 m/s run threshold
        dt: 1000,
      })
      await page.waitForTimeout(120)
      states.add(await heroState(page))
    }
    await page.waitForTimeout(800)
    expect([...states]).toEqual(['idle'])
    expect(await mapRotation(page)).toBeCloseTo(0, 0)
  })

  test('IDLE view: walking slowly keeps the map fixed, the hero idle, and shows the direction cone', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page)
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 60_000,
    })
    await run(page, 90, 14, { metres: 14, speed: 0.8, dt: 1000 })
    await page.waitForTimeout(800)
    expect(await mapRotation(page)).toBeCloseTo(0, 0)
    expect(await heroState(page)).toBe('idle')
    await expect(page.locator('.territory-map-player-icon')).toHaveClass(
      /is-cone-on/,
      { timeout: 10_000 }
    )
  })

  test('debug panel shows the view (RUN / IDLE), time in state and the reason for the last switch', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page, { debug: true })
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 60_000,
    })
    const panel = page.getByTestId('map-debug')
    await run(page, 90, 2, STILL)
    await expect(panel).toContainText('IDLE', { timeout: 15_000 })
    await run(page, 90, 8, FAST)
    await expect(panel).toContainText('RUN', { timeout: 15_000 })
    await expect(panel).toContainText('last switch')
    await expect(panel).toContainText('moving at')
    await run(page, 90, 6, STILL)
    await expect(panel).toContainText('below', { timeout: 15_000 })
  })

  test('debug panel: hidden by default, shows the live heading chain when switched on', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    await startRun(page)
    await run(page, 90, 6)
    await expect(page.getByTestId('map-debug')).toHaveCount(0)
    await page.evaluate(() => localStorage.setItem('fahhkit_debug_map', '1'))
    await page.reload()
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 60_000,
    })
    await run(page, 90, 10, { heading: 90 })
    const panel = page.getByTestId('map-debug')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(panel).toContainText('rotation: active', { timeout: 15_000 })
    await expect(panel).toContainText('plugin gave heading')
    await expect(panel).toContainText('map bearing')
  })

  test('north-up (setting off): the hero stays upright and a ground cone shows the direction only while moving', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(150_000)
    await startRun(page, { rotate: false })
    await run(page, 90, 12, { metres: 14 })
    const icon = page.locator('.territory-map-player-icon')
    await expect(icon).toHaveClass(/is-cone-on/, { timeout: 15_000 })
    await expect
      .poll(
        async () =>
          near(
            await icon.evaluate((el) =>
              parseFloat(el.style.getPropertyValue('--cone-deg'))
            ),
            90,
            25
          ),
        { timeout: 15_000 }
      )
      .toBe(true)
    // standing: the cone goes away again
    await expect(icon).not.toHaveClass(/is-cone-on/, { timeout: 15_000 })
    // the character itself is not turned
    expect(await mapRotation(page)).toBeCloseTo(0, 0)
  })

  test('hero stays upright and its feet stay put at map bearings 0 / 90 / 180 / 270', async ({
    mockedPage: page,
  }, testInfo) => {
    test.setTimeout(240_000)
    await startRun(page)
    // Probes at the feet anchor and 40 css px "above" the feet, inside the
    // rotating tree: if the hero is upright the head probe sits straight above
    // the feet probe on screen, whatever the map bearing; if the feet
    // anchor were off the GPS point the feet probe would move.
    const probe = () =>
      page.evaluate(() => {
        const body = document.querySelector('.territory-map-blaze-body')
        if (!body) return null
        const s = parseFloat(body.style.getPropertyValue('--s')) || 1
        const mk = (id, x, y) => {
          let el = body.querySelector('#' + id)
          if (!el) {
            el = document.createElement('i')
            el.id = id
            el.style.cssText = `position:absolute;width:0;height:0;left:${x}px;top:${y}px`
            body.appendChild(el)
          }
          const r = el.getBoundingClientRect()
          return { x: r.left, y: r.top }
        }
        return {
          feet: mk('probe-feet', 24 * s, 58 * s),
          head: mk('probe-head', 24 * s, 58 * s - 40),
        }
      })
    const bearings = [
      [0, 0],
      [90, -90],
      [180, -180],
      [270, -270],
    ]
    let feet0 = null
    for (const [bearing, rot] of bearings) {
      await run(page, bearing, bearing === 0 ? 12 : 16)
      await expectRotation(page, rot, 12, 25_000)
      await page.waitForTimeout(900)
      const p = await probe()
      expect(p, `hero marker present at bearing ${bearing}`).not.toBeNull()
      // upright: head straight above feet
      expect(Math.abs(p.head.x - p.feet.x)).toBeLessThan(3)
      expect(p.feet.y - p.head.y).toBeGreaterThan(30)
      // anchored: the feet are at the same screen point at every bearing
      feet0 ??= p.feet
      expect(Math.abs(p.feet.x - feet0.x)).toBeLessThan(4)
      expect(Math.abs(p.feet.y - feet0.y)).toBeLessThan(4)
      if (SHOTS && testInfo.project.name === 'mobile-390') {
        await shoot(page, `bearing-${String(bearing).padStart(3, '0')}`)
      }
    }
  })

  test('screenshots at bearings 0 and 180', async ({
    mockedPage: page,
  }, testInfo) => {
    test.skip(
      !SHOTS || testInfo.project.name !== 'mobile-390',
      'screenshots only'
    )
    test.setTimeout(150_000)
    await startRun(page)
    await run(page, 0, 12)
    await page.waitForTimeout(800)
    await shoot(page, 'bearing-000')
    await run(page, 180, 16)
    await expectRotation(page, -180, 10, 20_000)
    await shoot(page, 'bearing-180')
  })
})

// Tile cost: MAP_TILE_COUNT=1 prints the basemap requests made while running
// ~60 s (a fix every 4 s, 3 m/s) with rotation off / on. Informational.
for (const rotate of [false, true]) {
  test(`tile requests during a run (rotation ${rotate ? 'on' : 'off'})`, async ({
    mockedPage: page,
  }) => {
    test.skip(!ROT_ON, 'map rotation flag is off')
    test.skip(!process.env.MAP_TILE_COUNT, 'measurement only')
    test.setTimeout(150_000)
    await startRun(page, { rotate })
    const urls = []
    page.on('request', (r) => {
      if (r.url().includes('tiles.openfreemap.org')) urls.push(r.url())
    })
    const t0 = Date.now()
    for (let i = 0; i < 15; i += 1) {
      await push(page, 90 + (i % 5) * 6, { metres: 12, speed: 3 })
      await page.waitForTimeout(4000)
    }
    const mins = (Date.now() - t0) / 60000
    console.log(
      `TILES rotation=${rotate ? 'on' : 'off'} requests=${urls.length} per-min=${(urls.length / mins).toFixed(1)}`
    )
  })
}

// Flag OFF (the default): the run map is north-up exactly as before rotation
// existed - nothing of the feature is mounted or running.
test.describe('map rotation flag off', () => {
  test.skip(ROT_ON, 'flag is on')

  test('run map stays north-up: no compass, rotor, hint, setting row or CSS vars', async ({
    mockedPage: page,
  }) => {
    test.setTimeout(120_000)
    // rotate=true is stored on purpose: the flag must make it be ignored.
    await startRun(page, { rotate: true })
    await run(page, 90, 14)
    await page.waitForTimeout(1500)
    expect(await mapRotation(page)).toBeCloseTo(0, 0)
    const state = await page.evaluate(() => {
      const tilt = document.querySelector('.territory-map-tilt')
      const root = document.querySelector('.territory-map')
      return {
        isRotor: tilt.classList.contains('is-rotor'),
        rotorSize: tilt.style.getPropertyValue('--rotor-size'),
        mapRot: tilt.style.getPropertyValue('--map-rot'),
        mapShift: tilt.style.getPropertyValue('--map-shift'),
        counter: root.style.getPropertyValue('--map-counter'),
        compass: document.querySelectorAll('.territory-map-compass').length,
        hint: document.querySelectorAll('.territory-map-rotation-hint').length,
        debug: document.querySelectorAll('[data-testid="map-debug-panel"]')
          .length,
      }
    })
    expect(state).toEqual({
      isRotor: false,
      rotorSize: '',
      mapRot: '',
      mapShift: '',
      counter: '',
      compass: 0,
      hint: 0,
      debug: 0,
    })
    await expect(page.locator('.game-locate-btn')).toBeVisible()
    await expect(page.getByTestId('map-compass')).toHaveCount(0)
    fs.mkdirSync('screenshots/map-rotation', { recursive: true })
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0, {
      timeout: 30_000,
    })
    await page.waitForTimeout(900)
    await page.screenshot({
      path: 'screenshots/map-rotation/run-map-north-up-390.png',
    })
  })
})
