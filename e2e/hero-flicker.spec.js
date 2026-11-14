import fs from 'node:fs'
import { test, expect, seedSession } from './fixtures/base.js'
import { VETERAN } from './mocks/personas.js'

// "Character disappears and reappears after the app has been open a while".
// Soak test: the hero marker is sampled on EVERY animation frame while the
// app's timers/polls run at accelerated speed (Playwright's fake clock,
// runFor in 1s steps) under 4x CPU throttling, and the log (gaps where the
// hero was not actually painted, marker/sprite element replacements, every
// periodic timer the app registered) is written to screenshots/hero-flicker/.
//
//   RUN_SOAK=1 SOAK_MIN=10 npx playwright test e2e/hero-flicker.spec.js --project=mobile-390
//
// Tag the output files with SOAK_TAG (before / after).
const OUT = 'screenshots/hero-flicker'
const TAG = process.env.SOAK_TAG || 'run'
const SOAK_MIN = Number(process.env.SOAK_MIN || 10)

// Runs in the page before anything else.
function instrument() {
  const H = (window.__hero = {
    frames: 0,
    gaps: [],
    events: [],
    timers: {},
    cur: null,
    ids: new WeakMap(),
    nextId: 1,
    last: {},
  })
  const id = (el) => {
    if (!el) return 0
    if (!H.ids.has(el)) H.ids.set(el, H.nextId++)
    return H.ids.get(el)
  }
  const now = () => Math.round(performance.now())
  const ev = (kind, detail) => {
    if (H.events.length < 4000) H.events.push({ t: now(), kind, ...detail })
  }

  // Every periodic timer the app registers (deduped by period + call site).
  const origSetInterval = window.setInterval
  window.setInterval = function (fn, ms, ...rest) {
    const site = (new Error().stack || '').split('\n')[2]?.trim() || '?'
    const key = `${ms}ms ${site.replace(/^at /, '').slice(0, 120)}`
    H.timers[key] = (H.timers[key] || 0) + 1
    return origSetInterval.call(this, fn, ms, ...rest)
  }

  const painted = (canvas) => {
    try {
      const t = document.createElement('canvas')
      t.width = 24
      t.height = 24
      const c = t.getContext('2d')
      c.drawImage(canvas, 0, 0, 24, 24)
      const d = c.getImageData(0, 0, 24, 24).data
      for (let i = 3; i < d.length; i += 4) if (d[i] > 10) return true
    } catch {
      /* tainted/zero-size: treat as unpainted */
    }
    return false
  }
  const shown = (el) => {
    if (!el || !el.isConnected) return false
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return (
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      Number(cs.opacity) > 0.01 &&
      r.width > 1 &&
      r.height > 1
    )
  }

  let gap = null
  function sample() {
    H.frames += 1
    const marker = document.querySelector('.territory-map-player-icon')
    const body = marker?.querySelector('.territory-map-blaze-body')
    const idle = marker?.querySelector('.territory-map-blaze')
    const canvas = marker?.querySelector('.territory-map-hud-emote canvas')
    const emoting = !!body?.classList.contains('is-emoting')

    // Element identity - a change here IS a remount/rebuild.
    const ids = { marker: id(marker), idle: id(idle), canvas: id(canvas) }
    for (const k of Object.keys(ids)) {
      if (H.last[k] !== undefined && H.last[k] !== ids[k])
        ev('replaced:' + k, { from: H.last[k], to: ids[k] })
      H.last[k] = ids[k]
    }
    const bg = idle ? getComputedStyle(idle).backgroundImage : ''
    if (H.last.bg !== undefined && H.last.bg !== bg)
      ev('idle-bg-changed', { bg: bg.slice(-60) })
    H.last.bg = bg
    if (H.last.emoting !== undefined && H.last.emoting !== emoting)
      ev('is-emoting', { emoting })
    H.last.emoting = emoting

    let ok
    let reason = ''
    if (!marker) {
      ok = false
      reason = 'no-marker'
    } else if (emoting) {
      // idle is hidden by design while the emote canvas stands in for it.
      ok = shown(canvas) && (H.frames % 4 !== 0 || painted(canvas))
      if (!ok) reason = canvas ? 'emote-canvas-blank' : 'emote-canvas-missing'
    } else {
      ok = shown(idle)
      if (!ok) {
        const cs = idle && getComputedStyle(idle)
        const r = idle?.getBoundingClientRect()
        reason =
          'idle-hidden ' +
          JSON.stringify({
            connected: !!idle?.isConnected,
            display: cs?.display,
            visibility: cs?.visibility,
            opacity: cs?.opacity,
            w: r && Math.round(r.width),
            h: r && Math.round(r.height),
            bodyClass: body?.className,
            iconOpacity: getComputedStyle(marker).opacity,
          })
      }
    }

    if (!ok && !gap) gap = { start: now(), frames: 0, reason }
    if (!ok && gap) gap.frames += 1
    if (ok && gap) {
      gap.end = now()
      gap.ms = gap.end - gap.start
      H.gaps.push(gap)
      gap = null
    }
    requestAnimationFrame(sample)
  }
  document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(sample)
    // Structural changes inside Leaflet's marker pane (add/remove of nodes).
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (
          m.type === 'childList' &&
          (m.addedNodes.length || m.removedNodes.length)
        )
          ev('marker-pane-childList', {
            added: [...m.addedNodes]
              .map((n) => n.className || n.nodeName)
              .join('|')
              .slice(0, 80),
            removed: [...m.removedNodes]
              .map((n) => n.className || n.nodeName)
              .join('|')
              .slice(0, 80),
          })
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
  })
}

