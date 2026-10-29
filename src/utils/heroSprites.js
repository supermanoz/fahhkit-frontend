import blazeIdleStretchSheet from '../assets/images/blaze-profile-idle-stretch.webp'
import blazeHipHopSheet from '../assets/images/blaze-profile-hiphop.webp'
import blazeRunDownSheet from '../assets/images/blaze-map-run-down.png'
import blazeRunRightSheet from '../assets/images/blaze-map-run-right.png'
import cometIdleStretchSheet from '../assets/images/comet-profile-idle-stretch.webp'
import cometHipHopSheet from '../assets/images/comet-profile-hiphop.webp'
import boltIdleStretchSheet from '../assets/images/bolt-profile-idle-stretch.webp'
import boltHipHopSheet from '../assets/images/bolt-profile-hiphop.webp'

// Heroes with animated strips (see scripts/build_blaze_stretch_strips.py).
// Each pose is its own horizontal strip of `frames` cells,
// every cell frameWidth x frameHeight px - geometry is per-pose (not
// shared across a hero) since idle's front-facing stretch strip is a
// different render entirely from the map's run/charge cycles. Keyed by
// lowercased hero name, since the backend's hero rows don't carry sprite
// data - a new hero gets animated here by dropping its strips in and
// adding an entry.
const HERO_SPRITES = {
  blaze: {
    poses: {
      // 48 frames (calm standing loop, straight-on render) - see
      // scripts/build_blaze_stretch_strips.py (the "idle" set, sourced from
      // the drop's own "idle" folder as of its latest asset refresh, not
      // "Arm stretching" any more). Same strip HeroSprite.jsx plays on the
      // Me tab/profile panel, and utils/emotes.js's "Classic" emote.
      idle: {
        src: blazeIdleStretchSheet,
        frames: 48,
        frameWidth: 163,
        frameHeight: 320,
      },
      // Shop hero card hover pose (HeroGallery.jsx) - also pickable on the
      // Hero Detail Modal's pose tabs. 24 frames, see
      // scripts/build_blaze_stretch_strips.py (the "hip_hop" set).
      hiphop: {
        src: blazeHipHopSheet,
        frames: 24,
        frameWidth: 233,
        frameHeight: 320,
      },
      run: {
        src: blazeRunRightSheet,
        frames: 4,
        frameWidth: 128,
        frameHeight: 170,
      },
      charge: {
        src: blazeRunDownSheet,
        frames: 4,
        frameWidth: 128,
        frameHeight: 170,
      },
    },
  },
  // See scripts/build_comet_stretch_strips.py (the "COMET" drop) - only
  // idle/hiphop exist for Comet: no map run cycle or Me-tab turntable has
  // been built for him yet, so he falls back to Blaze's for those.
  comet: {
    poses: {
      // Also backs utils/emotes.js's "Classic" emote - see Blaze's idle
      // entry above.
      idle: {
        src: cometIdleStretchSheet,
        frames: 48,
        frameWidth: 200,
        frameHeight: 320,
      },
      hiphop: {
        src: cometHipHopSheet,
        frames: 24,
        frameWidth: 273,
        frameHeight: 320,
      },
    },
  },
  // See scripts/build_bolt_stretch_strips.py (the "Bolt_1/Bolt" drop,
  // 2026-10-30). No run/charge poses - HeroDetailModal.jsx's MODAL_POSES
  // only ever offers 'idle'/'hiphop', so those two poses (which Blaze and
  // Comet both still carry above) are unreachable anywhere in the current
  // UI; skipped here rather than ship dead weight. Frame counts are lower
  // than Blaze/Comet's: WebP's 16,383px/side limit, not a style choice -
  // see the build script's own comment for the full reasoning.
  bolt: {
    poses: {
      idle: {
        src: boltIdleStretchSheet,
        frames: 101,
        frameWidth: 161,
        frameHeight: 320,
      },
      hiphop: {
        src: boltHipHopSheet,
        frames: 61,
        frameWidth: 267,
        frameHeight: 320,
      },
    },
  },
}

// TEMP: heroes with no entry above still borrow Blaze's strips (shows
// Blaze's look under a different name) until each one gets its own set -
// see scripts/build_blaze_stretch_strips.py / build_comet_stretch_strips.py.
export function getHeroSprite(name) {
  if (typeof name !== 'string') return HERO_SPRITES.blaze
  return HERO_SPRITES[name.trim().toLowerCase()] || HERO_SPRITES.blaze
}

// True only for a hero with a REAL entry above - unlike getHeroSprite,
// never coerced to the Blaze fallback. Lets a caller tell "this hero
// genuinely has dedicated pose art" apart from "this hero is silently
// borrowing Blaze's" (see EmoteShelf.jsx's own renderHeroCardArt, which
// used to show every hero without an entry here as Blaze - this is what
// lets it fall back to that hero's own portrait instead).
export function hasHeroSprite(name) {
  return (
    typeof name === 'string' && Boolean(HERO_SPRITES[name.trim().toLowerCase()])
  )
}
