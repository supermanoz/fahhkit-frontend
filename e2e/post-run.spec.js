import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// Post-run: the result popup per mode (own wording, never a territory message
// for Training/PvP/Club War), layout at phone widths and with big system
// fonts, the run-image slide (also for a run with no rewards) and the
// Download PNG button states. Renders the real components via
// e2e/previews/post-run.html. 8 screenshots in total (see SHOTS).
const OUT = 'screenshots/post-run'
const ring = (n = 24) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return {
      lat: 27.7172 + Math.sin(a) * 0.004,
      lng: 85.324 + Math.cos(a) * 0.005,
    }
  })
const RUN = {
  id: 7,
  points: ring(),
  distance: 5230,
  duration: 1800,
  avgPace: 5.73,
}
// 125:30 /km, 1:05:09, 142.55 km - the long values the tiles must hold.
const LONG = {
  ...RUN,
  id: 8,
  distance: 142_550,
  duration: 3909,
  avgPace: 125.5,
}

const training = { ...RUN, isTraining: true }
const conquer = { ...RUN }
const pvp = { ...RUN, isRace: true }
const war = { ...RUN, isWar: true }

async function result(page, props) {
  await page.evaluate((p) => window.__result(p), props)
  await expect(page.locator('.run-result-card')).toBeVisible()
  await page.waitForTimeout(250)
}
const text = (page) => page.locator('.run-result-card').innerText()

// Every element inside the card sits inside the card (nothing spills out).
async function noSpill(page) {
  return page.evaluate(() => {
    const card = document
      .querySelector('.run-result-card')
      .getBoundingClientRect()
    const bad = []
    for (const el of document.querySelectorAll('.run-result-card *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (
        r.left < card.left - 1 ||
        r.right > card.right + 1 ||
        // The title ribbon overlaps the panel's top edge on purpose.
        (!el.closest('.gm-ribbon') && r.top < card.top - 1) ||
        r.bottom > card.bottom + 1
      )
        bad.push(
          `${el.className} ${Math.round(r.left)}-${Math.round(r.right)} vs ${Math.round(card.left)}-${Math.round(card.right)}`
        )
    }
    return bad
  })
}
// Each tile's text fits its tile (value not clipped, unit/label inside).
async function tilesFit(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.gm-stat')].map((t) => {
      const tr = t.getBoundingClientRect()
      const v = t.querySelector('.gm-stat-value')
      const inside = [...t.children].every((c) => {
        const r = c.getBoundingClientRect()
        return r.left >= tr.left - 1 && r.right <= tr.right + 1
      })
      return {
        value: v.textContent,
        clipped: v.scrollWidth > v.clientWidth + 1,
        inside,
        tileW: Math.round(tr.width),
        size: parseFloat(getComputedStyle(v).fontSize),
      }
    })
  )
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-390',
    'harness sets its own viewports'
  )
  test.setTimeout(90_000)
  fs.mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/e2e/previews/post-run.html')
  await page.waitForFunction(() => window.__ready)
})

