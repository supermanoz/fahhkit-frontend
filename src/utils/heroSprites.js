import blazeIdleSheet from '../assets/images/blaze-map-idle.png'
import blazeRunDownSheet from '../assets/images/blaze-map-run-down.png'
import blazeRunRightSheet from '../assets/images/blaze-map-run-right.png'

// Heroes with hand-cut animated strips (see SESSION_NOTES "Blaze animated
// map sprite"). Each strip is `frames` cells laid out horizontally, every
// cell frameWidth x frameHeight px. Keyed by lowercased hero name, since
// the backend's hero rows don't carry sprite data - a new hero gets
// animated here by dropping its strips in and adding an entry.
const HERO_SPRITES = {
  blaze: {
    frames: 4,
    frameWidth: 128,
    frameHeight: 170,
    poses: {
      idle: blazeIdleSheet,
      run: blazeRunRightSheet,
      charge: blazeRunDownSheet,
    },
  },
}

export function getHeroSprite(name) {
  if (typeof name !== 'string') return null
  return HERO_SPRITES[name.trim().toLowerCase()] || null
}
