/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { getHeroSprite } from '../utils/heroSprites'
import './HeroSprite.css'

// Heroes are normally a single static image (StoreItemCategoryConstant.HERO
// assetUrl, or a free local avatars.js pick) - Blaze and Comet are the
// exception, standing in for a "3D model" turntable on the Me tab/profile
// panel with a looping animation instead.
//
// Only ever plays the hero's `idle` pose (see heroSprites.js/
// heroManifest.js) - the Me tab's "showcase" is deliberately idle-only, by
// rule: any other
// pose (a wave, a dance, a stretch - anything that reads as a deliberate
// gesture rather than a relaxed loop) belongs in the Shop's Emote section
// instead, not here. This is data-driven off heroSprites.js's own `poses`
// keys rather than a hardcoded hero-by-hero list, so a new hero picks this
// up automatically the moment it gets an `idle` entry there - no change
// needed in this file. (This used to play its own separate wave-then-
// neck-stretch loop pulled from a different sheet entirely - replaced with
// the shared idle pose both to enforce that rule and to stop duplicating a
// hero-turntable concept across two different sprite sources.)
// ~12fps (same pace AnimatedSprite.jsx's own idle default uses, so the Me
// tab and the Shop's hero carousel/codex page - which show this exact same
// idle strip via HeroFigure.jsx - move at the same speed). This used to be
// 70ms, briefly a two-pose [64, 85] array, then got bumped to 150ms
// (~6.7fps) when this component was rewritten to the current single-pose
// loop - which read as sluggish/stuttery rather than a smooth stretch.
// Reverted to the original pace.
const FRAME_MS = 83

export default function HeroSprite({ size = 96, hero }) {
  const idle = getHeroSprite(hero).poses.idle
  const frameCount = idle.frames
  const [frame, setFrame] = useState(0)
  const frameRef = useRef(0)
  const lastTickRef = useRef(0)

  // requestAnimationFrame instead of setInterval - it's paced to the
  // display's own refresh and self-corrects against elapsed time, so frame
  // advances stay evenly spaced instead of drifting/stuttering under main-
  // thread load the way a plain setInterval tick does.
  useEffect(() => {
    let rafId
    function tick(timestamp) {
      if (timestamp - lastTickRef.current >= FRAME_MS) {
        lastTickRef.current = timestamp
        frameRef.current = (frameRef.current + 1) % frameCount
        setFrame(frameRef.current)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    // Browsers suspend requestAnimationFrame entirely while the tab/window
    // is hidden (switching browser tabs, minimizing, backgrounding the
    // app), then resume it on their own schedule - which can leave this
    // stuck presenting whatever frame it landed on rather than visibly
    // resuming the stretch cycle. Forcing a fresh rAF loop on
    // visibilitychange (instead of trusting the browser's own resume
    // timing) guarantees the animation is always moving again the instant
    // the tab is visible.
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      cancelAnimationFrame(rafId)
      lastTickRef.current = 0
      rafId = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [frameCount])

  const width = Math.round(size * (idle.frameWidth / idle.frameHeight))

  return (
    <div
      className="hero-sprite"
      style={{
        width,
        height: size,
        backgroundImage: `url(${idle.src})`,
        backgroundPosition: `${(frame / (frameCount - 1)) * 100}% 0%`,
      }}
      aria-hidden="true"
    />
  )
}
