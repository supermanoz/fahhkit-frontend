/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './PortalClouds.css'

// The cloud "portal": soft layered clouds slide in from the left and right
// edges, meet in the middle and cover the screen, then part outward and fade.
// Pure presentation (usePortalTransition drives the phase); transform and
// opacity only, so it stays smooth on low-end phones.
//
// Art: one inline SVG cloud (white to pale blue, soft shading, no filters),
// reused for 4 depth layers per side with different sizes, heights and
// delays. A pale mist behind them guarantees there are never gaps.

function CloudArt() {
  return (
    <svg
      viewBox="0 0 240 130"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="pc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#eef5ff" />
          <stop offset="1" stopColor="#cfe1fb" />
        </linearGradient>
        <radialGradient id="pc-shine" cx="0.35" cy="0.25" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        fill="url(#pc-body)"
        d="M34 122c-20 0-34-13-34-30 0-15 11-27 26-29-1-3-1-6-1-9 0-19 15-34 34-34 7 0 13 2 18 5 6-17 22-29 41-29 21 0 38 14 43 33 4-2 8-3 13-3 18 0 32 13 33 30 14 3 24 15 24 29 0 17-14 37-34 37z"
      />
      <path
        fill="url(#pc-shine)"
        d="M34 122c-20 0-34-13-34-30 0-15 11-27 26-29-1-3-1-6-1-9 0-19 15-34 34-34 7 0 13 2 18 5 6-17 22-29 41-29 21 0 38 14 43 33 4-2 8-3 13-3 18 0 32 13 33 30 14 3 24 15 24 29 0 17-14 37-34 37z"
      />
    </svg>
  )
}

// top / height (% of the screen), width (vw), start delay (ms), shade.
const LAYERS = [
  { top: -6, h: 46, w: 92, delay: 0, shade: 0.55 }, // far
  { top: 18, h: 46, w: 86, delay: 50, shade: 0.7 },
  { top: 40, h: 46, w: 88, delay: 100, shade: 0.85 },
  { top: 62, h: 50, w: 96, delay: 150, shade: 1 }, // near
]

export default function PortalClouds({ phase, kind, timing }) {
  if (phase === 'idle') return null
  const { inMs, outMs } = timing
  return (
    <div
      className={`portal-clouds is-${phase} is-${kind}`}
      data-phase={phase}
      role="presentation"
      aria-hidden="true"
      style={{ '--pc-in': `${inMs}ms`, '--pc-out': `${outMs}ms` }}
    >
      <div className="portal-mist" />
      {['left', 'right'].map((side) =>
        LAYERS.map((l, i) => (
          <div
            key={`${side}-${i}`}
            className={`portal-cloud is-${side}`}
            style={{
              top: `${l.top}%`,
              height: `${l.h}%`,
              width: `${l.w}vw`,
              '--pc-delay': `${l.delay + (side === 'right' ? 35 : 0)}ms`,
              '--pc-shade': l.shade,
              '--pc-in-dur': `${Math.max(inMs - l.delay - 40, 60)}ms`,
            }}
          >
            <CloudArt />
          </div>
        ))
      )}
    </div>
  )
}
