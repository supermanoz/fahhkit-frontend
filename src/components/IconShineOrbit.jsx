/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import { animate, createMotionPath } from 'animejs'

// Same points as the level badges' own clip-path
// (polygon(50% 0%, 95% 18%, 95% 64%, 50% 100%, 5% 64%, 5% 18%)) so the
// spark's lap hugs the badge's actual hexagon outline, not a generic oval.
const HEX_POINTS = [
  [0.5, 0],
  [0.95, 0.18],
  [0.95, 0.64],
  [0.5, 1],
  [0.05, 0.64],
  [0.05, 0.18],
]

// A small gold spark that takes a slow, looping lap around an icon's outline
// - reuses anime.js's createMotionPath the same way TapEffect's one-off tap
// flourish does, just persistent and much slower, as a quiet "look here" cue
// on the hamburger menu button and the level badges rather than a full
// color/glow pulse on the icon itself.
// gap: for the circle shape only, how far (px) the lap sits beyond the
// icon's own edge instead of hugging it - negative pulls it inward. Relies
// on .icon-shine-orbit's overflow:visible (same trick the player marker's
// pulse rings use) to paint outside the icon's own box without needing to
// enlarge the svg/viewBox.
export default function IconShineOrbit({ shape, width, height, gap = -3 }) {
  const pathRef = useRef(null)
  const sparkRef = useRef(null)

  useEffect(() => {
    if (!pathRef.current || !sparkRef.current) return
    const animation = animate(sparkRef.current, {
      ...createMotionPath(pathRef.current),
      duration: 1200,
      loop: true,
      loopDelay: 1500,
      ease: 'inOutSine',
    })
    return () => animation.pause()
  }, [])

  return (
    <svg
      className="icon-shine-orbit"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {shape === 'hex' ? (
        <polygon
          ref={pathRef}
          className="icon-shine-orbit-guide"
          points={HEX_POINTS.map(([x, y]) => `${x * width},${y * height}`).join(
            ' '
          )}
        />
      ) : (
        <circle
          ref={pathRef}
          className="icon-shine-orbit-guide"
          cx={width / 2}
          cy={height / 2}
          r={Math.min(width, height) / 2 + gap}
        />
      )}
      <circle ref={sparkRef} r="3" className="icon-shine-orbit-spark" />
    </svg>
  )
}
