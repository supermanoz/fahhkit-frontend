/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import blazeHelloNeckSheet from '../assets/images/blaze-profile-hello-neck-stretch.png'
import cometHelloNeckSheet from '../assets/images/comet-profile-hello-neck-stretch.png'
import './HeroSprite.css'

// Heroes are normally a single static image (StoreItemCategoryConstant.HERO
// assetUrl, or a free local avatars.js pick) - Blaze and Comet are the
// exception, standing in for a "3D model" turntable on the Me tab/profile
// panel with a looping idle instead: a wave, then a neck stretch, back to
// back. This is the Me dashboard's own pick - the Shop hero card/Hero
// Detail Modal idle (src/utils/heroSprites.js) and the map marker
// (TerritoryMap.jsx) use a different pose (arm stretch).
// 48 hand-picked frames (24 waving + 24 neck stretch, evenly sampled from
// each hero's source animation drop, cropped to a shared bounding box so
// the hero doesn't jump in scale/position across the strip) laid out in
// one row - see scripts/build_blaze_stretch_strips.py /
// build_comet_stretch_strips.py (the "hello_neck" set). TEMP: any hero
// without an entry here still borrows Blaze's strip, same as
// heroSprites.js's own per-hero fallback.
const FRAMES_PER_POSE = 24
// Raw source frame counts were 36-41 (waving) and 77 (neck stretch) across
// both heroes - 24 sampled frames from each at one flat interval played
// the quick wave as a slow, stuttery crawl. Waving is paced close to its
// real speed; neck stretch is a genuinely slower motion at its real speed,
// which just reads as sluggish looping on a dashboard, so it's sped up
// past real-time instead for better game feel.
const POSE_FRAME_MS = [64, 85]
const FRAME_COUNT = FRAMES_PER_POSE * POSE_FRAME_MS.length
// Each hero's frame cell is a fixed 320px height, but its width follows
// that hero's own source aspect ratio (see each build script's printed
// cell size) - not square like the old 5x5 run-cycle sheet, so `size`
// sets the height and the width follows this ratio instead of forcing a
// square box that would squash the hero.
const HERO_SHEETS = {
  blaze: { src: blazeHelloNeckSheet, cellAspect: 197 / 320 },
  comet: { src: cometHelloNeckSheet, cellAspect: 195 / 320 },
}

function sheetForHero(name) {
  if (typeof name !== 'string') return HERO_SHEETS.blaze
  return HERO_SHEETS[name.trim().toLowerCase()] || HERO_SHEETS.blaze
}

export default function HeroSprite({ size = 96, hero }) {
  const { src: sheetSrc, cellAspect: CELL_ASPECT } = sheetForHero(hero)
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
      const poseIndex = Math.floor(frameRef.current / FRAMES_PER_POSE)
      if (timestamp - lastTickRef.current >= POSE_FRAME_MS[poseIndex]) {
        lastTickRef.current = timestamp
        frameRef.current = (frameRef.current + 1) % FRAME_COUNT
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
  }, [])

  const width = Math.round(size * CELL_ASPECT)

  return (
    <div
      className="hero-sprite"
      style={{
        width,
        height: size,
        backgroundImage: `url(${sheetSrc})`,
        backgroundPosition: `${(frame / (FRAME_COUNT - 1)) * 100}% 0%`,
      }}
      aria-hidden="true"
    />
  )
}
