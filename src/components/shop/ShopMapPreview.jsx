/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { safeColor } from '../../utils/shopColors'

// Lightweight previews for the Shop's Territory and Trail colours: a static
// SVG "map tile" (city blocks, a park, a river - the game's dark map look, no
// map instance and no filters) with the item drawn on it.
//   TerritoryMapPreview - a claimed polygon filled/outlined in the colour,
//                         with a flag planted on it.
//   TrailMapPreview     - a run line in the colour with its glow and a runner
//                         dot at the end.
// Static in the grid. `animated` (only the open preview sheet passes it) adds
// the gentle flag wave / the trail drawing itself in - plain CSS animations
// (see ColorShelf.css), off under reduced motion.

const BLOCKS = [
  [4, 4, 34, 26],
  [44, 4, 38, 18],
  [90, 4, 30, 26],
  [128, 4, 28, 18],
  [4, 36, 22, 30],
  [32, 30, 28, 34],
  [66, 28, 24, 26],
  [100, 38, 24, 26],
  [132, 26, 24, 40],
  [4, 72, 40, 22],
  [52, 72, 30, 20],
  [90, 62, 22, 32],
  [120, 72, 36, 22],
  [4, 102, 30, 14],
  [42, 100, 42, 16],
  [92, 102, 28, 14],
  [128, 102, 28, 14],
]

function MapTile() {
  return (
    <>
      <rect width="160" height="120" fill="#1a1f28" />
      {BLOCKS.map(([x, y, w, h]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={w}
          height={h}
          rx="2.5"
          fill="#262c37"
        />
      ))}
      {/* park */}
      <rect x="52" y="72" width="30" height="20" rx="3" fill="#1d3b2c" />
      {/* river */}
      <path
        d="M0 97 C40 90 82 101 160 88"
        fill="none"
        stroke="#1b3556"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* a main road */}
      <path
        d="M0 66 L160 56"
        fill="none"
        stroke="#38404f"
        strokeWidth="2"
        strokeDasharray="6 5"
      />
    </>
  )
}

export function TerritoryMapPreview({
  color,
  animated = false,
  className = '',
}) {
  const fill = safeColor(color)
  return (
    <svg
      className={`cs-preview ${animated ? 'is-animated' : ''} ${className}`}
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Claimed territory with a flag"
    >
      <MapTile />
      <polygon
        points="38,36 94,24 124,52 110,88 58,96 28,70"
        fill={fill}
        fillOpacity="0.4"
        stroke={fill}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {[
        [38, 36],
        [94, 24],
        [124, 52],
        [110, 88],
        [58, 96],
        [28, 70],
      ].map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="1.9"
          fill="#fff"
          fillOpacity="0.85"
        />
      ))}
      {/* the flag, planted on it */}
      <ellipse cx="80.5" cy="71" rx="9" ry="2.4" fill="rgba(0,0,0,0.45)" />
      <rect x="79" y="32" width="2.6" height="39" rx="1.3" fill="#e9edf2" />
      <circle cx="80.3" cy="30.6" r="2.6" fill="#f2c94c" />
      <g className="cs-cloth">
        <path
          d="M82 33 C90 29 97 39 106 35 L106 52 C97 56 90 46 82 50 Z"
          fill={fill}
        />
        <path
          d="M82 33 C90 29 97 39 106 35 L106 52 C97 56 90 46 82 50 Z"
          fill="#fff"
          fillOpacity="0.16"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="0.8"
        />
      </g>
    </svg>
  )
}

const TRAIL = 'M14 100 C30 78 44 98 62 80 S92 54 108 62 S134 40 146 24'

export function TrailMapPreview({ color, animated = false, className = '' }) {
  const stroke = safeColor(color)
  const line = (width, opacity, extra = {}) => (
    <path
      d={TRAIL}
      pathLength="1"
      className="cs-trail-draw"
      fill="none"
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...extra}
    />
  )
  return (
    <svg
      className={`cs-preview ${animated ? 'is-animated' : ''} ${className}`}
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Run trail on a map"
    >
      <MapTile />
      {/* glow, then the line, then a bright core */}
      {line(11, 0.16)}
      {line(6.5, 0.34)}
      {line(2.8, 1)}
      <path
        d={TRAIL}
        pathLength="1"
        className="cs-trail-draw"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <circle cx="14" cy="100" r="2.6" fill="#fff" fillOpacity="0.85" />
      <g className="cs-runner">
        <circle
          className="cs-pulse"
          cx="146"
          cy="24"
          r="8"
          fill={stroke}
          fillOpacity="0.3"
        />
        <circle
          cx="146"
          cy="24"
          r="4.2"
          fill="#fff"
          stroke={stroke}
          strokeWidth="2.2"
        />
      </g>
    </svg>
  )
}
