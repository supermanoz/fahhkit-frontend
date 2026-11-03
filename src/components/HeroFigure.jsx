/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { resolveFileUrl } from '../api/client'
import { getHeroSprite } from '../utils/heroSprites'
import { getAvatarByName } from '../constants/avatars'
import AnimatedSprite from './AnimatedSprite'
import './HeroFigure.css'

// A hero's full-body look: its animated sprite strip when one exists (see
// utils/heroSprites.js), else its flat portrait (hero.portraitUrl, then the
// same-named character art from constants/avatars.js), else its initial.
// `pose` falls back to idle when the hero has no strip for it.
export default function HeroFigure({ hero, pose = 'idle', height = 170 }) {
  const sprite = getHeroSprite(hero?.name)
  if (sprite) {
    const isIdle = pose === 'idle'
    const poseData = sprite.poses[pose] || sprite.poses.idle
    return <AnimatedSprite {...poseData} height={height} fast={!isIdle} />
  }

  const portrait =
    resolveFileUrl(hero?.portraitUrl) || getAvatarByName(hero?.name)?.src
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
