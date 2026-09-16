/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import { animate, createMotionPath } from 'animejs'

// A "claim acknowledged" flourish that runs a lap around the specific
// territory polygon the player tapped — not the map, not a generic point.
// Uses anime.js's createMotionPath
// (https://animejs.com/documentation/svg/createmotionpath) to derive
// translate/rotate straight from the polygon's own outline rather than
// hand-animating x/y/rotation separately.
const PADDING = 14

function polygonPathAndBounds(points) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs) - PADDING
  const minY = Math.min(...ys) - PADDING
  const maxX = Math.max(...xs) + PADDING
  const maxY = Math.max(...ys) + PADDING
  const d =
    `M ${points[0].x} ${points[0].y} ` +
    points
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(' ') +
    ' Z'
  return { d, minX, minY, width: maxX - minX, height: maxY - minY }
}

const VALID_POINTS = (points) => points && points.length >= 3

export default function TapEffect({ points, onDone }) {
  const pathRef = useRef(null)
  const sparkRef = useRef(null)
  const valid = VALID_POINTS(points)

  useEffect(() => {
    if (!valid || !pathRef.current || !sparkRef.current) return
    const animation = animate(sparkRef.current, {
      ...createMotionPath(pathRef.current),
      duration: 1200,
      ease: 'inOutSine',
      onComplete: () => onDone?.(),
    })
    return () => animation.pause()
    // onDone is a fresh arrow function from the parent's .map() every
    // render, but this effect must only run once per mounted tap (re-firing
    // on every unrelated parent re-render would restart the lap before it
    // ever completes) - intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid])

  if (!valid) return null

  const { d, minX, minY, width, height } = polygonPathAndBounds(points)

  return (
    <svg
      className="territory-tap-effect"
      style={{ left: minX, top: minY }}
      width={width}
      height={height}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      aria-hidden="true"
    >
      <path ref={pathRef} d={d} className="territory-tap-effect-border" />
      <circle ref={sparkRef} r="6" className="territory-tap-effect-spark" />
    </svg>
  )
}
