import blazeIdleStretchSheet from '../assets/images/blaze-profile-idle-stretch.png'
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

export function getHeroSprite(name) {
  if (typeof name !== 'string') return null
  return HERO_SPRITES[name.trim().toLowerCase()] || null
}
