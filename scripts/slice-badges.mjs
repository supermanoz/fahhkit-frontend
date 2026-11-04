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
//   4. Find the 6 largest connected non-background components ACROSS THE
//      WHOLE SHEET (not pre-cut into a fixed 512x512 grid first - see the
//      comment on BADGE_COUNT/margin clamping below for why that mattered:
//      a naive even 3x2 grid split cut through the flame/aura trail on
//      several badges, which sit close enough to their neighbour that a
//      hard mid-line between two fixed cells left no room for a real
//      margin on that side), auto-crop each to its own bounding box + a
//      margin (clamped per-side against the real gap to its nearest
//      neighbour, never the neighbour's own content), feather the alpha
//      edge, resize to ~256px wide (+ a 2x), export as WebP.
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
// (Top 1/2/3). Only used to NAME the 6 largest components found in the
// whole sheet, sorted by position (top-to-bottom, then left-to-right) -
// not to physically cut the sheet into fixed cells first (see this file's
// own top comment for why that broke on badges sitting close to their
// neighbour).
const GRID = [
  ['players_1', 'players_2', 'players_3'],
  ['clubs_1', 'clubs_2', 'clubs_3'],
]
const BADGE_NAMES = GRID.flat()

// Saturation (max channel - min channel) at or under this is "background-
// passable" - measured against the real sheet: pure checker reads 0-12,
// the flame/mist aura bleeding toward it still reads 35+, badge art itself
// is 40-200+. 16 sits in the gap with real margin on both sides.
const SAT_THRESHOLD = 16
// Margin added around each badge's own content bounding box, as a fraction
// of its larger dimension - keeps the crown spikes/flame tips from
// touching the edge, same role the hero stage art's own padding plays.
// 0.05 (5%) turned out not to be enough - the flame/mist aura's own trail
// is long and thin relative to the badge's overall size, so it was
// clipped at the crop edge on several badges (confirmed by eye - see git
// history for the version this replaced). 0.12 leaves real breathing room
// on every side instead of trimming right up against the visible art.
const MARGIN_FRACTION = 0.12
const MARGIN_MIN_PX = 14
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

