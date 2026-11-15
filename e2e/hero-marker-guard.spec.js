import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// "The whole hero marker (sprite AND the yellow ground glow) vanishes every
// few seconds on the HUD map, with no user action."
//
// Guard: the HUD map runs for SOAK_SEC simulated seconds (default 180 = 3 min)
// on Playwright's fake clock, with a mocked GPS that sends a fix every second,
// sprinkled with poor-accuracy fixes (300-900 m) and silent gaps (stale), while
// every periodic poll the app owns keeps firing. On every animation frame the
// hero marker is checked, and any DOM removal / hide of it is logged WITH a
// stack trace (patched remove/removeChild/style/class setters), so a
// regression names the exact line that did it:
//   - the Leaflet marker icon element is never removed from the DOM,
//   - it is never display:none / visibility:hidden / opacity 0,
//   - its ground glow (.territory-map-player-pulse) is never hidden,
//   - it stays inside the map viewport.
//
//   SOAK_SEC=180 npx playwright test e2e/hero-marker-guard.spec.js --project=mobile-390
const OUT = 'screenshots/hero-marker-guard'
const SOAK_SEC = Number(process.env.SOAK_SEC || 180)

// Runs in the page before anything else.
function instrument() {
  const G = (window.__guard = { frames: 0, bad: [], events: [], iconIds: 0 })
  const now = () => Math.round(performance.now())
  const stack = () =>
    (new Error().stack || '')
      .split('\n')
      .slice(2, 9)
      .map((s) => s.trim().replace(/^at /, '').slice(0, 140))
  const ev = (kind, detail) => {
    if (G.events.length < 500)
      G.events.push({ t: now(), kind, stack: stack(), ...detail })
  }
  const isHeroEl = (n) =>
    n &&
    n.nodeType === 1 &&
    (n.classList?.contains('territory-map-player-icon') ||
      n.closest?.('.territory-map-player-icon'))

  // Who removes the hero marker (or anything inside it)?
  const origRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function (child) {
    if (isHeroEl(child)) ev('removeChild', { node: String(child.className) })
    return origRemoveChild.call(this, child)
  }
  const origRemove = Element.prototype.remove
  Element.prototype.remove = function () {
    if (isHeroEl(this)) ev('remove()', { node: String(this.className) })
    return origRemove.call(this)
  }
  // Who hides it via inline style?
  const origSetProp = CSSStyleDeclaration.prototype.setProperty
  CSSStyleDeclaration.prototype.setProperty = function (name, value, pr) {
    if (
      /^(display|visibility|opacity)$/.test(name) &&
      /^(none|hidden|0)$/.test(String(value))
    )
      ev('style.setProperty', { name, value })
    return origSetProp.call(this, name, value, pr)
  }

  const hidden = (el) => {
    const cs = getComputedStyle(el)
    return (
      cs.display === 'none' ||
      cs.visibility === 'hidden' ||
      Number(cs.opacity) < 0.01
    )
  }
  const ids = new WeakMap()
  let nextId = 1
  let lastId = null
  function sample() {
    G.frames += 1
    const icon = document.querySelector('.territory-map-player-icon')
    const map = document.querySelector('.territory-map')
    let reason = ''
    if (!icon || !icon.isConnected) reason = 'no-marker-in-dom'
    else if (hidden(icon)) reason = 'marker-hidden'
    else {
      const glow = icon.querySelector('.territory-map-player-pulse')
      // The pulse rings fade to opacity 0 by design (territoryPulse), so the
      // glow only counts as hidden when it is display:none / visibility:hidden.
      const gcs = glow && getComputedStyle(glow)
      if (gcs && (gcs.display === 'none' || gcs.visibility === 'hidden'))
        reason = 'glow-hidden'
      else {
        const r = icon.getBoundingClientRect()
        const m = map?.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) reason = 'marker-zero-size'
        else if (
          m &&
          (r.right < m.left ||
            r.left > m.right ||
            r.bottom < m.top ||
            r.top > m.bottom)
        )
          reason = `marker-offscreen ${JSON.stringify({
            r: [r.left, r.top, r.width, r.height].map(Math.round),
            m: [m.left, m.top, m.width, m.height].map(Math.round),
          })}`
      }
    }
    if (icon && icon.isConnected && !reason) {
      // A real walk moves the hero ~1px/frame at most; a snap back to the
      // first fix (or anywhere else) shows up as a one-frame jump.
      const r = icon.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (G.last && !G.noJump) {
        const d = Math.hypot(cx - G.last.cx, cy - G.last.cy)
        if (d > 20) reason = `marker-jumped ${Math.round(d)}px`
      }
      G.last = { cx, cy }
    }
    if (icon) {
      if (!ids.has(icon)) ids.set(icon, nextId++)
      const id = ids.get(icon)
      if (lastId != null && id !== lastId) G.iconIds += 1
      lastId = id
    }
    if (reason && !G.bad.length)
      G.first = { t: now(), reason, events: G.events.slice(-6) }
    if (reason && G.bad.length < 200) G.bad.push({ t: now(), reason })
    requestAnimationFrame(sample)
  }
  document.addEventListener('DOMContentLoaded', () =>
    requestAnimationFrame(sample)
  )
}