for (const scenario of ['hud-still', 'hud', 'run']) {
  test(`hero stays painted: ${scenario} soak (${SOAK_MIN} sim-min, 4x CPU)`, async ({
    mockedPage: page,
    context,
  }) => {
    // ~12 real minutes per scenario: opt-in, not part of the normal suite.
    test.skip(!process.env.RUN_SOAK, 'long soak - set RUN_SOAK=1')
    test.setTimeout(
      Number(process.env.SOAK_TIMEOUT_MS) || (SOAK_MIN + 6) * 60_000
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(instrument)
    await context.grantPermissions(['geolocation'])
    const base = { latitude: 27.7172, longitude: 85.324 }
    await context.setGeolocation({ ...base, accuracy: 10 })
    await seedSession(page, VETERAN)

    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    // The run scenario navigates menus (rAF-driven, so Playwright's own
    // actionability waits stall under a fake clock): set that up in real time
    // and install the clock right after the run has started.
    if (scenario !== 'run') await page.clock.install()

    console.log('[step] goto')
    await page.goto('/game')
    await expect(page.locator('.territory-map-player-icon')).toBeVisible({
      timeout: 90_000,
    })
    // Let the loading overlay + intro globe finish. Fake clock (hud
    // scenarios): advance it in small steps while real time passes for
    // tile/asset loading. Run scenario: plain real time.
    for (let i = 0; i < 400; i++) {
      const gone = async () =>
        (await page.locator('.game-loading-overlay').count()) === 0
      if (await gone()) {
        if (scenario !== 'run') await page.clock.runFor(1500)
        await page.waitForTimeout(scenario === 'run' ? 1500 : 150)
        if (await gone()) break
      }
      if (scenario !== 'run') await page.clock.runFor(250)
      await page.waitForTimeout(100)
    }
    await expect(page.locator('.game-loading-overlay')).toHaveCount(0)
    await page
      .getByText('Not now')
      .click({ timeout: 3000 })
      .catch(() => {})

    if (scenario === 'run') {
      // Radial menu -> Play -> Conquer starts a tracked run.
      await page.locator('.game-menu-btn').click()
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await page.getByRole('button', { name: 'Conquer', exact: true }).click()
      await expect(page.locator('.game-run-card')).toBeVisible({
        timeout: 30000,
      })
      await page.clock.install()
    }

    await page.evaluate(() => {
      window.__hero.gaps.length = 0
      window.__hero.events.length = 0
    })
    await page.screenshot({
      path: `${OUT}/${TAG}-${scenario}-start.png`,
    })

    // Soak: 1 simulated second per step. GPS: jitter around the start point
    // every few seconds, plus a short walking burst every ~90 s (which flips
    // the HUD hero idle <-> run).
    const steps = SOAK_MIN * 60
    const t0 = Date.now()
    let lat = base.latitude
    let lng = base.longitude
    for (let s = 1; s <= steps; s++) {
      await page.clock.runFor(1000)
      await page.waitForTimeout(25) // real time for decodes / fetches
      if (s % 4 === 0) {
        const walking =
          scenario === 'run' || (scenario === 'hud' && s % 90 < 14)
        if (walking) {
          lat += 0.00006
          lng += 0.00004
        }
        await context.setGeolocation({
          latitude: lat + (Math.random() - 0.5) * 0.00002,
          longitude: lng + (Math.random() - 0.5) * 0.00002,
          accuracy: 8,
        })
      }
      if (s % 30 === 0 || s === 5) {
        const g = await page.evaluate(() => window.__hero.gaps.length)
        console.log(
          `[${scenario}] sim ${s}s  gaps so far: ${g}  wall ${Math.round((Date.now() - t0) / 1000)}s`
        )
      }
    }

    const result = await page.evaluate(() => ({
      frames: window.__hero.frames,
      gaps: window.__hero.gaps,
      events: window.__hero.events,
      timers: window.__hero.timers,
    }))
    await page.screenshot({ path: `${OUT}/${TAG}-${scenario}-end.png` })
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(
      `${OUT}/${TAG}-${scenario}-log.json`,
      JSON.stringify(result, null, 2)
    )
    const bad = result.gaps.filter((g) => g.frames >= 1)
    console.log(
      `[${scenario}] frames=${result.frames} gaps=${bad.length} events=${result.events.length}`
    )
    const replaced = result.events.filter((e) => e.kind.startsWith('replaced:'))
    // No blank frames, and the marker/hero elements are never rebuilt except
    // the expected idle<->run icon swap (HUD) - reported, asserted below.
    expect(bad, JSON.stringify(bad.slice(0, 5))).toHaveLength(0)
    expect(
      replaced.filter((e) => e.kind === 'replaced:marker'),
      'Leaflet marker element rebuilt'
    ).toHaveLength(0)
  })
}
