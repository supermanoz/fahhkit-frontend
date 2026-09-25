/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { resolveFileUrl } from '../api/client'
import { getHeroSprite } from '../utils/heroSprites'
import { getAvatarByName } from '../constants/avatars'
import './HeroFigure.css'

// A hero's full-body look: its animated sprite strip when one exists (see
// utils/heroSprites.js), else its flat portrait (hero.portraitUrl, then the
// same-named character art from constants/avatars.js, then the first skin's
// asset), else its initial. `pose` falls back to idle when the
// hero has no strip for it.
export default function HeroFigure({ hero, pose = 'idle', height = 170 }) {
  const sprite = getHeroSprite(hero?.name)
  if (sprite) {
    const sheet = sprite.poses[pose] || sprite.poses.idle
    const width = Math.round((height * sprite.frameWidth) / sprite.frameHeight)
    return (
      <span
        key={sheet}
        className={`hero-figure-sprite is-${pose === 'idle' ? 'idle' : 'moving'}`}
        style={{
          width,
          height,
          backgroundImage: `url(${sheet})`,
          '--hero-strip-width': `${width * sprite.frames}px`,
          '--hero-frames': sprite.frames,
        }}
        aria-hidden="true"
      />
    )
  }

  const portrait =
    resolveFileUrl(hero?.portraitUrl) ||
    getAvatarByName(hero?.name)?.src ||
    resolveFileUrl(hero?.skins?.find((s) => s.assetUrl)?.assetUrl)
  if (portrait) {
    return (
      <img
        className="hero-figure-portrait"
        src={portrait}
        alt=""
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }
  return (
    <span className="hero-figure-initial" aria-hidden="true">
      {hero?.name?.[0]}
    </span>
  )
}
