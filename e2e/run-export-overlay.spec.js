import fs from 'node:fs'
import { test, expect } from './fixtures/base.js'

// "Overlay" sticker export: renders the real shareCanvas.js for three runs in
// every ratio, checks the PNG is truly transparent (RGBA, corner alpha 0,
// nothing at the edges = glow not clipped) and composites each over a white,
// a dark and a busy "photo" so the text can be judged. Output goes to
// ./screenshots/run-export-overlay/.
const OUT = 'screenshots/run-export-overlay'
const BASE = { lat: 27.7172, lng: 85.324 }

const RUNS = {
  // ~1.2 km loop.
  short: Array.from({ length: 15 }, (_, i) => {
    const t = (i / 14) * Math.PI * 2
    return {
      lat: BASE.lat + Math.sin(t) * 0.0025,
      lng: BASE.lng + Math.cos(t) * 0.0032,
    }
  }),
  // ~9 km winding route.
  long: Array.from({ length: 260 }, (_, i) => {
    const t = i / 259
    return {
      lat: BASE.lat + (t - 0.5) * 0.06 + Math.sin(t * 38) * 0.006,
      lng: BASE.lng + Math.sin(t * 9) * 0.03 + Math.cos(t * 21) * 0.004,
    }
  }),
  // Very wide and flat: runs to the edges of the canvas.
  edge: Array.from({ length: 60 }, (_, i) => {
    const t = i / 59
    return {
      lat: BASE.lat + Math.sin(t * 14) * 0.0015,
      lng: BASE.lng + (t - 0.5) * 0.09,
    }
  }),
  // Practically stationary (GPS jitter): must stay small and centred.
  tiny: Array.from({ length: 8 }, (_, i) => ({
    lat: BASE.lat + (i % 2) * 0.00003,
    lng: BASE.lng + i * 0.00002,
  })),
}
const SIZES = {
  portrait: [1080, 1350],
  story: [1080, 1920],
  square: [1080, 1080],
}

test.describe('Run export: Overlay sticker', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/')
  })

  for (const [runName, points] of Object.entries(RUNS)) {
    for (const [size, [ew, eh]] of Object.entries(SIZES)) {
      test(`${runName} run, ${size}`, async ({ mockedPage: page }) => {
        const r = await page.evaluate(
          async ({ points, size }) => {
            const m = await import('/src/utils/shareCanvas.js')
            const blob = await m.exportShareCardBlob({
              points,
              distance: 8420,
              duration: 2710,
              pace: 6.12,
              variant: 'overlay',
              size,
            })
            const bytes = new Uint8Array(await blob.arrayBuffer())
            const bmp = await createImageBitmap(blob)
            const w = bmp.width
            const h = bmp.height
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            const ctx = c.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(bmp, 0, 0)
            const a = (x, y) => ctx.getImageData(x, y, 1, 1).data[3]
            let edgeAlpha = 0
            for (let x = 0; x < w; x += 2) {
              edgeAlpha = Math.max(edgeAlpha, a(x, 0), a(x, h - 1))
            }
            for (let y = 0; y < h; y += 2) {
              edgeAlpha = Math.max(edgeAlpha, a(0, y), a(w - 1, y))
            }
            const corners = [a(0, 0), a(w - 1, 0), a(0, h - 1), a(w - 1, h - 1)]
            // Share of fully transparent pixels (a baked fill would be ~0).
            const all = ctx.getImageData(0, 0, w, h).data
            let clear = 0
            for (let i = 3; i < all.length; i += 4) if (all[i] === 0) clear++

            // Backgrounds: white, dark, and a busy "photo".
            const busy = (cw, ch) => {
              const bc = document.createElement('canvas')
              bc.width = cw
              bc.height = ch
              const b = bc.getContext('2d')
              const g = b.createLinearGradient(0, 0, cw, ch)
              g.addColorStop(0, '#87ceeb')
              g.addColorStop(0.5, '#f4d35e')
              g.addColorStop(1, '#2d6a4f')
              b.fillStyle = g
              b.fillRect(0, 0, cw, ch)
              let seed = 7
              const rnd = () =>
                (seed = (seed * 16807) % 2147483647) / 2147483647
              for (let i = 0; i < 260; i++) {
                b.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 70%, ${
                  25 + rnd() * 50
                }%, 0.75)`
                const s = 10 + rnd() * 90
                if (i % 2) b.fillRect(rnd() * cw, rnd() * ch, s, s * 0.6)
                else {
                  b.beginPath()
                  b.arc(rnd() * cw, rnd() * ch, s / 2, 0, Math.PI * 2)
                  b.fill()
                }
              }
              return bc
            }
            const compose = (fill) => {
              const hw = Math.round(w / 2)
              const hh = Math.round(h / 2)
              const o = document.createElement('canvas')
              o.width = hw
              o.height = hh
              const x = o.getContext('2d')
              if (fill === 'busy') x.drawImage(busy(hw, hh), 0, 0)
              else {
                x.fillStyle = fill
                x.fillRect(0, 0, hw, hh)
              }
              x.drawImage(bmp, 0, 0, hw, hh)
              return o.toDataURL('image/png').split(',')[1]
            }
            let bin = ''
            for (let i = 0; i < bytes.length; i += 0x8000)
              bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
            return {
              size: [w, h],
              colorType: bytes[25], // 6 = RGBA
              corners,
              edgeAlpha,
              clearShare: clear / (w * h),
              png: btoa(bin),
              white: compose('#ffffff'),
              dark: compose('#1c1c20'),
              busy: compose('busy'),
            }
          },
          { points, size }
        )
        expect(r.size).toEqual([ew, eh])
        expect(r.colorType).toBe(6)
        expect(r.corners).toEqual([0, 0, 0, 0])
        // Glow not clipped: only a whisper of bloom may reach the edge.
        expect(r.edgeAlpha).toBeLessThanOrEqual(12)
        expect(r.clearShare).toBeGreaterThan(0.3)
        const base = `${OUT}/overlay-${runName}-${size}`
        fs.writeFileSync(`${base}.png`, Buffer.from(r.png, 'base64'))
        for (const bg of ['white', 'dark', 'busy']) {
          fs.writeFileSync(
            `${OUT}/composite-${runName}-${size}-${bg}.png`,
            Buffer.from(r[bg], 'base64')
          )
        }
      })
    }
  }
})
