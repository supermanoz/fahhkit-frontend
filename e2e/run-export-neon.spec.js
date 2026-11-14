import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// Run-share export: neon #FF073A route + the bigger logo. Renders the real
// shareCanvas.js (the same drawShareCard behind both the carousel previews
// and the downloads) for three runs in every variant and saves the PNGs to
// ./screenshots/run-export-neon/. There is one card size (9:16, exported at
// 1080x1920), so "every aspect ratio" is the three variants.
const OUT = 'screenshots/run-export-neon'
const BASE = { lat: 27.7172, lng: 85.324 }

function loop(n, rLat, rLng, wobble = 0) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    const w = 1 + wobble * Math.sin(t * 3)
    return {
      lat: BASE.lat + Math.sin(t) * rLat * w,
      lng: BASE.lng + Math.cos(t) * rLng * w,
    }
  })
}

const RUNS = {
  // ~1.2 km out-and-back loop.
  short: loop(14, 0.0025, 0.0032),
  // ~9 km winding route, lots of turns.
  long: Array.from({ length: 260 }, (_, i) => {
    const t = i / 259
    return {
      lat: BASE.lat + (t - 0.5) * 0.06 + Math.sin(t * 38) * 0.006,
      lng: BASE.lng + Math.sin(t * 9) * 0.03 + Math.cos(t * 21) * 0.004,
    }
  }),
  // Very wide and flat: fills the card edge to edge, so the glow sits as
  // close to the card's sides as the layout ever lets it.
  edge: Array.from({ length: 60 }, (_, i) => {
    const t = i / 59
    return {
      lat: BASE.lat + Math.sin(t * 14) * 0.0015,
      lng: BASE.lng + (t - 0.5) * 0.09,
    }
  }),
}

const VARIANTS = ['transparent', 'gradient', 'map']

test.describe('Run export: neon route + larger logo', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/')
  })

  for (const [runName, points] of Object.entries(RUNS)) {
    for (const variant of VARIANTS) {
      test(`${runName} run, ${variant} card`, async ({ mockedPage: page }) => {
        const result = await page.evaluate(
          async ({ points, variant }) => {
            const m = await import('/src/utils/shareCanvas.js')
            const blob = await m.exportShareCardBlob({
              points,
              distance: 8420,
              duration: 2710,
              pace: 322,
              variant,
            })
            const bitmap = await createImageBitmap(blob)
            const read = (src) => {
              const c = document.createElement('canvas')
              c.width = src.width
              c.height = src.height
              const ctx = c.getContext('2d', { willReadFrequently: true })
              ctx.drawImage(src, 0, 0)
              return { c, ctx }
            }
            const { c, ctx } = read(bitmap)
            // Outer 1px ring of the export: a clipped glow would leave
            // non-transparent pixels here on the transparent card.
            const w = c.width
            const h = c.height
            let edgeAlpha = 0
            const sample = (x, y) => {
              edgeAlpha = Math.max(
                edgeAlpha,
                ctx.getImageData(x, y, 1, 1).data[3]
              )
            }
            for (let x = 0; x < w; x += 3) {
              sample(x, 0)
              sample(x, h - 1)
            }
            for (let y = 0; y < h; y += 3) {
              sample(0, y)
              sample(w - 1, y)
            }
            // The same card over dark grey, so the white stats on the
            // transparent variant can be judged by eye.
            const dark = document.createElement('canvas')
            dark.width = w
            dark.height = h
            const dctx = dark.getContext('2d')
            dctx.fillStyle = '#2b2b2f'
            dctx.fillRect(0, 0, w, h)
            dctx.drawImage(bitmap, 0, 0)
            // Preview-size render (what the carousel draws: 1x and 2x).
            const previews = {}
            for (const dpr of [1, 2]) {
              const pc = document.createElement('canvas')
              pc.width = m.CARD_W * dpr
              pc.height = m.CARD_H * dpr
              const pctx = pc.getContext('2d')
              pctx.scale(dpr, dpr)
              await m.drawShareCard(pctx, {
                width: m.CARD_W,
                height: m.CARD_H,
                points,
                distance: 8420,
                duration: 2710,
                pace: 322,
                variant,
              })
              const bg = document.createElement('canvas')
              bg.width = pc.width
              bg.height = pc.height
              const bctx = bg.getContext('2d')
              bctx.fillStyle = '#2b2b2f'
              bctx.fillRect(0, 0, bg.width, bg.height)
              bctx.drawImage(pc, 0, 0)
              previews[dpr] = bg.toDataURL('image/png')
            }
            const toB64 = async (b) => {
              const buf = new Uint8Array(await b.arrayBuffer())
              let s = ''
              for (let i = 0; i < buf.length; i += 0x8000)
                s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
              return btoa(s)
            }
            return {
              size: [w, h],
              edgeAlpha,
              png: await toB64(blob),
              dark: dark.toDataURL('image/png').split(',')[1],
              previews: Object.fromEntries(
                Object.entries(previews).map(([k, v]) => [k, v.split(',')[1]])
              ),
            }
          },
          { points, variant }
        )

        // Same size as before: 1080x1920.
        expect(result.size).toEqual([1080, 1920])
        // Glow never reaches the card edge.
        if (variant === 'transparent') expect(result.edgeAlpha).toBe(0)

        const stem = `${OUT}/${runName}-${variant}`
        fs.writeFileSync(`${stem}.png`, Buffer.from(result.png, 'base64'))
        fs.writeFileSync(
          `${stem}-on-dark.png`,
          Buffer.from(result.dark, 'base64')
        )
        for (const [dpr, b64] of Object.entries(result.previews)) {
          fs.writeFileSync(
            `${stem}-preview-${dpr}x.png`,
            Buffer.from(b64, 'base64')
          )
        }
      })
    }
  }
})
