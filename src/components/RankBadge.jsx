/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useId, useRef, useState } from 'react'
import './RankBadge.css'

// The animated #1/#2/#3 medal shown on the leaderboard podium (and anywhere
// else a top-3 rank needs the same treatment) - "Inferno" (gold, flame
// aura), "Frost" (silver/steel-blue, icy shimmer + sparkles) and "Ember"
// (bronze/copper, rising embers). Pure SVG/CSS, no canvas or libraries.
// Everything that moves only animates transform/opacity (see RankBadge.css)
// and gets paused - via .is-paused, which flips animation-play-state on
// every animated layer at once - whenever this badge scrolls out of view
// (IntersectionObserver) or the browser tab itself is backgrounded
// (visibilitychange). The leaderboard tab already fully unmounts this
// component when you switch menu tabs (see GamePage.jsx's `menuTab ===
// 'leaderboard' &&`), so there's nothing to pause for that case specifically
// - only still-mounted-but-off-screen needs the observer.
const TIERS = { 1: 'inferno', 2: 'frost', 3: 'ember' }
const DEFAULT_SIZE = { 1: 52, 2: 48, 3: 44 }

export default function RankBadge({ rank, size, className = '' }) {
  const tier = TIERS[rank]
  const px = size || DEFAULT_SIZE[rank]
  // Unique per instance - two badges of the same rank could end up mounted
  // at once (e.g. a podium plus some future preview elsewhere), and SVG
  // <defs> ids are global to the document. Stripped of colons - React's
  // own id format (":r0:") is valid in an id attribute but needless
  // noise inside a url(#...) reference.
  const uid = useId().replace(/:/g, '')
  const rootRef = useRef(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    let offscreen = false
    let tabHidden = document.hidden
    const sync = () => setPaused(offscreen || tabHidden)
    const io = new IntersectionObserver(
      ([entry]) => {
        offscreen = !entry.isIntersecting
        sync()
      },
      { threshold: 0.1 }
    )
    io.observe(el)
    const onVisibility = () => {
      tabHidden = document.hidden
      sync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (!tier) return null

  return (
    <span
      ref={rootRef}
      className={`rank-badge rank-badge-${tier} ${paused ? 'is-paused' : ''} ${className}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <svg
        className="rank-badge-svg"
        viewBox="0 0 48 48"
        width="100%"
        height="100%"
      >
        <defs>
          <linearGradient
            id={`rb-fill-${tier}-${uid}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            {tier === 'inferno' && (
              <>
                <stop offset="0%" stopColor="#ffe3a3" />
                <stop offset="100%" stopColor="var(--lb-gold, #ff7a29)" />
              </>
            )}
            {tier === 'frost' && (
              <>
                <stop offset="0%" stopColor="var(--rb-frost-light, #eaf6ff)" />
                <stop offset="100%" stopColor="var(--rb-frost, #7fa8c9)" />
              </>
            )}
            {tier === 'ember' && (
              <>
                <stop offset="0%" stopColor="#f2c08f" />
                <stop
                  offset="100%"
                  stopColor="var(--lb-bronze-dark, #9a5a27)"
                />
              </>
            )}
          </linearGradient>
          {/* Fades to transparent - a "glow" built from opacity stops
              instead of a blur filter (the brief rules out animating
              filters/blur). */}
          <radialGradient id={`rb-glow-${tier}-${uid}`}>
            <stop
              offset="0%"
              stopColor={
                tier === 'inferno'
                  ? '#ffb15c'
                  : tier === 'frost'
                    ? 'var(--rb-frost-light, #eaf6ff)'
                    : '#f2a35f'
              }
              stopOpacity="0.85"
            />
            <stop
              offset="65%"
              stopColor={
                tier === 'inferno'
                  ? '#ffb15c'
                  : tier === 'frost'
                    ? 'var(--rb-frost-light, #eaf6ff)'
                    : '#f2a35f'
              }
              stopOpacity="0.25"
            />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          {/* Keeps the shine bar inside the medal's own shield outline as
              it sweeps, instead of streaking past the badge's edges. */}
          <clipPath id={`rb-clip-${tier}-${uid}`}>
            <polygon points="5,0 43,0 48,4 48,33 24,48 0,33 0,4" />
          </clipPath>
        </defs>

        {/* Glow pulse - opacity only, sits behind everything else, larger
            than the plate so it reads as an aura rather than a fill. */}
        <circle
          className="rank-badge-glow"
          cx="24"
          cy="24"
          r="27"
          fill={`url(#rb-glow-${tier}-${uid})`}
        />

        {tier === 'inferno' && <InfernoFx />}
        {tier === 'frost' && <FrostFx />}
        {tier === 'ember' && <EmberFx />}

        {/* The medal plate itself - same shield silhouette the podium
            frame already uses (LeaderboardPodium.css's clip-path), so the
            badge reads as part of the same "chunky plate" language. */}
        <polygon
          className="rank-badge-plate"
          points="5,0 43,0 48,4 48,33 24,48 0,33 0,4"
          fill={`url(#rb-fill-${tier}-${uid})`}
        />

        {tier === 'inferno' && (
          <path
            className="rank-badge-crown"
            d="M10 9 L14 16 L19 8 L24 15 L29 8 L34 16 L38 9 L36 19 L12 19 Z"
          />
        )}

        {/* Shine sweep - a diagonal bar translating across the plate,
            clipped to the shield outline so it never streaks past it. */}
        <rect
          className="rank-badge-shine"
          x="-6"
          y="-10"
          width="8"
          height="68"
          clipPath={`url(#rb-clip-${tier}-${uid})`}
        />
      </svg>

      <span className="rank-badge-number">{rank}</span>
    </span>
  )
}

// 3 layered flame shapes, staggered scale/translate/opacity flicker.
function InfernoFx() {
  return (
    <g className="rank-badge-flames">
      <path
        className="rank-badge-flame rank-badge-flame-1"
        d="M24 2c3 4 5 8 2.5 12-1 1.6-3 1.6-4 0C20 10 21 6 24 2Z"
      />
      <path
        className="rank-badge-flame rank-badge-flame-2"
        d="M14 6c2.4 3.4 4 6.6 1.8 9.6-0.9 1.2-2.6 1.2-3.4 0C10.2 12.6 11.4 9.2 14 6Z"
      />
      <path
        className="rank-badge-flame rank-badge-flame-3"
        d="M34 6c2.4 3.4 4 6.6 1.8 9.6-0.9 1.2-2.6 1.2-3.4 0C30.2 12.6 31.4 9.2 34 6Z"
      />
    </g>
  )
}

// Icy facets baked into the plate (static) + 3 twinkling sparkles.
function FrostFx() {
  return (
    <g className="rank-badge-sparkles">
      <path
        className="rank-badge-sparkle rank-badge-sparkle-1"
        d="M7 10l1.4 3L11 14.4 8.4 15.8 7 19l-1.4-3.2L2.2 14.4 5.6 13z"
      />
      <path
        className="rank-badge-sparkle rank-badge-sparkle-2"
        d="M42 14l1 2.2L45.2 17.2 43 18.2 42 21l-1-2.8-2.2-1L41 16.2z"
      />
      <path
        className="rank-badge-sparkle rank-badge-sparkle-3"
        d="M38 4l0.9 2 2 0.9-2 0.9-0.9 2-0.9-2-2-0.9 2-0.9z"
      />
    </g>
  )
}

// 3 embers rising from the base, translating up while fading out.
function EmberFx() {
  return (
    <g className="rank-badge-embers">
      <circle
        className="rank-badge-ember rank-badge-ember-1"
        cx="14"
        cy="40"
        r="1.6"
      />
      <circle
        className="rank-badge-ember rank-badge-ember-2"
        cx="24"
        cy="43"
        r="1.3"
      />
      <circle
        className="rank-badge-ember rank-badge-ember-3"
        cx="34"
        cy="40"
        r="1.6"
      />
    </g>
  )
}
