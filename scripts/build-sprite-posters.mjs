#!/usr/bin/env node
// Writes src/assets/heroes/<hero>/sheets/<key>/poster.webp for every sprite
// sequence: frame 0 cropped out of sheet0, lossless, alpha kept, at the
// native cell size. AnimatedSprite.jsx shows it as the "frozen tile" for
// inactive / still-loading sprites, so that tile no longer has to decode a
// whole ~4000x4000 sheet (~60 MB) just to draw one cell. Pixel-identical to
// the crop it replaces. Also records `"poster": "poster.webp"` in the
// sequence's manifest.json (heroManifest.js reads it).
//
//   node scripts/build-sprite-posters.mjs          (all heroes)
//   node scripts/build-sprite-posters.mjs --check  (verify only, exit 1 if stale)
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..', 'src', 'assets', 'heroes')
const check = process.argv.includes('--check')
let made = 0
let stale = 0
let bytes = 0

for (const hero of fs.readdirSync(ROOT)) {
  const sheetsDir = path.join(ROOT, hero, 'sheets')
  if (!fs.existsSync(sheetsDir)) continue
  for (const key of fs.readdirSync(sheetsDir)) {
    const dir = path.join(sheetsDir, key)
    const manifestPath = path.join(dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const posterPath = path.join(dir, 'poster.webp')
    if (check) {
      if (!fs.existsSync(posterPath) || manifest.poster !== 'poster.webp') {
        console.error(`missing poster: ${hero}/${key}`)
        stale += 1
      }
      continue
    }
    const sheet0 = path.join(dir, manifest.sheets[0].file)
    const buf = await sharp(sheet0)
      .extract({
        left: 0,
        top: 0,
        width: manifest.frameWidth,
        height: manifest.frameHeight,
      })
      .webp({ lossless: true, exact: true, effort: 6 })
      .toBuffer()
    fs.writeFileSync(posterPath, buf)
    bytes += buf.length
    if (manifest.poster !== 'poster.webp') {
      manifest.poster = 'poster.webp'
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    }
    made += 1
  }
}
if (check) {
  if (stale) process.exit(1)
  console.log('all posters present')
} else {
  console.log(`${made} posters, ${(bytes / 1024 / 1024).toFixed(1)} MB total`)
}
