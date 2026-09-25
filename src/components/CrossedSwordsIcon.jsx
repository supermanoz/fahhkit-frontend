/* eslint-disable react/prop-types -- no prop-types dependency in this project */
// Illustrated crossed swords for the Race (PvP) HUD button - flat cartoon
// style with sparkles, in the game palette (cream blades, orange/wood hilts,
// ink outlines) rather than an icon-font glyph.
const INK = '#3d2b1a'

function Sword({ angle, guard, grip }) {
  return (
    <g
      transform={`translate(0 3) rotate(${angle} 32 24)`}
      stroke={INK}
      strokeWidth="2.5"
      strokeLinejoin="round"
    >
      <path d="M28 40 L28 11 L32 3 L36 11 L36 40 Z" fill="#fff6e6" />
      {/* shaded half of the blade */}
      <path d="M32 5 L36 11 L36 40 L32 40 Z" fill="#e3d2b6" stroke="none" />
      <path d="M28 40 L28 11 L32 3 L36 11 L36 40 Z" fill="none" />
      <rect x="20" y="39" width="24" height="6" rx="3" fill={guard} />
      <rect x="29" y="45" width="6" height="10" rx="2" fill={grip} />
      <circle cx="32" cy="58.5" r="3.5" fill="#ffb15c" />
    </g>
  )
}

function Sparkle({ x, y, r }) {
  return (
    <path
      d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`}
      fill="#ffd9a0"
      stroke={INK}
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  )
}

export default function CrossedSwordsIcon({ sparkles = true, className }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      className={className}
      aria-hidden="true"
    >
      {sparkles && (
        <>
          <Sparkle x={9} y={11} r={4} />
          <Sparkle x={32} y={7} r={3.5} />
          <Sparkle x={57} y={20} r={3} />
          <Sparkle x={7} y={34} r={2.6} />
        </>
      )}
      <Sword angle={-45} guard="#a8672c" grip="#e0a355" />
      <Sword angle={45} guard="#ff7a29" grip="#a8672c" />
    </svg>
  )
}

// Sparkle-free version sized to sit inside a tab medal (Race tab).
export function RaceTabIcon() {
  return <CrossedSwordsIcon sparkles={false} className="race-tab-icon" />
}
