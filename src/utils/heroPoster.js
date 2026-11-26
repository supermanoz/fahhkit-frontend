import { acquireSheet } from './spriteSheetCache'

// Hero Poster share card: which poster to use, its per-hero tuning, and a
// lazy loader that follows the sprite-sheet memory rules (decoded only when a
// card needs it, ref-counted, closed as soon as nobody holds it - a 1080x1920
// poster is ~8 MB decoded).

// Posters live in src/assets/share/hero-posters/<hero>.webp (1080x1920, q80),
// named by the lowercased hero name: that is the key every other hero asset
// in the app uses (src/assets/heroes/<hero>/), and the server's hero ids are
// opaque, so ids are mapped to names through the cached hero list.
const posterLoaders = import.meta.glob('../assets/share/hero-posters/*.webp', {
  query: '?url',
  import: 'default',
})
const keyOf = (path) => path.split('/').pop().replace('.webp', '')
const POSTER_KEYS = new Set(Object.keys(posterLoaders).map(keyOf))

export const DEFAULT_POSTER_HERO = 'comet' // the app's default hero

// Per-hero tuning, edited by hand: where the stats column sits (canvas px,
// 1080 wide), how wide a value may get, and how strong the right-edge scrim
// is ('none' | 'light' | 'medium'). Heroes not listed use the defaults.
export const POSTER_DEFAULTS = {
  statsColumnCenterX: 830,
  colWidth: 330,
  scrim: 'light',
}
export const POSTER_CONFIG = {
  nova: {},
  cyclone: {},
  pulse: {},
  phantom: {},
  blaze: {},
  comet: {},
  bolt: {},
}
export function posterConfig(heroKey) {
  return { ...POSTER_DEFAULTS, ...(POSTER_CONFIG[heroKey] || {}) }
}

export function hasPoster(heroKey) {
  return POSTER_KEYS.has(heroKey)
}

const HEROES_CACHE_KEY = 'shop.heroes.v1' // written by GamePage's shop load
function cachedHeroes() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HEROES_CACHE_KEY))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// One {heroId, heroName} -> poster key, or null when it is not a poster hero.
function keyFor(hero, heroes) {
  const { heroId, heroName } = hero || {}
  const byName = String(heroName ?? '')
    .trim()
    .toLowerCase()
  if (byName && POSTER_KEYS.has(byName)) return byName
  if (heroId != null && heroId !== '') {
    const hit = heroes.find((h) => String(h?.id) === String(heroId))
    const name = String(hit?.name ?? '')
      .trim()
      .toLowerCase()
    if (name && POSTER_KEYS.has(name)) return name
    const raw = String(heroId).trim().toLowerCase()
    if (POSTER_KEYS.has(raw)) return raw
  }
  return null
}

// Order: (1) the server's run.loadout, (2) the heroId saved on the run record
// at run start (offline, Training and old runs have no loadout), (3) the
// equipped hero. A missing or unknown hero falls through silently, ending on
// the default hero so the card is never blank.
export function resolveHeroKey(run, fallback, heroes = cachedHeroes()) {
  return (
    keyFor(run?.loadout, heroes) ||
    keyFor({ heroId: run?.heroId ?? run?.meta?.heroId }, heroes) ||
    keyFor({ heroId: fallback?.id, heroName: fallback?.name }, heroes) ||
    DEFAULT_POSTER_HERO
  )
}

// { ready, release } - the decoded poster, held only while a card uses it.
export function acquirePoster(heroKey) {
  const key = hasPoster(heroKey) ? heroKey : DEFAULT_POSTER_HERO
  let release = () => {}
  let released = false
  const ready = posterLoaders[
    `../assets/share/hero-posters/${key}.webp`
  ]().then((url) => {
    const held = acquireSheet(url, 0)
    release = held.release
    if (released) release()
    return held.ready
  })
  return {
    ready,
    release: () => {
      released = true
      release()
    },
  }
}
