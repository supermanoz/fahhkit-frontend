// Loads every hero's bundled sprite art from its own manifest.json (see
// src/assets/heroes/<hero>/) instead of a hand-written object per file -
// heroSprites.js and emotes.js both build their own narrower, function-
// shaped API on top of this. A new hero needs only a new
// src/assets/heroes/<hero>/ folder + manifest.json/sheets; nothing in this
// file or its two callers changes.
//
// Only the three heroes with real animated art (Blaze/Comet/Bolt) have a
// folder here - everything else (HERO/SKIN/AVATAR_BORDER/etc. store items,
// and any other hero's portrait) is an admin-uploaded image referenced by
// StoreItem.assetUrl/Hero.portraitUrl and resolved via resolveFileUrl
// instead, same as before this reorg - that content is never bundled, so it
// has no place in a build-time manifest like this one.
//
// Idle + every numbered emote now live under sheets/<key>/manifest.json
// (one lossless grid-sheet pack per sequence, built by
// scripts/build_emote_sheets.py from the raw source PNGs - see that
// script's own header for why: every source frame plays, at native
// resolution, with no per-emote fps or frame-count hand-typed anywhere).
// map/ (the on-map walking marker) is untouched, still a single-row strip
// built the old way (scripts/build_<hero>_stretch_strips.py) - a
// continuously-moving overlay on the live map is a different rendering
// problem than a framed emote/idle display, and was never the thing
// reported as "too fast" or "downsampled". manifest.json itself now only
// describes {hero, map} - profile/emotes sections are gone, replaced by
// the sheets/ directory itself being the source of truth (nothing here
// hardcodes which emotes a hero has, or how many frames one plays).
//
// Frame geometry here is native pixel size (frameWidth/frameHeight), used
// for aspect-ratio math (see AnimatedSprite.jsx) - it's NOT the on-screen
// display size, which TerritoryMap.css's own constants control for the
// map marker (see PLAYER_MARKER_SCALE in TerritoryMap.jsx). Playback speed
// is application logic, not asset metadata - see utils/spriteTiming.js.
const manifestModules = import.meta.glob('../assets/heroes/*/manifest.json', {
  eager: true,
  import: 'default',
})
// map/ art + stage.webp only - small, few files per hero, cheap to resolve
// eagerly (these are ?url string imports either way, never image bytes -
// see sheetUrlLoaders below for why sheets are kept lazy instead).
const assetUrls = import.meta.glob(
  ['../assets/heroes/*/map/*.{png,webp}', '../assets/heroes/*/stage.webp'],
  { eager: true, import: 'default', query: '?url' }
)
// Every sheets/<key>/manifest.json, eager - tiny JSON describing
// frameCount/frameWidth/frameHeight/sheets[], not image data, so there's
// no cost to knowing up front which emotes a hero has and how many frames
// each plays.
const sheetManifests = import.meta.glob(
  '../assets/heroes/*/sheets/*/manifest.json',
  { eager: true, import: 'default' }
)
// The actual sheet images (lossless WebP or PNG) - eager: false, so these
// stay as async loader functions (`() => Promise<{default: url}>`) that
// AnimatedSprite.jsx only calls once a given emote is actually shown (see
// its own "lazy load, cache, release" behaviour, utils/spriteSheetCache.js)
// instead of every hero's every emote's every sheet being resolved at
// startup.
const sheetUrlLoaders = import.meta.glob(
  '../assets/heroes/*/sheets/*/*.{webp,png}',
  { eager: false, import: 'default', query: '?url' }
)

const HEROES = {}
for (const [manifestPath, manifest] of Object.entries(manifestModules)) {
  const heroDir = manifestPath.slice(0, -'/manifest.json'.length)
  HEROES[manifest.hero] = resolveManifest(manifest, heroDir)
}