// Every connected component (4-connectivity) of `mask` (1 = foreground) in
// a width x height image, each as {minX, maxX, minY, maxY, size} - no
// pixel-index lists kept around for the whole sheet (that's 1.5M+ pixels
// across potentially dozens of stray noise specks), just the bounding box
// and size, which is all slicing a badge out actually needs.
function findComponents(mask, width, height) {
  const seen = new Uint8Array(width * height)
  const stack = []
  const components = []
  for (let start = 0; start < width * height; start++) {
    if (!mask[start] || seen[start]) continue
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0,
      size = 0
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()
      size++
      const x = i % width
      const y = (i - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
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
    components.push({ minX, maxX, minY, maxY, size })
  }
  return components
}

// 4-connected flood fill of `mask` (1 = foreground) within a width x height
// block, starting from a single seed index already known to be inside the
// badge's own content - returns a boolean Uint8Array, 1 = reachable from
// that seed without crossing a 0 (background) pixel. Used to re-derive one
// badge's own membership within its (possibly neighbour-overlapping) crop
// rectangle: a neighbour's pixels are foreground too, but unreachable from
// this seed without crossing the background gap between the two badges, so
// they're correctly excluded even without ever computing a dividing line.
function floodFillComponent(mask, width, height, seed) {
  const reached = new Uint8Array(width * height)
  if (!mask[seed]) return reached
  const stack = [seed]
  reached[seed] = 1
  while (stack.length) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    const neighbors = []
    if (x > 0) neighbors.push(i - 1)
    if (x < width - 1) neighbors.push(i + 1)
    if (y > 0) neighbors.push(i - width)
    if (y < height - 1) neighbors.push(i + width)
    for (const n of neighbors) {
      if (mask[n] && !reached[n]) {
        reached[n] = 1
        stack.push(n)
      }
    }
  }
  return reached
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
  const foreground = new Uint8Array(pixelCount)
  for (let p = 0; p < pixelCount; p++) foreground[p] = isBackground[p] ? 0 : 1

  // The 6 largest blobs in the WHOLE sheet are the 6 real badges - every
  // stray noise speck the border flood-fill didn't happen to reach is
  // orders of magnitude smaller than a real badge (tens of thousands of
  // pixels), so a simple size sort already separates them cleanly without
  // needing a per-cell despeckle step any more.
  const components = findComponents(foreground, width, height)
    .sort((a, b) => b.size - a.size)
    .slice(0, BADGE_NAMES.length)
  if (components.length < BADGE_NAMES.length) {
    throw new Error(
      `Found only ${components.length} badge-sized components, expected ${BADGE_NAMES.length} - SAT_THRESHOLD may need tuning.`
    )
  }

  // Sort into reading order (row by centroid Y, then column by centroid X
  // within each row) to match GRID/BADGE_NAMES - relies on there being a
  // clean vertical gap between the two rows (true for this sheet), not on
  // any fixed pixel coordinate.
  components.sort((a, b) => (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2)
  const perRow = components.length / GRID.length
  const ordered = []
  for (let row = 0; row < GRID.length; row++) {
    const rowComponents = components
      .slice(row * perRow, (row + 1) * perRow)
      .sort((a, b) => (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2)
    ordered.push(...rowComponents)
  }

  for (let i = 0; i < BADGE_NAMES.length; i++) {
    const name = BADGE_NAMES[i]
    const { minX, maxX, minY, maxY } = ordered[i]
    const boxW = maxX - minX + 1
    const boxH = maxY - minY + 1
    const margin = Math.max(
      MARGIN_MIN_PX,
      Math.round(Math.max(boxW, boxH) * MARGIN_FRACTION)
    )
    // Clamped only to the real sheet bounds, not an artificial per-cell
    // wall (see this file's own top comment) - this is what actually lets
    // a badge sitting close to its neighbour still get a real margin on
    // that side, using whatever gap is really there. Safe even when two
    // badges' crop rectangles end up overlapping: the per-pixel alpha
    // mask below is keyed off THIS component's own membership, so any
    // neighbour pixels that happen to fall inside this crop stay fully
    // transparent rather than bleeding through.
    const cropX0 = Math.max(0, minX - margin)
    const cropY0 = Math.max(0, minY - margin)
    const cropX1 = Math.min(width - 1, maxX + margin)
    const cropY1 = Math.min(height - 1, maxY + margin)
    const cropW = cropX1 - cropX0 + 1
    const cropH = cropY1 - cropY0 + 1

    // Re-derive this one component's own membership within just the crop
    // rectangle (cheap - the crop is small) rather than keeping a sheet-
    // wide pixel-index list from findComponents - same seed-and-flood
    // approach, just scoped to this already-cropped region so a nearby
    // neighbour's pixels (foreground but not reachable from this badge's
    // own content without crossing a background gap) never get marked.
    const cropMask = new Uint8Array(cropW * cropH)
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const sp = (cropY0 + y) * width + (cropX0 + x)
        cropMask[y * cropW + x] = foreground[sp]
      }
    }
    const seedLocal =
      (Math.round((minY + maxY) / 2) - cropY0) * cropW +
      (Math.round((minX + maxX) / 2) - cropX0)
    const ownMask = floodFillComponent(cropMask, cropW, cropH, seedLocal)

    // RGBA crop - colour straight from the source, alpha from ownMask
    // (0/255 - the feather step below does the actual antialiasing, not a
    // soft value here).
    const rgba = Buffer.alloc(cropW * cropH * 4)
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const sx = cropX0 + x
        const sy = cropY0 + y
        const sp = (sy * width + sx) * channels
        const dp = (y * cropW + x) * 4
        rgba[dp] = data[sp]
        rgba[dp + 1] = data[sp + 1]
        rgba[dp + 2] = data[sp + 2]
        rgba[dp + 3] = ownMask[y * cropW + x] ? 255 : 0
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
      `${name.padEnd(10)} bbox=${boxW}x${boxH} crop=${cropW}x${cropH} margin=${margin} -> ${OUTPUT_WIDTH}w + @2x`
    )
  }

  console.log(`\nWrote 12 files (6 badges x 1x/@2x) under src/assets/ui/ranks/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
