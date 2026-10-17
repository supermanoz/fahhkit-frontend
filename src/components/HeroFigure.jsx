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
    const isIdle = pose === 'idle'
    const { src, frames, frameWidth, frameHeight } =
      sprite.poses[pose] || sprite.poses.idle
    const width = Math.round((height * frameWidth) / frameHeight)
    // Idle's strip (a full-body stretch) has far more frames than a run/
    // charge cycle - a flat animation-duration tuned for 4 frames would
    // blur straight through all 48 of them. Pace per-frame instead so any
    // strip plays at a readable speed regardless of its frame count: ~150ms
    // for a relaxed stretch (matches HeroSprite.jsx's own idle), ~125ms for
    // a snappy run/charge loop (the pre-existing 0.5s / 4-frame feel).
    const frameMs = isIdle ? 150 : 125
    return (
      <span
        key={src}
        className={`hero-figure-sprite is-${isIdle ? 'idle' : 'moving'}`}
        style={{
          width,
          height,
          backgroundImage: `url(${src})`,
          '--hero-strip-width': `${width * frames}px`,
          '--hero-frames': frames,
          animationDuration: `${frames * frameMs}ms`,
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
