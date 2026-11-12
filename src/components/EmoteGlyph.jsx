/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { memo } from 'react'
import AnimatedSprite from './AnimatedSprite'
import { IconLock } from './GameIcons'
import { resolveEmoteAsset } from '../utils/emotes'
import './EmoteGlyph.css'

// The one way any screen turns an EMOTE StoreItem into a picture - see
// utils/emotes.js for why item.assetUrl alone is never enough. Falls back
// to the same lock-icon placeholder HeroGallery already uses for a locked
// (not-owned) hero card - a missing-asset gap and a locked item read the
// same way on purpose (both mean "nothing to show yet"); see
// warnMissingEmoteAssets for surfacing the gap itself in dev tools.
//
// Animates only when `active` - `active` is now a real prop AnimatedSprite
// itself reads (not just a CSS class): every inactive instance shows a
// cheap static frame-0 crop and never decodes or acquires its sheets at
// all (see AnimatedSprite.jsx/utils/spriteSheetCache.js), so a Shop grid
// of many tiles only ever pays the real decode/canvas/rAF cost for
// whichever one tile is actually being looked at - the same "don't
// animate every tile at once" fix this always had, now extended to "don't
// even load every tile's full sheet set" given sheets can be large (see
// utils/emotes.js for the asset-size history this already dealt with
// once).
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
      active={active}
      className="emote-glyph-sprite"
    />
  )
}

export default memo(EmoteGlyph)
