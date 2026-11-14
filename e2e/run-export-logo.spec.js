import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// Run export: logo size check. Renders the real shareCanvas.js (same code
// as the carousel previews and the downloads) for 3 runs x every variant and
// saves PNGs to ./screenshots/run-export-logo/ as <PHASE>-<run>-<variant>.png
// (PHASE=before|after, default after). Also records the route's pixel bbox
// so "the route did not change size/position" can be compared.
const PHASE = process.env.PHASE || 'after'
const OUT = 'screenshots/run-export-logo'
const BASE = { lat: 27.7172, lng: 85.324 }
const loop = (n, rLat, rLng) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return {
      lat: BASE.lat + Math.sin(t) * rLat,
      lng: BASE.lng + Math.cos(t) * rLng,
    }
  })
const RUNS = {
  short: loop(14, 0.0025, 0.0032),
  long: Array.from({ length: 260 }, (_, i) => {
    const t = i / 259
    return {
      lat: BASE.lat + (t - 0.5) * 0.06 + Math.sin(t * 38) * 0.006,
      lng: BASE.lng + Math.sin(t * 9) * 0.03 + Math.cos(t * 21) * 0.004,
    }
  }),
  edge: Array.from({ length: 60 }, (_, i) => {
    const t = i / 59
    return {
      lat: BASE.lat + Math.sin(t * 14) * 0.0015,
      lng: BASE.lng + (t - 0.5) * 0.09,
    }
  }),
}

test.describe('Run export logo', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/')
  })
  fs.mkdirSync(OUT, { recursive: true })
  for (const [runName, points] of Object.entries(RUNS)) {
    for (const variant of ['transparent', 'gradient', 'map']) {
      test(`${PHASE}: ${runName} ${variant}`, async ({
        mockedPage: page,
      }, testInfo) => {
        if (testInfo.project.name !== 'desktop-1440') test.skip()
        const r = await page.evaluate(
          async ({ points, variant }) => {
            const m = await import('/src/utils/shareCanvas.js')
            const blob = await m.exportShareCardBlob({
              points,
              distance: 8420,
              duration: 2710,
              pace: 322,
              variant,
            })
            const bmp = await createImageBitmap(blob)
            const c = document.createElement('canvas')
            c.width = bmp.width
            c.height = bmp.height
            const ctx = c.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(bmp, 0, 0)
            const { data } = ctx.getImageData(0, 0, c.width, c.height)
            // Neon route pixels: strongly red, not white.
            let x0 = 1e9,
              y0 = 1e9,
              x1 = -1,
              y1 = -1
            let minAlpha = 255
            for (let y = 0; y < c.height; y++)
              for (let x = 0; x < c.width; x++) {
                const i = (y * c.width + x) * 4
                if (data[i + 3] < minAlpha) minAlpha = data[i + 3]
                if (data[i] > 230 && data[i + 1] < 90 && data[i + 3] > 200) {
                  if (x < x0) x0 = x
                  if (x > x1) x1 = x
                  if (y < y0) y0 = y
                  if (y > y1) y1 = y
                }
              }
            const dark = document.createElement('canvas')
            dark.width = c.width
            dark.height = c.height
            const d = dark.getContext('2d')
            d.fillStyle = '#2b2b2f'
            d.fillRect(0, 0, c.width, c.height)
            d.drawImage(bmp, 0, 0)
            const toB64 = async (b) => {
              const buf = new Uint8Array(await b.arrayBuffer())
              let s = ''
              for (let i = 0; i < buf.length; i += 0x8000)
                s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
              return btoa(s)
            }
            return {
              size: [c.width, c.height],
              route: [x0, y0, x1, y1],
              minAlpha,
              png: await toB64(blob),
              dark: dark.toDataURL('image/png').split(',')[1],
            }
          },
          { points, variant }
        )
        const stem = `${OUT}/${PHASE}-${runName}-${variant}`
        fs.writeFileSync(`${stem}.png`, Buffer.from(r.png, 'base64'))
        fs.writeFileSync(`${stem}-ondark.png`, Buffer.from(r.dark, 'base64'))
        fs.writeFileSync(
          `${stem}.json`,
          JSON.stringify({ size: r.size, route: r.route, minAlpha: r.minAlpha })
        )
        expect(r.size).toEqual([1080, 1920])
        // Transparent card keeps a real alpha channel (no baked background).
        if (variant === 'transparent') expect(r.minAlpha).toBe(0)
      })
    }
  }
})
