import blazeIdleStretchSheet from '../assets/images/blaze-profile-idle-stretch.png'
import blazeHipHopSheet from '../assets/images/blaze-profile-hiphop.png'
import blazeRunDownSheet from '../assets/images/blaze-map-run-down.png'
import blazeRunRightSheet from '../assets/images/blaze-map-run-right.png'

// Heroes with hand-cut animated strips (see SESSION_NOTES "Blaze animated
// map sprite"). Each pose is its own horizontal strip of `frames` cells,
// every cell frameWidth x frameHeight px - geometry is per-pose (not
// shared across a hero) since idle's front-facing stretch strip is a
// different render entirely from the map's run/charge cycles. Keyed by
// lowercased hero name, since the backend's hero rows don't carry sprite
// data - a new hero gets animated here by dropping its strips in and
// adding an entry.
const HERO_SPRITES = {
  blaze: {
    poses: {
      // 48 frames (shoulder stretch + arm stretch, straight-on render) -
      // see scripts/build_blaze_stretch_strips.py. Same strip HeroSprite.jsx
      // plays on the Me tab/profile panel.
      idle: {
        src: blazeIdleStretchSheet,
        frames: 48,
        frameWidth: 200,
        frameHeight: 320,
      },
      // Shop hero card hover pose (HeroGallery.jsx) - also pickable on the
      // Hero Detail Modal's pose tabs. 24 frames, see
      // scripts/build_blaze_stretch_strips.py (the "hip_hop" set).
      hiphop: {
        src: blazeHipHopSheet,
        frames: 24,
        frameWidth: 230,
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
}

// TEMP: no other hero has its own render yet, so every hero borrows
// Blaze's strips for now (shows Blaze's look under a different name) until
// each one gets its own set - see scripts/build_blaze_stretch_strips.py.
export function getHeroSprite(name) {
  if (typeof name !== 'string') return HERO_SPRITES.blaze
  return HERO_SPRITES[name.trim().toLowerCase()] || HERO_SPRITES.blaze
}