test('wording per mode: Training saves, only Conquer checks territory', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await result(page, { runResult: { phase: 'submitted' }, run: training })
  await expect(page.locator('.gm-ribbon')).toHaveText('Run saved!')
  expect(await text(page)).not.toMatch(/territor|loop|checking/i)
  await page.screenshot({ path: `${OUT}/1-training-saved-360.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await result(page, { runResult: { phase: 'processing' }, run: conquer })
  await expect(page.locator('.gm-ribbon')).toHaveText('Run submitted!')
  await expect(page.locator('.run-result-card')).toContainText(
    'Checking your territory…'
  )
  await expect(page.getByRole('button', { name: 'Nice' })).toHaveCount(0) // nothing to dismiss while checking
  await page.screenshot({ path: `${OUT}/2-conquer-checking-390.png` })

  await page.setViewportSize({ width: 360, height: 740 })
  await result(page, { runResult: { phase: 'submitted' }, run: pvp })
  await expect(page.locator('.gm-ribbon')).toHaveText('Run submitted!')
  await expect(page.locator('.run-result-card')).toContainText(
    'Waiting for your rival'
  )
  expect(await text(page)).not.toMatch(/territor|checking/i)
  await page.screenshot({ path: `${OUT}/3-pvp-360.png` })

  await result(page, { runResult: { phase: 'submitted' }, run: war })
  await expect(page.locator('.run-result-card')).toContainText(
    'Counting your points'
  )
  await result(page, {
    runResult: { phase: 'submitted' },
    run: war,
    warPoints: 1234,
  })
  await expect(page.locator('.run-result-card')).toContainText(
    '1,234 war points added'
  )
  expect(await text(page)).not.toMatch(/territor|checking/i)

  // Conquer's own results still read as before.
  await result(page, {
    runResult: { phase: 'done', events: [{ eventType: 'CLAIMED' }] },
    run: conquer,
    summary: { title: 'Territory claimed!', totalArea: 42_000 },
  })
  await expect(page.locator('.gm-ribbon')).toHaveText('Territory claimed!')
  await expect(page.locator('.run-result-card')).toContainText(
    'km² affected across 1 update'
  )
  await result(page, {
    runResult: {
      phase: 'rejected',
      title: 'So close, loop-wise 🔁',
      message: 'Your route never made it back near the start.',
    },
    run: conquer,
  })
  await expect(page.getByRole('button', { name: 'Got it' })).toBeVisible()
  // The popup sits in a pointer-events:none layer, so its buttons must
  // really receive taps (a real click, not just "is visible").
  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 3000 })
  expect(await page.evaluate(() => window.__closed)).toBeGreaterThan(0)
  await result(page, { runResult: { phase: 'timeout' }, run: conquer })
  await expect(page.locator('.run-result-card')).toContainText(
    'Still checking your territory…'
  )
})

for (const w of [320, 360, 390, 412]) {
  test(`popup layout at ${w}px: wide enough, nothing outside its tiles`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: 740 })
    for (const [props, name] of [
      [{ runResult: { phase: 'submitted' }, run: training }, 'training'],
      [{ runResult: { phase: 'processing' }, run: conquer }, 'conquer'],
      [{ runResult: { phase: 'submitted' }, run: pvp }, 'pvp'],
      [{ runResult: { phase: 'submitted' }, run: LONG }, 'long values'],
    ]) {
      await result(page, props)
      const card = await page.locator('.run-result-card').boundingBox()
      // Popup width min(92vw, 420px) - not squeezed.
      expect(card.width, name).toBeGreaterThanOrEqual(
        Math.min(w * 0.92, 420) - 2
      )
      expect(card.x, name).toBeGreaterThanOrEqual(0)
      expect(card.x + card.width, name).toBeLessThanOrEqual(w)
      expect(await noSpill(page), name).toEqual([])
      const tiles = await tilesFit(page)
      for (const t of tiles) {
        expect(
          t.clipped,
          `${name} ${t.value} clipped in ${t.tileW}px tile`
        ).toBe(false)
        expect(t.inside, `${name} ${t.value}`).toBe(true)
      }
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        ),
        name
      ).toBe(true)
    }
  })
}

test('long values (125:30 /km, 1:05:09) fit; unit sits on its own small line; also with 1.5x system font', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await result(page, { runResult: { phase: 'submitted' }, run: LONG })
  const tiles = page.locator('.gm-stat')
  await expect(tiles.nth(1).locator('.gm-stat-value')).toHaveText('125:30')
  await expect(tiles.nth(1).locator('.gm-stat-unit')).toHaveText('/km')
  await expect(tiles.nth(2).locator('.gm-stat-value')).toHaveText('1:05:09')
  await expect(tiles.nth(0).locator('.gm-stat-value')).toHaveText('142.55')
  // Unit is below the value and smaller.
  const [v, u] = await tiles.nth(1).evaluate((t) => {
    const val = t.querySelector('.gm-stat-value').getBoundingClientRect()
    const unit = t.querySelector('.gm-stat-unit').getBoundingClientRect()
    return [val.bottom, unit.top]
  })
  expect(u).toBeGreaterThanOrEqual(v - 1)
  await page.screenshot({ path: `${OUT}/4-long-values-360.png` })
  for (const t of await tilesFit(page)) expect(t.clipped, t.value).toBe(false)

  // Android "large font": every font 1.5x. Text may truncate with an
  // ellipsis, but never leaves the tile/card.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.run-result-card *')) {
      const fs = parseFloat(getComputedStyle(el).fontSize)
      el.style.fontSize = `${fs * 1.5}px`
    }
  })
  await page.waitForTimeout(200)
  expect(await noSpill(page)).toEqual([])
  for (const t of await tilesFit(page)) expect(t.inside, t.value).toBe(true)
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true)
})

test('image slide: a run with no XP/score shows the stats card first, then Next opens the image; Done dismisses', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(
    (run) => window.__image({ run, mode: 'training' }),
    training
  )
  await expect(page.getByText('Run a bit longer to earn XP')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Your run' })).toBeHidden()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
  await expect(page.getByTestId('download-hero-poster')).toBeVisible()
  await expect(page.getByTestId('download-hero-poster')).toHaveText(
    'Download PNG'
  )
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/5-image-slide-390.png` })
  await page.getByRole('button', { name: 'Done' }).click()
  expect(await page.evaluate(() => window.__dismissed)).toBe(1)
  await expect(page.getByRole('dialog', { name: 'Your run' })).toHaveCount(0)
})

