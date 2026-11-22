#!/usr/bin/env node
// Shrinks oversized bundled images to what the UI can actually show, as WebP.
//
//   node scripts/optimize-images.mjs          # do it
//   node scripts/optimize-images.mjs --dry    # report only
//
// For every entry in JOBS: the original is copied to assets-src/<same path
// under src/> FIRST (outside the bundle and outside Capacitor's webDir, so it
// never ships - it is the source of truth if an image ever needs re-exporting
// at a different size), then the optimized WebP is written next to it and the
// original removed from src/. Re-running is a no-op once done.
//
// Rules: max 2x the CSS display size (grid thumbnails ~300px), WebP q82 with
// alpha kept for photos / lossy art, lossless for flat UI or pixel art.
// Hero sprite SHEETS are deliberately not here: their ~450px cells are drawn
// at up to 260 CSS px, so they are already <= 2x on the biggest display and
// shrinking them would soften the art (see build-sprite-posters.mjs for how
// their memory cost is cut without touching a pixel).
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const BACKUP = path.join(ROOT, 'assets-src')
const dry = process.argv.includes('--dry')

// Landing-page team photos: drawn as a 108px circle (object-fit: cover), so a
// 300px square cover-crop is ~2.8x and identical once cropped by the circle.
const TEAM = [
  'amatlimbu.jpeg',
  'aryandahal.jfif',
  'aryanshah.jfif',
  'jojanrai.jpeg',
  'manojbasnet.jfif',
  'raj.png',
  'riteshchand.jpeg',
].map((name) => ({
  file: `assets/images/team/${name}`,
  width: 300,
  height: 300,
  fit: 'cover',
  quality: 82,
}))

const JOBS = [...TEAM]

function mb(n) {
  return (n / 1024 / 1024).toFixed(2)
}

let before = 0
let after = 0
for (const job of JOBS) {
  const from = path.join(SRC, job.file)
  const out = from.replace(/\.[^.]+$/, '.webp')
  if (!fs.existsSync(from)) {
    if (fs.existsSync(out)) continue // already done
    console.error(`missing: ${job.file}`)
    process.exitCode = 1
    continue
  }
  const size = fs.statSync(from).size
  let img = sharp(from).rotate() // honour EXIF orientation before cropping
  img = job.height
    ? img.resize(job.width, job.height, { fit: job.fit || 'cover' })
    : img.resize({ width: job.width, withoutEnlargement: true })
  const buf = await img
    .webp(job.lossless ? { lossless: true } : { quality: job.quality ?? 82 })
    .toBuffer()
  before += size
  after += buf.length
  console.log(
    `${job.file}: ${mb(size)} MB -> ${mb(buf.length)} MB (${job.width}${job.height ? 'x' + job.height : 'w'})`
  )
  if (dry) continue
  const backup = path.join(BACKUP, job.file)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  if (!fs.existsSync(backup)) fs.copyFileSync(from, backup)
  fs.writeFileSync(out, buf)
  fs.rmSync(from)
}
console.log(
  `total: ${mb(before)} MB -> ${mb(after)} MB${dry ? ' (dry run)' : ''}`
)
