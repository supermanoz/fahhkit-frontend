/* eslint-disable react/prop-types -- no prop-types dependency in this project */

// TEMP: clubs have no uploaded badge yet, so every club gets a generated
// one - a cartoon shield whose colours and centre symbol are picked from a
// hash of the club's name (stable per club), with its initials on a ribbon.
// Swap for the real badge image once the backend stores one.

const PALETTES = [
  ['#ff7a29', '#c94a08'],
  ['#4fc85e', '#268a3a'],
  ['#3fa9f5', '#1a6fb3'],
  ['#b98cff', '#6b3fc4'],
  ['#ff5a4d', '#c72a20'],
  ['#ffd34d', '#c99a12'],
  ['#2ec4b6', '#17857b'],
  ['#ff6fb5', '#c2367a'],
]

// Centre symbols, drawn in a 0-40 box centred at (20, 20).
const SYMBOLS = [
  // star
  'M20 6 l4.1 8.6 9.4 1.2 -6.9 6.5 1.8 9.3 -8.4 -4.6 -8.4 4.6 1.8 -9.3 -6.9 -6.5 9.4 -1.2 z',
  // lightning bolt
  'M23 5 L11 22 h8 l-3 13 L29 17 h-8 z',
  // crown
  'M8 28 L6 12 l8 7 6 -10 6 10 8 -7 -2 16 z',
  // flame
  'M20 5 C27 13 31 18 30 25 C29 31 25 35 20 35 C15 35 11 31 11 25 C11 20 15 17 16 12 C18 16 19 18 22 19 C22 14 21 10 20 5 z',
  // heart
  'M20 33 C9 25 6 19 8 14 C10 9 17 9 20 14 C23 9 30 9 32 14 C34 19 31 25 20 33 z',
  // diamond
  'M20 5 L32 18 L20 35 L8 18 z',
]

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function initialsOf(name) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export default function ClubBadge({ name = '', size = 48, className = '' }) {
  const h = hashString(name || '?')
  const [main, dark] = PALETTES[h % PALETTES.length]
  const symbol = SYMBOLS[(h >>> 8) % SYMBOLS.length]
  const initials = initialsOf(name || '?')

  return (
    <svg
      className={`club-badge ${className}`}
      width={size}
      height={size * 1.12}
      viewBox="0 0 60 67"
      role="img"
      aria-label={`${name} club badge`}
    >
      <path
        d="M30 2 L56 10 V32 C56 48 44 58 30 65 C16 58 4 48 4 32 V10 Z"
        fill={dark}
        stroke="#3d2b1a"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M30 7 L51 13.5 V32 C51 45 41 53.5 30 59.5 C19 53.5 9 45 9 32 V13.5 Z"
        fill={main}
      />
      <path
        d="M30 7 L51 13.5 V22 C44 19 37 18 30 18 C23 18 16 19 9 22 V13.5 Z"
        fill="rgba(255,255,255,0.25)"
      />
      <g transform="translate(15 8) scale(0.75)">
        <path
          d={symbol}
          fill="#fff"
          stroke="#3d2b1a"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M4 40 H56 L52 46 L56 52 H4 L8 46 Z"
        fill="#fff6e6"
        stroke="#3d2b1a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <text
        x="30"
        y="50.5"
        textAnchor="middle"
        fontFamily="'Passion One', 'Trebuchet MS', sans-serif"
        fontWeight="900"
        fontSize="12"
        fill="#3d2b1a"
      >
        {initials}
      </text>
    </svg>
  )
}