test('image slide with rewards: rewards first, then "Next" opens the image', async ({
  page,
}) => {
  await page.evaluate(
    (run) =>
      window.__image({
        run,
        mode: 'pvp',
        xpReward: { beforeLevel: 1, beforeXp: 10, afterLevel: 1, afterXp: 60 },
      }),
    pvp
  )
  await expect(page.getByRole('heading', { name: 'PvP Result' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Your run' })).toBeHidden()
  await page.getByRole('button', { name: 'Next' }).click({ timeout: 15_000 })
  await expect(page.getByRole('dialog', { name: 'Your run' })).toBeVisible()
})

test('download button: Download PNG -> Saving... -> Downloaded -> back to idle; filename; no double tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.evaluate(
    (run) => window.__image({ run, mode: 'training' }),
    training
  )
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const btn = page.getByTestId('download-hero-poster')
  await expect(btn).toHaveText('Download PNG')
  const dl = page.waitForEvent('download')
  await btn.click()
  await expect(btn).toHaveText('Saving...') // immediately
  await expect(btn).toBeDisabled()
  await expect(btn).toHaveAttribute('aria-busy', 'true')
  await page.screenshot({ path: `${OUT}/6-download-loading-360.png` })
  // a second tap while loading does nothing (disabled)
  await btn.click({ force: true, timeout: 1000 }).catch(() => {})
  const file = await dl
  expect(file.suggestedFilename()).toBe('run-conquest-hero-7.png')
  await expect(btn).toHaveAttribute('data-state', 'success', {
    timeout: 10_000,
  })
  await expect(btn).toContainText('Downloaded')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${OUT}/7-download-success-390.png` })
  // auto-resets after ~2s
  await expect(btn).toHaveAttribute('data-state', 'idle', { timeout: 5000 })
  await expect(btn).toHaveText('Download PNG')
  // only one download happened
  const extra = await page.evaluate(
    () =>
      performance
        .getEntriesByType('resource')
        .filter((r) => r.name.startsWith('blob:')).length
  )
  expect(extra).toBeLessThanOrEqual(2)
})

test('download error: plain message + Retry, then Retry works; other slides unaffected', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.evaluate(
    (run) => window.__image({ run, mode: 'training' }),
    training
  )
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.evaluate(() => {
    window.__origToBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      cb(null)
    }
  })
  const btn = page.getByTestId('download-hero-poster')
  await btn.click()
  await expect(btn).toHaveAttribute('data-state', 'error', { timeout: 10_000 })
  await expect(btn).toContainText('Retry')
  await expect(btn).toBeEnabled()
  const msg = page.getByRole('alert').filter({ hasText: "Couldn't save" })
  await expect(msg).toHaveText(
    "Couldn't save. Check Photos permission and try again."
  )
  await page.screenshot({ path: `${OUT}/8-download-error-360.png` })
  // Per-slide state: the next slide's button is untouched.
  await expect(page.getByTestId('download-overlay')).toHaveText('Download PNG')
  // Retry succeeds once exporting works again.
  await page.evaluate(
    () => (HTMLCanvasElement.prototype.toBlob = window.__origToBlob)
  )
  const dl = page.waitForEvent('download')
  await btn.click()
  await dl
  await expect(btn).toHaveAttribute('data-state', 'success', {
    timeout: 10_000,
  })
})

test('saved file: real PNG with transparency, 1080px wide, and it is what the slide shows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(
    (run) => window.__image({ run, mode: 'training' }),
    training
  )
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const info = await page.evaluate(
    (run) => window.__exportInfo('transparent', run),
    training
  )
  expect(info.type).toBe('image/png')
  expect(info.colorType).toBe(6) // RGBA
  expect(info.cornerAlpha).toBe(0) // transparent background survives
  expect([info.width, info.height]).toEqual([info.expectW, info.expectH])
  expect(info.width).toBe(1080)
  const overlay = await page.evaluate(
    (run) => window.__exportInfo('overlay', run),
    training
  )
  expect(overlay.colorType).toBe(6)
  expect(overlay.cornerAlpha).toBe(0)
  const jpg = await page.evaluate(
    (run) => window.__exportInfo('map', run, 'image/jpeg'),
    training
  )
  expect(jpg.type).toBe('image/jpeg')

  // Preview vs export: same drawing - the export scaled down to the preview
  // canvas matches its alpha mask (route + text land in the same places).
  const diff = await page.evaluate(async (run) => {
    // Slide 0 is the Hero Poster, slide 1 the transparent route.
    const preview = document.querySelectorAll('.share-carousel-slide canvas')[1]
    const blob = await (async () => {
      const mod = await import('/src/utils/shareCanvas.js')
      return mod.exportShareCardBlob({
        points: run.points,
        distance: run.distance,
        duration: run.duration,
        pace: run.avgPace,
        variant: 'transparent',
      })
    })()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = preview.width
    c.height = preview.height
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const a = ctx.getImageData(0, 0, c.width, c.height).data
    const b = preview
      .getContext('2d')
      .getImageData(0, 0, c.width, c.height).data
    let mismatch = 0,
      painted = 0
    for (let i = 3; i < a.length; i += 4) {
      const pa = a[i] > 40,
        pb = b[i] > 40
      if (pa || pb) painted++
      if (pa !== pb) mismatch++
    }
    return { mismatch, painted }
  }, training)
  expect(diff.painted).toBeGreaterThan(500)
  expect(diff.mismatch / diff.painted).toBeLessThan(0.08)

  // Hero Poster (the default slide): preview and exported PNG are the same
  // drawing - mean per-channel difference after scaling the export down.
  const poster = await page.evaluate(async (run) => {
    const preview = document.querySelectorAll('.share-carousel-slide canvas')[0]
    const mod = await import('/src/utils/shareCanvas.js')
    const blob = await mod.exportShareCardBlob({
      points: run.points,
      distance: run.distance,
      duration: run.duration,
      pace: run.avgPace,
      variant: 'hero-poster',
      heroKey: 'comet', // no loadout / saved / equipped hero -> the default
    })
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = preview.width
    c.height = preview.height
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const a = ctx.getImageData(0, 0, c.width, c.height).data
    const b = preview
      .getContext('2d')
      .getImageData(0, 0, c.width, c.height).data
    let sum = 0
    for (let i = 0; i < a.length; i += 4) {
      sum +=
        Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2])
    }
    return { mean: sum / (a.length / 4) / 3, opaque: b[3] === 255 }
  }, training)
  expect(poster.opaque).toBe(true)
  expect(poster.mean).toBeLessThan(6)
})

for (const vp of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`image step has no title: dialog is named, X is compact and clear of the preview, preview uses the room (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp)
    await page.evaluate(
      (run) => window.__image({ run, mode: 'training' }),
      training
    )
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Your run' })
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(800) // slide-in + canvas draw settle
    // Nothing on screen is a "Your run" heading any more.
    await expect(page.getByRole('heading', { name: 'Your run' })).toHaveCount(0)
    await expect(dialog.locator('.run-rewards-image-step h3')).toHaveCount(0)
    expect(await dialog.getAttribute('aria-modal')).toBe('true')

    const m = await page.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect()
        return {
          x: r.left,
          y: r.top,
          r: r.right,
          b: r.bottom,
          w: r.width,
          h: r.height,
        }
      }
      const card = document.querySelector('.run-rewards-card')
      const close = document.querySelector('.run-rewards-image-close')
      const carousel = document.querySelector(
        '.run-rewards-image-step .share-carousel'
      )
      const canvas = document.querySelector('.run-rewards-image-step canvas')
      const c = box(close)
      // A point just outside the 32px circle but inside the 44px tap area.
      const hit = document.elementFromPoint(c.x - 4, c.y - 4)
      return {
        card: box(card),
        close: c,
        carousel: box(carousel),
        canvas: box(canvas),
        tapAreaWorks: Boolean(hit?.closest('.run-rewards-image-close')),
        fits: card.scrollHeight <= card.clientHeight + 1,
        vh: innerHeight,
        vw: innerWidth,
      }
    })
    // The ✕ is compact, fully inside the card, reachable, and does not touch the preview.
    expect(m.close.w).toBe(32)
    expect(m.close.x).toBeGreaterThanOrEqual(m.card.x)
    expect(m.close.r).toBeLessThanOrEqual(m.card.r)
    expect(m.close.y).toBeGreaterThanOrEqual(m.card.y)
    expect(m.close.b).toBeLessThanOrEqual(m.carousel.y + 0.5)
    expect(m.tapAreaWorks).toBe(true)
    // The preview moved up into the title's room (it used to start ~54px down).
    expect(m.carousel.y - m.card.y).toBeLessThanOrEqual(44)
    // ...and got taller by it: height = viewport - 384 (capped), 16px more than before.
    expect(
      Math.abs(m.canvas.h - Math.min(520, m.vh - 384))
    ).toBeLessThanOrEqual(1.5)
    // Top spacing and the viewport are respected; nothing needs scrolling.
    expect(m.card.y).toBeGreaterThanOrEqual(16)
    expect(m.card.b).toBeLessThanOrEqual(m.vh - 16)
    expect(m.fits).toBe(true)
    // Behaviour untouched: the ✕ still dismisses.
    await page.locator('.run-rewards-image-close').click()
    expect(await page.evaluate(() => window.__dismissed)).toBeGreaterThan(0)
  })
}
