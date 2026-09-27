/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useId } from 'react'

// Trail preview for a TRAIL_COLOR in the Shop: the glowing GPS line a run
// leaves on the map, in that colour, curving across a dark vignette and
// ending at the runner's dot. Same restrained look as ShadeFlag.
export default function TrailPreview({ color, className = '' }) {
  const stroke = color || '#e63946'
  const id = `trail-${useId().replace(/:/g, '')}`
  const path =
    'M14 98 C34 96 38 70 58 70 C80 70 76 96 100 92 C122 88 116 52 132 40 C140 34 146 32 150 30'

  return (
    <svg
      className={`trail-preview ${className}`}
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Run trail in this colour"
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="55%" cy="45%" r="75%">
          <stop offset="0" stopColor="#3a2c20" />
          <stop offset="1" stopColor="#140d07" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={stroke} stopOpacity="0.15" />
          <stop offset="0.35" stopColor={stroke} stopOpacity="1" />
          <stop offset="1" stopColor={stroke} stopOpacity="1" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="160" height="120" fill={`url(#${id}-bg)`} />

      {/* Faint street grid so it reads as a map. */}
      <g stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none">
        <path d="M-5 58 H165" />
        <path d="M44 -5 V125" />
        <path d="M112 -5 V125" />
      </g>

      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeOpacity="0.55"
        strokeWidth="9"
        strokeLinecap="round"
        filter={`url(#${id}-glow)`}
      />
      <path
        className="trail-preview-line"
        d={path}
        fill="none"
        stroke={`url(#${id}-fade)`}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="150" cy="30" r="9" fill={stroke} opacity="0.3" />
      <circle
        cx="150"
        cy="30"
        r="5"
        fill="#fff"
        stroke={stroke}
        strokeWidth="3"
      />
    </svg>
  )
}
