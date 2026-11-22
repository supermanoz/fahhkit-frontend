#!/usr/bin/env node
// Fails (exit 1) if anything in src/ points at an image/audio/json asset that
// is not on disk: static imports, import()/glob-free string paths, CSS url(),
// every hero manifest.json file (map strips, sheets, poster) and the public/
// files referenced via BASE_URL. Run after any asset change:
//   node scripts/verify-assets.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const PUBLIC = path.join(ROOT, 'public')
const EXT = '(?:png|jpe?g|jfif|webp|gif|svg|mp3|ogg|wav|m4a|json|ico|woff2?)'
const missing = []
let checked = 0

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function check(fromFile, ref, resolved) {
  checked += 1
  if (!fs.existsSync(resolved)) {
    missing.push(`${path.relative(ROOT, fromFile)}: ${ref}`)
  }
}

for (const file of walk(SRC)) {
  if (/\.test\.[jt]sx?$/.test(file)) continue
  const ext = path.extname(file)
  if (!['.js', '.jsx', '.css'].includes(ext)) continue
  const text = fs.readFileSync(file, 'utf8')
  const dir = path.dirname(file)
  // import x from './a.png' / import('./a.png') / import './a.css'
  const importRe = new RegExp(
    `(?:from\\s+|import\\s*\\(?\\s*)['"](\\.{1,2}/[^'"\\n]+?\\.${EXT})(?:\\?[^'"]*)?['"]`,
    'g'
  )
  for (const m of text.matchAll(importRe))
    check(file, m[1], path.resolve(dir, m[1]))
  if (ext === '.css') {
    for (const m of text.matchAll(
      /url\(\s*['"]?(\.{1,2}\/[^'")\s]+?)['"]?\s*\)/g
    )) {
      check(file, m[1], path.resolve(dir, m[1].split(/[?#]/)[0]))
    }
  }
  for (const m of text.matchAll(
    new RegExp('BASE_URL\\}([A-Za-z0-9_./-]+\\.' + EXT + ')', 'g')
  )) {
    check(file, `BASE_URL ${m[1]}`, path.join(PUBLIC, m[1]))
  }
}

// Hero manifests: every file they name must exist.
const heroes = path.join(SRC, 'assets', 'heroes')
for (const hero of fs.readdirSync(heroes)) {
  const heroDir = path.join(heroes, hero)
  const top = path.join(heroDir, 'manifest.json')
  if (fs.existsSync(top)) {
    const m = JSON.parse(fs.readFileSync(top, 'utf8'))
    for (const entry of Object.values(m.map || {})) {
      check(top, entry.file, path.join(heroDir, entry.file))
    }
  }
  const sheets = path.join(heroDir, 'sheets')
  if (!fs.existsSync(sheets)) continue
  for (const key of fs.readdirSync(sheets)) {
    const mp = path.join(sheets, key, 'manifest.json')
    if (!fs.existsSync(mp)) continue
    const m = JSON.parse(fs.readFileSync(mp, 'utf8'))
    for (const s of m.sheets || [])
      check(mp, s.file, path.join(sheets, key, s.file))
    if (m.poster) check(mp, m.poster, path.join(sheets, key, m.poster))
    else missing.push(`${path.relative(ROOT, mp)}: no poster listed`)
  }
}

if (missing.length) {
  console.error(
    `${missing.length} broken reference(s):\n  ` + missing.join('\n  ')
  )
  process.exit(1)
}
console.log(`ok: ${checked} asset references verified`)
