/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import blazeSpriteSheet from '../assets/images/hero-blaze-sprite.png'
import './HeroSprite.css'

// Heroes are normally a single static image (StoreItemCategoryConstant.HERO
// assetUrl, or a free local avatars.js pick) - Blaze is the one exception,
// with a 5x5 run-cycle sprite sheet standing in for a "3D model" turntable
// on the profile panel. Every other hero just renders its flat image.
const SHEET_COLS = 5
const SHEET_ROWS = 5
const FRAME_COUNT = SHEET_COLS * SHEET_ROWS
const FRAME_MS = 70

export default function HeroSprite({ size = 96 }) {
  const [frame, setFrame] = useState(0)
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
        setFrame((f) => (f + 1) % FRAME_COUNT)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const col = frame % SHEET_COLS
  const row = Math.floor(frame / SHEET_COLS)

  return (
    <div
      className="hero-sprite"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${blazeSpriteSheet})`,
        backgroundPosition: `${(col / (SHEET_COLS - 1)) * 100}% ${(row / (SHEET_ROWS - 1)) * 100}%`,
      }}
      aria-hidden="true"
    />
  )
}
