#!/usr/bin/env node
// Slices src/assets/ui/ranks/badge_sheet_source.png (a 3x2 grid: top row
// Players Top 1/2/3, bottom row Clubs Top 1/2/3) into the six badge images
// RankBadge.jsx actually renders. The source has no real alpha channel - its
// "transparent" background is a baked-in grey/white checkerboard (an AI-art
// artifact, confirmed via `file`: 8-bit RGB, no alpha) with soft organic
// waviness in the tile edges, not a clean geometric pattern, so a simple
// colour-key can't just punch out one exact RGB pair.
//
// What actually separates background from badge art here is saturation, not
// exact colour: the checkerboard is near-greyscale (R≈G≈B) across its whole
// brightness range, while every badge (gold crown, red ribbon, skin tones,
// the flame/mist/cloud aura around each one) is clearly saturated. So:
//   1. Blur the per-pixel saturation channel slightly (suppresses the
//      occasional single-pixel compression-noise speck without touching
//      real edges, which are large continuous regions).
//   2. Threshold it - low-saturation pixels are "background-passable".
//   3. Flood-fill that passable set inward from the sheet's own border
//      (exactly "flood-fill the checker pattern from the edges inward", not
//      a global colour-key) - this is what correctly keeps the saturated
//      flame/mist aura around each badge (connected, high-saturation, never
//      reached by the fill) while still clearing the checker between/around
//      badges, however irregular its edge against that aura is.
//   4. Per badge cell, keep only the largest connected non-background
//      component (discards any stray noise blob the fill didn't reach
//      without them bloating that badge's own crop bounds), auto-crop to
//      its bounding box + a small margin, feather the alpha edge, resize to
//      ~256px wide (+ a 2x), export as WebP.
//
// Run with: node scripts/slice-badges.mjs
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = path.join(ROOT, 'src/assets/ui/ranks')
const SOURCE = path.join(OUT_DIR, 'badge_sheet_source.png')

// Grid layout - see the sheet: 2 rows (Players, Clubs) x 3 columns
// (Top 1/2/3). The source is exactly 1536x1024, so each cell is exactly
// 512x512 - no guesswork needed, but computed from the real dimensions
// below anyway in case a future sheet isn't this exact size.
const GRID = [
  ['players_1', 'players_2', 'players_3'],
  ['clubs_1', 'clubs_2', 'clubs_3'],
]

// Saturation (max channel - min channel) at or under this is "background-
// passable" - measured against the real sheet: pure checker reads 0-12,
// the flame/mist aura bleeding toward it still reads 35+, badge art itself
// is 40-200+. 16 sits in the gap with real margin on both sides.
const SAT_THRESHOLD = 16
// Margin added around each badge's own content bounding box, as a fraction
// of its larger dimension - keeps the crown spikes/flame tips from
// touching the edge, same role the hero stage art's own padding plays.
const MARGIN_FRACTION = 0.05
const MARGIN_MIN_PX = 6
// Display width this whole app actually uses this art at - see the layout
// brief (64-96px tall badges) - 256px is comfortably sharp for that even on
// a 2x display without exporting a needlessly huge file; @2x covers 3x
// displays at the 1x's own intended size.
const OUTPUT_WIDTH = 256
const WEBP_QUALITY = 90

function boxBlur3x3(src, width, height) {
  // Two passes of a separable 3x3 box blur (~near-gaussian) over a single-
  // channel Uint8Array - enough to smear out isolated single-pixel noise
  // specks in the saturation channel without moving a real multi-pixel
  // edge, which is all this needs (not photographic quality).
  function pass(input) {
    const h = new Uint8ClampedArray(width * height)
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - 1)
        const x1 = Math.min(width - 1, x + 1)
        h[row + x] = (input[row + x0] + input[row + x] + input[row + x1]) / 3
      }
    }
    const v = new Uint8ClampedArray(width * height)
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const y0 = Math.max(0, y - 1)
        const y1 = Math.min(height - 1, y + 1)
        v[y * width + x] =
          (h[y0 * width + x] + h[y * width + x] + h[y1 * width + x]) / 3
      }
    }
    return v
  }
  return pass(pass(src))
}

