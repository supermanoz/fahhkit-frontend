#!/usr/bin/env node
// Validates every already-committed src/assets/heroes/<hero>/sheets/<key>/
// manifest.json against the real pixel dimensions of the sheet files next
// to it - sharp() reads the actual image, so this catches a manifest that
// drifted from its asset (hand-edited, or a sheet swapped some other way)
// without needing Pillow or the raw ~2.6GB source drop
// (scripts/build_emote_sheets.py, which DOES need that drop, already runs
// the same kind of check at authoring time - this is the portable, CI-safe
// half of it, checking only what's already committed to this repo).
//
// Wired as package.json's "prebuild" so a mismatch fails `npm run build`
// outright, not just a manual run.
//
// Run with: node scripts/verify-emote-sheets.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const HEROES_DIR = path.join(ROOT, 'src/assets/heroes')
const MAX_SHEET_PX = 4096

async function verifyHero(hero) {
  const sheetsDir = path.join(HEROES_DIR, hero, 'sheets')
  if (!existsSync(sheetsDir)) return []

  const problems = []
  for (const key of readdirSync(sheetsDir)) {
    const dir = path.join(sheetsDir, key)
    const manifestPath = path.join(dir, 'manifest.json')
    if (!existsSync(manifestPath)) {
      problems.push(`${hero}/${key}: no manifest.json`)
      continue
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const { frameCount, frameWidth, frameHeight, sheets } = manifest

    if (!Array.isArray(sheets) || sheets.length === 0) {
      problems.push(`${hero}/${key}: manifest has no sheets[]`)
      continue
    }
    const totalFrames = sheets.reduce((sum, s) => sum + s.frames, 0)
    if (totalFrames !== frameCount) {
      problems.push(
        `${hero}/${key}: manifest frameCount=${frameCount} but sheets[] frames sum to ${totalFrames}`
      )
    }

    for (const sheet of sheets) {
      const sheetPath = path.join(dir, sheet.file)
      if (!existsSync(sheetPath)) {
        problems.push(`${hero}/${key}/${sheet.file}: missing on disk`)
        continue
      }
      const meta = await sharp(sheetPath).metadata()
      const expectedW = sheet.cols * frameWidth
      const expectedH = sheet.rows * frameHeight
      if (meta.width !== expectedW || meta.height !== expectedH) {
        problems.push(
          `${hero}/${key}/${sheet.file}: real size ${meta.width}x${meta.height}, ` +
            `expected ${expectedW}x${expectedH} from manifest (cols=${sheet.cols} ` +
            `rows=${sheet.rows} frameWidth=${frameWidth} frameHeight=${frameHeight}) - ` +
            `output may have been scaled`
        )
      }
      if (meta.width > MAX_SHEET_PX || meta.height > MAX_SHEET_PX) {
        problems.push(
          `${hero}/${key}/${sheet.file}: ${meta.width}x${meta.height} exceeds the ` +
            `${MAX_SHEET_PX}px cap`
        )
      }
    }
  }
  return problems
}

const heroes = existsSync(HEROES_DIR)
  ? readdirSync(HEROES_DIR).filter((f) =>
      existsSync(path.join(HEROES_DIR, f, 'sheets'))
    )
  : []

let allProblems = []
for (const hero of heroes) {
  allProblems = allProblems.concat(await verifyHero(hero))
}

if (allProblems.length > 0) {
  console.error('Emote sheet manifest/pixel mismatches:')
  for (const p of allProblems) console.error(' -', p)
  process.exit(1)
}

console.log(`verify-emote-sheets: ${heroes.length} hero pack(s) OK`)
