/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useId } from 'react'

// Flag preview for a TERRITORY_SHADE in the Shop: a clean, softly waving
// flag in that colour on a slim metal pole against a dark vignette - no
// scenery, just the flag. The wave is drawn with light/dark bands over the
// base colour so it reads as fabric without cartoon outlines.

export default function ShadeFlag({ color, className = '' }) {
  const fill = color || '#ff7a29'
  // Unique ids per instance so several flags on one page don't share defs.
  const id = `shade-flag-${useId().replace(/:/g, '')}`

  return (
    <svg
      className={`shade-flag ${className}`}
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Flag in this colour"
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="55%" cy="40%" r="75%">
          <stop offset="0" stopColor="#3a2c20" />
          <stop offset="1" stopColor="#140d07" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={fill} stopOpacity="0.35" />
          <stop offset="1" stopColor={fill} stopOpacity="0" />
        </radialGradient>
        {/* Fabric folds: light and shadow bands across the flag. */}
        <linearGradient id={`${id}-folds`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.18" />
          <stop offset="0.22" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0.22" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={`${id}-pole`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a8f96" />
          <stop offset="0.45" stopColor="#f2f4f6" />
          <stop offset="1" stopColor="#6b7077" />
        </linearGradient>
        <radialGradient id={`${id}-finial`} cx="35%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff4c2" />
          <stop offset="0.5" stopColor="#e0b04a" />
          <stop offset="1" stopColor="#8a6414" />
        </radialGradient>
      </defs>

      <rect width="160" height="120" fill={`url(#${id}-bg)`} />
      <ellipse cx="88" cy="46" rx="60" ry="40" fill={`url(#${id}-glow)`} />

      <g className="shade-flag-cloth">
        <path
          d="M56 22 C72 14 86 30 104 22 C114 18 122 18 130 20 L130 66 C122 64 114 64 104 68 C86 76 72 60 56 68 Z"
          fill={fill}
        />
        <path
          d="M56 22 C72 14 86 30 104 22 C114 18 122 18 130 20 L130 66 C122 64 114 64 104 68 C86 76 72 60 56 68 Z"
          fill={`url(#${id}-folds)`}
        />
        <path
          d="M56 22 C72 14 86 30 104 22 C114 18 122 18 130 20 L130 66 C122 64 114 64 104 68 C86 76 72 60 56 68 Z"
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth="1"
        />
      </g>

      <rect
        x="51"
        y="16"
        width="5"
        height="92"
        rx="2.5"
        fill={`url(#${id}-pole)`}
      />
      <circle cx="53.5" cy="14" r="4.5" fill={`url(#${id}-finial)`} />
      <ellipse cx="53.5" cy="109" rx="12" ry="2.5" fill="rgba(0,0,0,0.45)" />
    </svg>
  )
}
