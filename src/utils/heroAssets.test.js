// @vitest-environment node
// Build guard for every hero's idle + emote sprite packs
// (src/assets/heroes/<hero>/sheets/<key>/): a bad export fails the build.
// Checks: manifest sane, every sheet file + poster exists, frame counts add
// up, pixel size = cols*cell x rows*cell, sheet fits its grid, sheet isn't
// fully transparent, and no single frame is blank.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/heroes'
)
const MAX_SHEET_PX = 4096

async function checkPack(hero, key, dir) {
  const problems = []
  const tag = `${hero}/${key}`
  const mPath = path.join(dir, 'manifest.json')
  if (!existsSync(mPath)) return [`${tag}: manifest.json missing`]
  const m = JSON.parse(readFileSync(mPath, 'utf8'))
  if (!(m.frameCount > 0))
    problems.push(`${tag}: frameCount is ${m.frameCount}`)
  if (!(m.frameWidth > 0 && m.frameHeight > 0))
    problems.push(`${tag}: bad frame size ${m.frameWidth}x${m.frameHeight}`)
  if (!Array.isArray(m.sheets) || !m.sheets.length)
    return [...problems, `${tag}: no sheets[]`]
  const sum = m.sheets.reduce((n, s) => n + s.frames, 0)
  if (sum !== m.frameCount)
    problems.push(`${tag}: frameCount ${m.frameCount} != sheets sum ${sum}`)
  if (m.poster && !existsSync(path.join(dir, m.poster)))
    problems.push(`${tag}: poster ${m.poster} missing`)
  const cw = m.sheetFrameWidth ?? m.frameWidth
  const ch = m.sheetFrameHeight ?? m.frameHeight

  for (const s of m.sheets) {
    const file = path.join(dir, s.file)
    if (!existsSync(file)) {
      problems.push(`${tag}/${s.file}: file missing`)
      continue
    }
    if (s.cols * s.rows < s.frames)
      problems.push(
        `${tag}/${s.file}: ${s.cols}x${s.rows} grid < ${s.frames} frames`
      )
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (info.width !== s.cols * cw || info.height !== s.rows * ch)
      problems.push(
        `${tag}/${s.file}: size ${info.width}x${info.height}, expected ${s.cols * cw}x${s.rows * ch}`
      )
    if (info.width > MAX_SHEET_PX || info.height > MAX_SHEET_PX)
      problems.push(`${tag}/${s.file}: exceeds ${MAX_SHEET_PX}px`)
    let opaque = 0
    const blank = []
    for (let f = 0; f < s.frames; f += 1) {
      const c = f % s.cols
      const r = Math.floor(f / s.cols)
      let n = 0
      for (let y = 0; y < ch; y += 2) {
        const base = ((r * ch + y) * info.width + c * cw) * 4
        for (let x = 0; x < cw; x += 2) if (data[base + x * 4 + 3] > 8) n += 1
      }
      if (n === 0) blank.push(f)
      opaque += n
    }
    if (opaque === 0) problems.push(`${tag}/${s.file}: fully transparent`)
    else if (blank.length)
      problems.push(
        `${tag}/${s.file}: ${blank.length} blank frame(s), e.g. #${blank[0]}`
      )
  }
  return problems
}

describe('hero sprite packs', () => {
  const heroes = readdirSync(ROOT).filter((h) =>
    existsSync(path.join(ROOT, h, 'sheets'))
  )

  it('has hero packs', () => {
    expect(heroes.length).toBeGreaterThan(0)
  })

  for (const hero of heroes) {
    it(`${hero}: idle + every emote pack is valid`, async () => {
      const sheetsDir = path.join(ROOT, hero, 'sheets')
      const keys = readdirSync(sheetsDir)
      expect(keys).toContain('idle')
      const problems = []
      for (const key of keys) {
        problems.push(
          ...(await checkPack(hero, key, path.join(sheetsDir, key)))
        )
      }
      expect(problems).toEqual([])
    }, 120_000)
  }
})
