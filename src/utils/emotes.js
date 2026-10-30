import { getHeroSprite } from './heroSprites'
import blazeEmoteVictorySheet from '../assets/images/blaze-emote-victory.webp'
import blazeEmoteCheckingShoesSheet from '../assets/images/blaze-emote-checking-shoes.webp'
import blazeEmoteJumpingJackSheet from '../assets/images/blaze-emote-jumping-jack.webp'
import blazeEmoteShoulderRubSheet from '../assets/images/blaze-emote-shoulder-rub.webp'
import blazeEmoteSquatSheet from '../assets/images/blaze-emote-squat.webp'
import cometEmoteVictorySheet from '../assets/images/comet-emote-victory.webp'
import cometEmoteJumpingJackSheet from '../assets/images/comet-emote-jumping-jack.webp'
import cometEmoteShoulderRubSheet from '../assets/images/comet-emote-shoulder-rub.webp'
import cometEmoteSquatSheet from '../assets/images/comet-emote-squat.webp'
import boltEmoteVictorySheet from '../assets/images/bolt-emote-victory.webp'
import boltEmoteCheckingShoesSheet from '../assets/images/bolt-emote-checking-shoes.webp'
import boltEmoteJumpingJackSheet from '../assets/images/bolt-emote-jumping-jack.webp'
import boltEmoteShoulderRubSheet from '../assets/images/bolt-emote-shoulder-rub.webp'
import boltEmoteSquatSheet from '../assets/images/bolt-emote-squat.webp'
import boltEmoteThumbsUpSheet from '../assets/images/bolt-emote-thumbs-up.webp'
import boltEmoteWavingHandSheet from '../assets/images/bolt-emote-waving-hand.webp'

// Central emote registry - the ONLY place in the app that turns an EMOTE
// StoreItem into a picture. StoreItem.assetUrl is never populated for
// category EMOTE (see the backend's own StoreItem.java field comment -
// EMOTE isn't in its "populated for" list, and migration V1_64 seeds every
// hero's free "Classic" emote with asset_url explicitly null), so there is
// no server-provided image to resolve - every screen that shows emote art
// (shop EmoteShelf/HeroItemShelf, the buy/preview confirm card, and
// anywhere else one shows up later - PvP, run view, ...) must go through
// resolveEmoteAsset below instead of reading item.assetUrl itself, or it
// will always get a locked/blank card.
//
// Keyed by hero name, then by the backend StoreItem.name, both lowercased
// and trimmed to match getHeroSprite's own convention (utils/heroSprites.js)
// - a new hero's emotes need only a new entry here (plus the art itself in
// assets/images, built via scripts/build_<hero>_stretch_strips.py's own
// "emote_*" sets), nothing else in the app.
//
// An entry here only lights up in the Shop once a matching EMOTE StoreItem
// row exists with that exact name (case-insensitive) and the right heroId -
// see src/components/EmoteAdminPanel.jsx (GameMechanicsPage.jsx's "Emotes"
// admin tool), which creates those rows against the backend's existing
// POST /v1/store/admin/items.
//
//  - "Classic" (the one free emote every hero actually has a row for today,
//    and this registry's "default emote" - see EmoteShelf.jsx's hero-picker
//    card and HeroItemShelf.jsx's renderHeroCardArt) has no dedicated art of
//    its own. Mapped here to the hero's own idle strip (heroSprites.js)
//    rather than show a placeholder for literally every player's default
//    emote.
//  - "Hip Hop" is a second, buyable emote built the same way - the
//    hiphop/"signature dance" strip (heroSprites.js) is real dedicated art,
//    just not EMOTE-specific art, so it's reused here as its own emote
//    instead of only backing Classic.
//  - Everything below is EMOTE-dedicated art, built at EMOTE_CELL_H (see
//    scripts/build_<hero>_stretch_strips.py) rather than the full profile
//    height - these never render above ~140px (the buy/showcase popup is
//    the largest caller), so the old 320px-tall strips were pure decode/
//    memory waste, a root cause of the Me/Emotes-section lag this was
//    rebuilt to fix.
//  - Blaze's source drop has 4 extra poses nothing else in the app uses
//    (Checking Shoes, Jumping Jack, Shoulder Rub, Squat) plus Victory;
//    Comet's drop has only 3 of those (Jumping Jack, Shoulder Rub, Squat)
//    plus Victory - no Checking Shoes folder for him, so he has one fewer
//    emote available than Blaze until more art exists.
const EXTRA_EMOTE_SPRITES = {
  blaze: {
    victory: {
      src: blazeEmoteVictorySheet,
      frames: 24,
      frameWidth: 120,
      frameHeight: 190,
    },
    'checking shoes': {
      src: blazeEmoteCheckingShoesSheet,
      frames: 24,
      frameWidth: 114,
      frameHeight: 190,
    },
    'jumping jack': {
      src: blazeEmoteJumpingJackSheet,
      frames: 24,
      frameWidth: 133,
      frameHeight: 190,
    },
    'shoulder rub': {
      src: blazeEmoteShoulderRubSheet,
      frames: 24,
      frameWidth: 111,
      frameHeight: 190,
    },
    squat: {
      src: blazeEmoteSquatSheet,
      frames: 24,
      frameWidth: 100,
      frameHeight: 190,
    },
  },
  comet: {
    victory: {
      src: cometEmoteVictorySheet,
      frames: 24,
      frameWidth: 96,
      frameHeight: 190,
    },
    'jumping jack': {
      src: cometEmoteJumpingJackSheet,
      frames: 24,
      frameWidth: 148,
      frameHeight: 190,
    },
    'shoulder rub': {
      src: cometEmoteShoulderRubSheet,
      frames: 24,
      frameWidth: 127,
      frameHeight: 190,
    },
    squat: {
      src: cometEmoteSquatSheet,
      frames: 24,
      frameWidth: 98,
      frameHeight: 190,
    },
  },
  // See scripts/build_bolt_stretch_strips.py (the "Bolt_1/Bolt" drop) -
  // Bolt's source has every pose Blaze does (Checking Shoes included) plus
  // two nobody else has yet: Thumbs Up and Waving Hand. Both need a real
  // EMOTE StoreItem row before they're purchasable (see this file's own
  // top comment) - ask an admin to create them via EmoteAdminPanel.jsx
  // with exactly these names, heroId = Bolt's.
  bolt: {
    victory: {
      src: boltEmoteVictorySheet,
      frames: 109,
      frameWidth: 119,
      frameHeight: 190,
    },
    'checking shoes': {
      src: boltEmoteCheckingShoesSheet,
      frames: 114,
      frameWidth: 106,
      frameHeight: 190,
    },
    'jumping jack': {
      src: boltEmoteJumpingJackSheet,
      frames: 27,
      frameWidth: 132,
      frameHeight: 190,
    },
    'shoulder rub': {
      src: boltEmoteShoulderRubSheet,
      frames: 141,
      frameWidth: 99,
      frameHeight: 190,
    },
    squat: {
      src: boltEmoteSquatSheet,
      frames: 45,
      frameWidth: 104,
      frameHeight: 190,
    },
    'thumbs up': {
      src: boltEmoteThumbsUpSheet,
      frames: 101,
      frameWidth: 103,
      frameHeight: 190,
    },
    'waving hand': {
      src: boltEmoteWavingHandSheet,
      frames: 36,
      frameWidth: 107,
      frameHeight: 190,
    },
  },
}

