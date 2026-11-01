/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { memo } from 'react'
import AnimatedSprite from './AnimatedSprite'
import { IconLock } from './GameIcons'
import { resolveEmoteAsset } from '../utils/emotes'
import './EmoteGlyph.css'

// The one way any screen turns an EMOTE StoreItem into a picture - see
// utils/emotes.js for why item.assetUrl alone is never enough. Falls back
// to the same lock-icon placeholder HeroItemShelf already used for a
// locked (hero-not-owned) card - a missing-asset gap and a locked item
// read the same way on purpose (both mean "nothing to show yet"); see
// warnMissingEmoteAssets for surfacing the gap itself in dev tools.
//
// Animates only when `active` - every other instance sits frozen on its
// first frame (animation-play-state: paused never even advances past the
// `from` keyframe, so this is a real static frame, not a mid-animation
// freeze). Shop grids used to run every tile's animation at once
// continuously regardless of whether it was being looked at - a real
// contributor to the Me/Emotes-section lag this was built to fix, on top
// of the asset-size one (see utils/emotes.js).
//
// memo()'d - every prop here is a primitive (heroName/emoteName/size/
// active), so a parent re-rendering for an unrelated reason (GamePage's
// standing GPS watch re-renders it every few seconds whether or not any of
// this changed) no longer re-creates/re-decodes the sprite each time, only
// an actual prop change does.
function EmoteGlyph({ heroName, emoteName, size = 96, active = false }) {
  const asset = resolveEmoteAsset(heroName, emoteName)
  if (!asset) {
    return (
      <span
        className="emote-glyph-placeholder"
        style={{ width: size, height: size }}
      >
        <IconLock aria-hidden="true" />
      </span>
    )
  }
  return (
    <AnimatedSprite
      {...asset}
      height={size}
      // 20fps (50ms/frame) - HeroFigure's 125/150ms (6.7-8fps) defaults
      // were tuned for its own slow stretch-pose strips, not these; left
      // at that pace, a quick action like Victory or Thumbs Up read as
      // sluggish slow motion, and a long strip (e.g. Bolt's 141-frame
      // Shoulder Rub, built from un-trimmed source frames) stretched to
      // a 20+ second loop. 20fps sits in the ~12-24fps range real motion
      // capture is usually shot at, so played-back speed roughly matches
      // the source regardless of how many frames a given strip has.
      frameMs={50}
      className={`emote-glyph-sprite ${active ? 'is-active' : ''}`}
    />
  )
}

export default memo(EmoteGlyph)
