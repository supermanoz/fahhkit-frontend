import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// "Hero Poster" share card: renders the real shareCanvas.js for all 7 heroes
// with a normal, a long-value and a no-route run, checks the export is the
// 1080x1920 opaque PNG, that the poster is released from memory afterwards,
// and writes every card to ./screenshots/run-export-hero-poster/.
const OUT = 'screenshots/run-export-hero-poster'
const HEROES = ['nova', 'cyclone', 'pulse', 'phantom', 'blaze', 'comet', 'bolt']
const BASE = { lat: 27.7172, lng: 85.324 }
const LOOP = Array.from({ length: 80 }, (_, i) => {
  const t = (i / 79) * Math.PI * 2
  return {
    lat: BASE.lat + Math.sin(t) * 0.0042 + Math.sin(t * 5) * 0.0004,
    lng: BASE.lng + Math.cos(t) * 0.0016,
  }
})
const RUNS = {
  normal: { points: LOOP, distance: 5030, duration: 1752, pace: 5.8 },
  // 12h 34m 56s / 42.19 km: the longest values the card has to hold.
  long: { points: LOOP, distance: 42190, duration: 45296, pace: 10.75 },
  // Treadmill / indoor: no route at all.
  indoor: { points: [], distance: 5030, duration: 1752, pace: 5.8 },
}

test.describe('Run export: Hero Poster', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/')
  })

  for (const hero of HEROES) {
    for (const [name, run] of Object.entries(RUNS)) {
      test(`${hero} - ${name}`, async ({ mockedPage: page }) => {
        const r = await page.evaluate(
          async ({ hero, run }) => {
            const m = await import('/src/utils/shareCanvas.js')
            const cache = await import('/src/utils/spriteSheetCache.js')
            const blob = await m.exportShareCardBlob({
              ...run,
              variant: 'hero-poster',
              heroKey: hero,
            })
            const bmp = await createImageBitmap(blob)
            const c = document.createElement('canvas')
            c.width = bmp.width
            c.height = bmp.height
            const ctx = c.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(bmp, 0, 0)
            const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data)
            const bytes = new Uint8Array(await blob.arrayBuffer())
            let bin = ''
            for (let i = 0; i < bytes.length; i += 0x8000)
              bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
            return {
              w: bmp.width,
              h: bmp.height,
              type: blob.type,
              corners: [px(0, 0), px(1079, 0), px(0, 1919), px(1079, 1919)],
              resident: cache.residentBytes(),
              b64: btoa(bin),
            }
          },
          { hero, run }
        )
        expect([r.w, r.h]).toEqual([1080, 1920])
        expect(r.type).toBe('image/png')
        // A full-bleed poster: every corner is opaque.
        for (const p of r.corners) expect(p[3]).toBe(255)
        // The poster is closed again as soon as the card is drawn.
        expect(r.resident).toBe(0)
        fs.writeFileSync(
          `${OUT}/${hero}-${name}.png`,
          Buffer.from(r.b64, 'base64')
        )
      })
    }
  }
})
