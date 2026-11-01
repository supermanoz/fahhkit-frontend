import { getHero, hasHero } from './heroManifest'

// Heroes with an animated idle turntable strip (see
// src/assets/heroes/<hero>/manifest.json's "profile" section - idle only,
// Hip Hop moved under "emotes" so it's never a free preview, see
// HeroGallery.jsx/HeroDetailModal.jsx). Keyed by lowercased hero name,
// since the backend's hero rows don't carry sprite data - a new hero gets
// animated here by dropping its own manifest.json + art in and nothing
// else.
//
// getHeroSprite/hasHeroSprite keep heroManifest.js's getHero/hasHero
// renamed and reshaped as `{ poses }` (dropping `map`/`emotes`, which
// TerritoryMap.jsx and utils/emotes.js read from heroManifest.js directly)
// so every existing caller (HeroSprite.jsx, HeroFigure.jsx,
// HeroDetailModal.jsx, ...) keeps working unchanged.

// TEMP: heroes with no entry above still borrow Blaze's strips (shows
// Blaze's look under a different name) until each one gets its own set.
export function getHeroSprite(name) {
  return { poses: getHero(name).poses }
}

// True only for a hero with a REAL manifest - unlike getHeroSprite, never
// coerced to the Blaze fallback. Lets a caller tell "this hero genuinely
// has dedicated pose art" apart from "this hero is silently borrowing
// Blaze's" (see EmoteShelf.jsx's own renderHeroCardArt, which used to show
// every hero without an entry here as Blaze - this is what lets it fall
// back to that hero's own portrait instead).
export function hasHeroSprite(name) {
  return hasHero(name)
}