// Turns one {file, frames, frameWidth, frameHeight} map-marker manifest
// entry into {src, frames, frameWidth, frameHeight} by looking the file up
// in assetUrls - warns (not throws) if a manifest lists a file that isn't
// actually on disk, so a bad manifest edit shows up loudly in the console/
// CI instead of silently rendering a broken image. map/ only - sheets/ has
// its own resolver (resolveSheets) below.
function resolveMapEntry(heroName, heroDir, entry) {
  const url = assetUrls[`${heroDir}/${entry.file}`]
  if (!url) {
    console.warn(
      `[heroManifest] ${heroName}: "${entry.file}" is listed in manifest.json but no such asset was found`
    )
  }
  return {
    frames: entry.frames,
    frameWidth: entry.frameWidth,
    frameHeight: entry.frameHeight,
    src: url,
  }
}

function resolveMap(heroName, heroDir, group) {
  const out = {}
  for (const [key, entry] of Object.entries(group || {})) {
    out[key] = resolveMapEntry(heroName, heroDir, entry)
  }
  return out
}

// {key: {frameCount, frameWidth, frameHeight, sheets: [{cols, rows,
// frames, loadUrl}]}} for every sheets/<key>/ this hero has - "idle" plus
// however many numbered emotes its source drop had (see
// scripts/build_emote_sheets.py's own CATEGORY_ORDER walk; this file never
// hardcodes which keys exist or how many, it just lists whatever
// sheetManifests actually found on disk for this hero).
function resolveSheets(heroName, heroDir) {
  const prefix = `${heroDir}/sheets/`
  const out = {}
  for (const [path, manifest] of Object.entries(sheetManifests)) {
    if (!path.startsWith(prefix)) continue
    const key = path.slice(prefix.length, -'/manifest.json'.length)
    const dir = path.slice(0, -'/manifest.json'.length)
    const sheets = (manifest.sheets || []).map((s) => {
      const loadUrl = sheetUrlLoaders[`${dir}/${s.file}`]
      if (!loadUrl) {
        console.warn(
          `[heroManifest] ${heroName}: sheets/${key}/"${s.file}" is listed in its manifest.json but no such asset was found`
        )
      }
      return { cols: s.cols, rows: s.rows, frames: s.frames, loadUrl }
    })
    out[key] = {
      frameCount: manifest.frameCount,
      frameWidth: manifest.frameWidth,
      frameHeight: manifest.frameHeight,
      sheets,
    }
  }
  return out
}

function resolveManifest(manifest, heroDir) {
  const map = resolveMap(manifest.hero, heroDir, manifest.map)
  const sheets = resolveSheets(manifest.hero, heroDir)

  // "poses" keeps heroSprites.js/HeroFigure.jsx's existing API (only
  // "idle" has ever existed here - see heroSprites.js's own comment).
  // "emotes" keeps emotes.js's existing API, "emote1" aliased onto idle
  // exactly as it always was ({pose: "idle"} in the old manifest.json
  // just pointed at the same already-resolved data this does now).
  const poses = sheets.idle ? { idle: sheets.idle } : {}
  const emotes = { ...sheets }
  if (sheets.idle) emotes.emote1 = sheets.idle
  delete emotes.idle

  return { poses, map, emotes }
}

// The hero names with a real manifest (blaze/comet/bolt today) - unlike
// getHeroSprite, never coerced to a fallback.
export function hasHero(name) {
  return typeof name === 'string' && Boolean(HEROES[name.trim().toLowerCase()])
}

// TEMP: heroes with no manifest still borrow Blaze's art (shows Blaze's
// look under a different name) until each one gets its own folder - same
// fallback heroSprites.js/emotes.js always had.
export function getHero(name) {
  if (typeof name !== 'string') return HEROES.blaze
  return HEROES[name.trim().toLowerCase()] || HEROES.blaze
}

// This hero's stage.webp (src/components/HeroStage.jsx) - generated by
// scripts/make-stages.mjs, not listed in manifest.json, so it's resolved
// straight off assetUrls (the same glob everything else here goes through)
// rather than through resolveManifest. Same Blaze fallback as getHero.
export function getHeroStageSrc(name) {
  const key = typeof name === 'string' ? name.trim().toLowerCase() : 'blaze'
  return (
    assetUrls[`../assets/heroes/${key}/stage.webp`] ||
    assetUrls['../assets/heroes/blaze/stage.webp']
  )
}
