import { test, expect } from './fixtures/base.js'

// Time on every exported run image is written with unit letters ("47m 25s").
// Renders each card type / ratio with a short, medium, long and 10 h run
// through the real export code, checks every Time string stays inside the
// card with its margins, and saves contact sheets to
// ./screenshots/duration-format/.
const SHOT_DIR = 'screenshots/duration-format'
const POINTS = Array.from({ length: 60 }, (_, i) => {
  const t = (i / 59) * Math.PI * 2
  return {
    lat: 27.7172 + Math.sin(t) * 0.0025,
    lng: 85.324 + Math.cos(t) * 0.0032,
  }
})
const DURATIONS = [
  { seconds: 25, label: '25s' },
  { seconds: 2845, label: '47m 25s' },
  { seconds: 3912, label: '1h 5m 12s' },
  { seconds: 36000, label: '10h 0m 0s' },
]
const CARDS = [
  { name: 'transparent', variant: 'transparent' },
  { name: 'gradient', variant: 'gradient' },
  { name: 'map', variant: 'map', mime: 'image/jpeg' },
  { name: 'overlay-4x5', variant: 'overlay', size: 'portrait' },
  { name: 'overlay-story', variant: 'overlay', size: 'story' },
  { name: 'overlay-square', variant: 'overlay', size: 'square' },
]

test.describe('Run image duration format', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.setTimeout(240_000)
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile-390', '390px only')
  })

  test('every card and ratio writes Time with unit letters and fits', async ({
    mockedPage: page,
  }) => {
    await page.goto('/')
    const result = await page.evaluate(
      async ({ durations, cards, points }) => {
        const mod = await import('/src/utils/shareCanvas.js')
        // Record every Time string the export draws, with its measured box.
        const drawn = []
        const origFill = CanvasRenderingContext2D.prototype.fillText
        const origStroke = CanvasRenderingContext2D.prototype.strokeText
        let currentKey = null
        const record = function (text, x) {
          if (typeof text === 'string' && /^\d+[hms]( |$)/.test(text)) {
            const w = this.measureText(text).width
            const align = this.textAlign
            const left = align === 'center' ? x - w / 2 : x
            drawn.push({ key: currentKey, text, left, right: left + w })
          }
        }
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y, m) {
          record.call(this, t, x)
          return origFill.call(this, t, x, y, m)
        }
        CanvasRenderingContext2D.prototype.strokeText = function (t, x, y, m) {
          return origStroke.call(this, t, x, y, m)
        }
        const sheets = {}
        for (const card of cards) {
          const { w } = mod.cardSize(card.variant, card.size)
          const urls = []
          for (const d of durations) {
            currentKey = `${card.name}|${d.label}|${w}`
            const blob = await mod.exportShareCardBlob({
              points,
              distance: 10450,
              duration: d.seconds,
              pace: 5.58,
              variant: card.variant,
              mimeType: card.mime || 'image/png',
              quality: 0.9,
              size: card.size,
            })
            urls.push(URL.createObjectURL(blob))
          }
          sheets[card.name] = urls
        }
        CanvasRenderingContext2D.prototype.fillText = origFill
        CanvasRenderingContext2D.prototype.strokeText = origStroke
        // Contact sheets: one row per card, one column per duration.
        document.body.innerHTML = ''
        document.body.style.cssText = 'margin:0;background:#444;'
        for (const [name, urls] of Object.entries(sheets)) {
          const row = document.createElement('div')
          row.id = `sheet-${name}`
          row.style.cssText =
            'display:flex;gap:6px;padding:6px;width:max-content;'
          for (const u of urls) {
            const img = document.createElement('img')
            img.src = u
            img.style.cssText = 'height:420px;background:#666'
            row.appendChild(img)
          }
          document.body.appendChild(row)
        }
        await Promise.all(
          [...document.images].map((i) => i.decode().catch(() => {}))
        )
        return drawn
      },
      { durations: DURATIONS, cards: CARDS, points: POINTS }
    )

    // Unit-letter text everywhere, and inside the card with a margin.
    expect(result.length).toBeGreaterThanOrEqual(
      CARDS.length * DURATIONS.length
    )
    for (const entry of result) {
      const [name, label, width] = entry.key.split('|')
      expect(entry.text, entry.key).toBe(label)
      const margin = name.startsWith('overlay') ? Number(width) * 0.1 : 16
      expect(entry.left, `${entry.key} left`).toBeGreaterThanOrEqual(margin)
      expect(entry.right, `${entry.key} right`).toBeLessThanOrEqual(
        Number(width) - margin
      )
    }

    for (const card of CARDS) {
      await page
        .locator(`#sheet-${card.name}`)
        .screenshot({ path: `${SHOT_DIR}/${card.name}.png` })
    }
  })
})
