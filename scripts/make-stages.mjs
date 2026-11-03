#!/usr/bin/env node
// Generates src/assets/heroes/<hero>/stage.webp for every hero, by hue-
// rotating src/assets/ui/stage/stage_base@2x.webp toward that hero's own
// stageHue (src/utils/heroStageColors.js). The base art is already purple
// (built around Nova), so Nova's own rotation is a no-op (copy as-is,
// "keep purple's original for Nova") and every other hero rotates relative
// to Nova's hue as the zero point.
//
// Rotating hue (not recolouring by mask) is what keeps the dark platform
// body dark "for free": sharp's modulate() only visibly shifts pixels that
// already have real saturation (the neon trim, the cloud glow) - the
// platform body is already near-black/low-saturation in the source art, so
// a hue rotation barely touches it.
//
// Run with: node scripts/make-stages.mjs
import { readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'
import { getHeroStageColor } from '../src/utils/heroStageColors.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const HEROES_DIR = path.join(ROOT, 'src/assets/heroes')
const BASE_STAGE = path.join(ROOT, 'src/assets/ui/stage/stage_base@2x.webp')

const NOVA_HUE = getHeroStageColor('nova').stageHue

function hueDelta(targetHue) {
  // Shortest signed rotation from Nova's hue to the target, in [-180, 180].
  let d = ((targetHue - NOVA_HUE + 540) % 360) - 180
  return d
}

async function main() {
  if (!existsSync(BASE_STAGE)) {
    throw new Error(`Missing base stage art at ${BASE_STAGE}`)
  }

  const heroes = readdirSync(HEROES_DIR).filter((name) =>
    existsSync(path.join(HEROES_DIR, name, 'manifest.json'))
  )

  // 1000px wide - plenty for a 2x render of the ~450-500px display size
  // HeroStage actually uses; the full 1800px base was 750-800KB per hero
  // for no visible gain at that display size.
  const OUTPUT_WIDTH = 1000

  for (const hero of heroes) {
    const { stageHue, stageColor } = getHeroStageColor(hero)
    const outFile = path.join(HEROES_DIR, hero, 'stage.webp')
    const image = sharp(BASE_STAGE).resize({ width: OUTPUT_WIDTH })

    if (hero === 'nova') {
      await image.webp({ quality: 88 }).toFile(outFile)
      console.log(`${hero.padEnd(10)} hue=${String(stageHue).padStart(3)} ${stageColor}  (base art, no rotation)`)
      continue
    }

    const delta = hueDelta(stageHue)
    await image
      .modulate({ hue: delta, saturation: 1.08 })
      .webp({ quality: 88 })
      .toFile(outFile)
    console.log(`${hero.padEnd(10)} hue=${String(stageHue).padStart(3)} ${stageColor}  (rotate ${delta.toFixed(0)}deg)`)
  }

  console.log(`\nWrote ${heroes.length} stage.webp files under src/assets/heroes/*/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