// Emote name -> hero-body pose key (heroSprites.js), for emotes that reuse
// an existing body-pose strip instead of having dedicated emote art.
const EMOTE_NAME_TO_POSE = {
  classic: 'idle',
  'hip hop': 'hiphop',
}

// Returns {src, frames, frameWidth, frameHeight} for a given hero name +
// backend StoreItem.name, or null if this registry has no art for it (the
// caller shows its own placeholder - see EmoteGlyph.jsx).
export function resolveEmoteAsset(heroName, emoteName) {
  const heroKey = (heroName || '').trim().toLowerCase()
  const emoteKey = (emoteName || '').trim().toLowerCase()
  if (!heroKey || !emoteKey) return null

  const extra = EXTRA_EMOTE_SPRITES[heroKey]?.[emoteKey]
  if (extra) return extra

  const poseKey = EMOTE_NAME_TO_POSE[emoteKey]
  if (!poseKey) return null
  return getHeroSprite(heroKey).poses[poseKey] || null
}

function titleCase(key) {
  return key.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Every emote name this registry has art for, for a given hero (Title
// Case, e.g. "Jumping Jack") - EmoteAdminPanel.jsx uses this to suggest
// names when creating a StoreItem row, so the name typed in matches this
// registry's keys exactly instead of silently landing on no art.
export function knownEmoteNames(heroName) {
  const heroKey = (heroName || '').trim().toLowerCase()
  const extra = Object.keys(EXTRA_EMOTE_SPRITES[heroKey] || {})
  return [...Object.keys(EMOTE_NAME_TO_POSE), ...extra].map(titleCase)
}

// Scans a catalog of EMOTE StoreItemResponse rows against this registry and
// console.warns once with every (hero, emote name, id) this registry has no
// art for - call it wherever the catalog is loaded (see GamePage.jsx) so a
// gap is loud in dev tools instead of silently showing a placeholder
// forever, unnoticed, in production.
export function warnMissingEmoteAssets(emoteItems, heroes) {
  const missing = (emoteItems || [])
    .map((item) => ({
      item,
      heroName: heroes?.find((h) => h.id === item.heroId)?.name,
    }))
    .filter(({ heroName }) => heroName)
    .filter(({ item, heroName }) => !resolveEmoteAsset(heroName, item.name))
  if (missing.length === 0) return
  console.warn(
    '[emotes] no local asset mapped for:',
    missing.map(({ item, heroName }) => `${heroName}/${item.name} (${item.id})`)
  )
}