for (const scenario of ['hud', 'run']) {
  test(`${scenario} hero marker is never removed, hidden or snapped (${SOAK_SEC} sim-s, noisy GPS)`, async ({
    mockedPage: page,
    context,
  }) => {
    test.setTimeout((SOAK_SEC + 120) * 1000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(instrument)
    await context.grantPermissions(['geolocation'])
    const base = { latitude: 27.7172, longitude: 85.324 }
    await context.setGeolocation({ ...base, accuracy: 10 })
    await seedSession(page, VETERAN)
    if (scenario === 'hud') await page.clock.install()
    await page.goto('/game')
    await expect(page.locator('.territory-map-player-icon')).toBeVisible({
      timeout: 90_000,
    })
    for (let i = 0; i < 400; i++) {
      if ((await page.locator('.game-loading-overlay').count()) === 0) break
      if (scenario === 'hud') await page.clock.runFor(250)
      await page.waitForTimeout(100)
    }
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0)
    await page
      .getByText('Not now')
      .click({ timeout: 3000 })
      .catch(() => {})

    if (scenario === 'run') {
      // Radial menu -> Play -> Conquer starts a tracked run; the camera then
      // follows the hero, so per-frame jump detection is off for this one.
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await page.getByRole('button', { name: 'Conquer', exact: true }).click()
      await expect(page.locator('.game-run-card')).toBeVisible({
        timeout: 30000,
      })
      await page.clock.install()
      await page.evaluate(() => {
        window.__guard.noJump = true
      })
    }
    await page.evaluate(() => {
      window.__guard.bad.length = 0
      window.__guard.events.length = 0
      window.__guard.iconIds = 0
      delete window.__guard.first
    })

    let lat = base.latitude
    let lng = base.longitude
    for (let s = 1; s <= SOAK_SEC; s++) {
      await page.clock.runFor(1000)
      await page.waitForTimeout(15)
      // Stale: no fix at all for a stretch (s % 47 in 0..8).
      if (s % 47 < 9 && s % 47 > 0) continue
      const poor = s % 19 === 0
      // Slow walk so heading/run-anim/idle<->run swaps are exercised too.
      if (s % 90 < 25) {
        lat += 0.00004
        lng += 0.00003
      }
      await context.setGeolocation({
        latitude: lat + (Math.random() - 0.5) * 0.000008,
        longitude: lng + (Math.random() - 0.5) * 0.000008,
        accuracy: poor ? 300 + Math.random() * 600 : 6 + Math.random() * 10,
      })
    }

    const result = await page.evaluate(() => ({
      frames: window.__guard.frames,
      bad: window.__guard.bad,
      first: window.__guard.first,
      events: window.__guard.events,
      iconIds: window.__guard.iconIds,
    }))
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(
      `${OUT}/${process.env.SOAK_TAG || 'run'}-${scenario}-log.json`,
      JSON.stringify(result, null, 2)
    )
    await page.screenshot({
      path: `${OUT}/${process.env.SOAK_TAG || 'run'}-${scenario}-end.png`,
    })
    console.log(
      `frames=${result.frames} bad=${result.bad.length} iconRebuilds=${result.iconIds} first=${JSON.stringify(result.first)?.slice(0, 1500)}`
    )
    expect(result.bad, JSON.stringify(result.first)).toHaveLength(0)
  })
}
