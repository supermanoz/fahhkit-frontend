import blazeIdleStretchSheet from '../assets/images/blaze-profile-idle-stretch.png'
import blazeHipHopSheet from '../assets/images/blaze-profile-hiphop.png'
import blazeRunDownSheet from '../assets/images/blaze-map-run-down.png'
import blazeRunRightSheet from '../assets/images/blaze-map-run-right.png'
import cometIdleStretchSheet from '../assets/images/comet-profile-idle-stretch.png'
import cometHipHopSheet from '../assets/images/comet-profile-hiphop.png'

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
      // 48 frames (arm-stretch, straight-on render) - see
      // scripts/build_blaze_stretch_strips.py (the "idle" set). Same strip
      // HeroSprite.jsx plays on the Me tab/profile panel.
      idle: {
        src: blazeIdleStretchSheet,
        frames: 48,
        frameWidth: 151,
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
}

// TEMP: heroes with no entry above still borrow Blaze's strips (shows
// Blaze's look under a different name) until each one gets its own set -
// see scripts/build_blaze_stretch_strips.py / build_comet_stretch_strips.py.
export function getHeroSprite(name) {
  if (typeof name !== 'string') return HERO_SPRITES.blaze
  return HERO_SPRITES[name.trim().toLowerCase()] || HERO_SPRITES.blaze
}