// Iterative (stack-based, not recursive - avoids blowing the call stack on
// a 1536x1024 flood fill) 4-connected flood fill from every border pixel,
// through `passable`. Returns a boolean Uint8Array, 1 = reached from the
// border (i.e. real background).
function floodFillFromBorder(passable, width, height) {
  const reached = new Uint8Array(width * height)
  const stack = []
  function seed(x, y) {
    const i = y * width + x
    if (passable[i] && !reached[i]) {
      reached[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x, 0)
    seed(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    seed(0, y)
    seed(width - 1, y)
  }
  while (stack.length) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    if (x > 0) seed(x - 1, y)
    if (x < width - 1) seed(x + 1, y)
    if (y > 0) seed(x, y - 1)
    if (y < height - 1) seed(x, y + 1)
  }
  return reached
}

// Connected components (4-connectivity) of `mask` (1 = foreground) within a
// width x height block. Returns the pixel indices of the single largest
// component - every other component (stray noise the border fill didn't
// happen to reach) is discarded, which is the actual despeckle step.
function largestComponent(mask, width, height) {
  const seen = new Uint8Array(width * height)
  let best = null
  const stack = []
  for (let start = 0; start < width * height; start++) {
    if (!mask[start] || seen[start]) continue
    const members = []
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()
      members.push(i)
      const x = i % width
      const y = (i - x) / width
      const neighbors = []
      if (x > 0) neighbors.push(i - 1)
      if (x < width - 1) neighbors.push(i + 1)
      if (y > 0) neighbors.push(i - width)
      if (y < height - 1) neighbors.push(i + width)
      for (const n of neighbors) {
        if (mask[n] && !seen[n]) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    if (!best || members.length > best.length) best = members
  }
  return best || []
}

async function main() {
  if (!existsSync(SOURCE)) {
    throw new Error(
      `Missing source sheet at ${SOURCE} - save the attached badge sheet there first (untouched).`
    )
  }
  mkdirSync(OUT_DIR, { recursive: true })

  const { data, info } = await sharp(SOURCE)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const pixelCount = width * height

  const sat = new Uint8ClampedArray(pixelCount)
  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    sat[p] = Math.max(r, g, b) - Math.min(r, g, b)
  }
  const blurredSat = boxBlur3x3(sat, width, height)
  const passable = new Uint8Array(pixelCount)
  for (let p = 0; p < pixelCount; p++) {
    passable[p] = blurredSat[p] <= SAT_THRESHOLD ? 1 : 0
  }
  const isBackground = floodFillFromBorder(passable, width, height)

  const cellW = Math.round(width / GRID[0].length)
  const cellH = Math.round(height / GRID.length)

  for (let row = 0; row < GRID.length; row++) {
    for (let col = 0; col < GRID[row].length; col++) {
      const name = GRID[row][col]
      const cellX = col * cellW
      const cellY = row * cellH

      const cellMask = new Uint8Array(cellW * cellH)
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const sx = cellX + x
          const sy = cellY + y
          const sp = sy * width + sx
          cellMask[y * cellW + x] = isBackground[sp] ? 0 : 1
        }
      }

      const kept = largestComponent(cellMask, cellW, cellH)
      if (kept.length === 0) {
        throw new Error(
          `${name}: found no badge content in its cell - SAT_THRESHOLD may need tuning.`
        )
      }
      const despeckled = new Uint8Array(cellW * cellH)
      let minX = cellW,
        maxX = 0,
        minY = cellH,
        maxY = 0
      for (const i of kept) {
        despeckled[i] = 1
        const x = i % cellW
        const y = (i - x) / cellW
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }

      const boxW = maxX - minX + 1
      const boxH = maxY - minY + 1
      const margin = Math.max(
        MARGIN_MIN_PX,
        Math.round(Math.max(boxW, boxH) * MARGIN_FRACTION)
      )
      const cropX0 = Math.max(0, minX - margin)
      const cropY0 = Math.max(0, minY - margin)
      const cropX1 = Math.min(cellW - 1, maxX + margin)
      const cropY1 = Math.min(cellH - 1, maxY + margin)
      const cropW = cropX1 - cropX0 + 1
      const cropH = cropY1 - cropY0 + 1

      // RGBA crop - colour straight from the source, alpha from the
      // despeckled largest-component mask (0/255 - the feather step below
      // does the actual antialiasing, not a soft value here).
      const rgba = Buffer.alloc(cropW * cropH * 4)
      for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
          const lx = cropX0 + x
          const ly = cropY0 + y
          const sx = cellX + lx
          const sy = cellY + ly
          const sp = (sy * width + sx) * channels
          const dp = (y * cropW + x) * 4
          rgba[dp] = data[sp]
          rgba[dp + 1] = data[sp + 1]
          rgba[dp + 2] = data[sp + 2]
          rgba[dp + 3] = despeckled[ly * cellW + lx] ? 255 : 0
        }
      }

      const cropped = sharp(rgba, {
        raw: { width: cropW, height: cropH, channels: 4 },
      })
        // Feathers the hard 0/255 alpha edge from the mask above into a
        // soft ~1px antialiased edge. The RGB behind a fully-transparent
        // pixel here is still the source sheet's own light checker colour
        // (never black), so the blur's slight colour bleed at the edge
        // reads as an imperceptible light fringe, not a dark halo - fine
        // for badges that only ever sit on an off-white row/panel.
        .blur(0.6)
        .png()

      for (const [suffix, outWidth] of [
        ['', OUTPUT_WIDTH],
        ['@2x', OUTPUT_WIDTH * 2],
      ]) {
        const outFile = path.join(OUT_DIR, `${name}${suffix}.webp`)
        await cropped
          .clone()
          .resize({ width: outWidth })
          .webp({ quality: WEBP_QUALITY })
          .toFile(outFile)
      }

      console.log(
        `${name.padEnd(10)} cell=(${col},${row}) bbox=${boxW}x${boxH} crop=${cropW}x${cropH} -> ${OUTPUT_WIDTH}w + @2x`
      )
    }
  }

  console.log(`\nWrote 12 files (6 badges x 1x/@2x) under src/assets/ui/ranks/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
