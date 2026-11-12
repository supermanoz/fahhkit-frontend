/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { getHeroSprite } from '../utils/heroSprites'
import AnimatedSprite from './AnimatedSprite'

// Heroes are normally a single static image (StoreItemCategoryConstant.HERO
// assetUrl, or a free local avatars.js pick) - Blaze and Comet are the
// exception, standing in for a "3D model" turntable on the Me tab/profile
// panel with a looping animation instead. Just the shared AnimatedSprite
// player (see that component) at this call site's one fixed size - idle
// turntables and every emote now play through the exact same grid-sheet
// player at the same one shared pace, rather than this component owning
// its own separate rAF/background-position loop the way it used to.
//
// Only ever plays the hero's `idle` pose (see heroSprites.js/
// heroManifest.js) - the Me tab's "showcase" is deliberately idle-only, by
// rule: any other pose (a wave, a dance, a stretch - anything that reads
// as a deliberate gesture rather than a relaxed loop) belongs in the
// Shop's Emote section instead, not here. This is data-driven off
// heroSprites.js's own `poses` keys rather than a hardcoded hero-by-hero
// list, so a new hero picks this up automatically the moment it gets an
// `idle` sheet pack - no change needed in this file.
export default function HeroSprite({ size = 96, hero }) {
  const idle = getHeroSprite(hero).poses.idle
  return <AnimatedSprite {...idle} height={size} active />
}
