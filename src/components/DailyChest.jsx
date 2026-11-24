/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useId } from 'react'
import { useCountdown } from '../hooks/useCountdown'
import { chestState, formatBadge, formatNext } from '../utils/dailyRewardState'
import chestArt from '../assets/ui/daily-chest.webp'
import './DailyChest.css'

// Original treasure-chest art in the game's chunky, dark-outlined style.
// claimable: lid open + glow + sparkles + gentle shake (CSS, off under
// reduced motion); claimed: closed and dimmed; neutral: closed, muted.
export function ChestIcon({ mode = 'neutral', size = 48 }) {
  const uid = useId().replace(/:/g, '')
  // 'closed' = lid shut in full colour (the welcome popup's chest before it opens)
  const open = mode === 'claimable'
  return (
    <span
      className={`dc dc-${mode}`}
      style={{ width: size, height: size }}
      data-chest={mode}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="dc-svg">
        <defs>
          <linearGradient id={`w${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d98a3d" />
            <stop offset="1" stopColor="#8a4a17" />
          </linearGradient>
          <linearGradient id={`l${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0a85a" />
            <stop offset="1" stopColor="#b5651d" />
          </linearGradient>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff0a0" />
            <stop offset="1" stopColor="#f2a900" />
          </linearGradient>
          <radialGradient id={`glow${uid}`}>
            <stop offset="0" stopColor="#fff6b0" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffc233" stopOpacity="0" />
          </radialGradient>
        </defs>
        {open && (
          <>
            <circle
              cx="32"
              cy="26"
              r="26"
              fill={`url(#glow${uid})`}
              className="dc-glow"
            />
            {/* lid swung open, behind the body */}
            <g transform="rotate(-24 12 32) translate(0 -3)">
              <path
                d="M10 30 V22 A13 13 0 0 1 23 9 H41 A13 13 0 0 1 54 22 V30 Z"
                fill={`url(#l${uid})`}
                stroke="#2a1405"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <rect
                x="28"
                y="9"
                width="8"
                height="21"
                fill={`url(#g${uid})`}
                stroke="#2a1405"
                strokeWidth="2.5"
              />
            </g>
            {/* gold peeking out of the body */}
            <circle
              cx="24"
              cy="30"
              r="5"
              fill={`url(#g${uid})`}
              stroke="#7a4a00"
              strokeWidth="2"
            />
            <circle
              cx="35"
              cy="28"
              r="5.5"
              fill={`url(#g${uid})`}
              stroke="#7a4a00"
              strokeWidth="2"
            />
            <circle
              cx="43"
              cy="31"
              r="4.5"
              fill={`url(#g${uid})`}
              stroke="#7a4a00"
              strokeWidth="2"
            />
          </>
        )}
        {/* body */}
        <path
          d="M10 31 H54 V52 Q54 56 50 56 H14 Q10 56 10 52 Z"
          fill={`url(#w${uid})`}
          stroke="#2a1405"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect
          x="26"
          y="31"
          width="12"
          height="25"
          fill={`url(#g${uid})`}
          stroke="#2a1405"
          strokeWidth="2.5"
        />
        <rect
          x="29"
          y="38"
          width="6"
          height="8"
          rx="1.5"
          fill="#5a3410"
          stroke="#2a1405"
          strokeWidth="2"
        />
        <path
          d="M13 36 H22 M42 36 H51"
          stroke="#ffd9a0"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {!open && (
          /* closed lid */
          <>
            <path
              d="M10 31 V24 A14 14 0 0 1 24 10 H40 A14 14 0 0 1 54 24 V31 Z"
              fill={`url(#l${uid})`}
              stroke="#2a1405"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <rect
              x="26"
              y="10"
              width="12"
              height="21"
              fill={`url(#g${uid})`}
              stroke="#2a1405"
              strokeWidth="2.5"
            />
            <path
              d="M14 22 Q16 16 22 14"
              stroke="#ffe2b8"
              strokeOpacity="0.55"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}
      </svg>
      {open && (
        <>
          <i className="dc-spark dc-s1" />
          <i className="dc-spark dc-s2" />
          <i className="dc-spark dc-s3" />
        </>
      )}
    </span>
  )
}

export function Dot({ className = '' }) {
  return (
    <span
      className={`dc-dot ${className}`}
      data-testid="daily-chest-dot"
      aria-hidden="true"
    />
  )
}

// The HUD button draws the raster art (assets/ui/daily-chest.webp, source in
// assets-src/): ready = full colour + glow/pulse, cooling down = dimmed.
// ChestIcon (SVG, with its open-lid state) is still used by the welcome popup.
// Small chest button in the top-right HUD, directly under the Fahhcoin pill.
// claimable: open glowing chest + red dot; claimed: closed, dimmed, tiny "12h"
// badge; error: neutral (tap retries). Hidden while loading, while the feature
// is unavailable, and whenever a run / post-run screen / popup owns the screen.
export function DailyHudChest({ dr, onOpen }) {
  const { state } = dr
  const mode = chestState(state)
  const status = state.status
  const waitUntil =
    mode === 'claimed' && status?.nextClaimAt
      ? Date.parse(status.nextClaimAt)
      : null
  const remaining = useCountdown(waitUntil, state.skew, true)
  if (!dr.available || dr.blocked) return null
  if (mode === 'neutral' && state.phase !== 'error') return null // still loading

  // Shiny in both real states (ready and cooling down), never when it is
  // just a retry button; ready is the stronger version (see DailyChest.css).
  const shiny = mode === 'claimable' || mode === 'claimed'
  const label =
    mode === 'claimable'
      ? 'Daily reward ready - open'
      : mode === 'claimed'
        ? `Daily reward - next in ${formatNext(remaining)}`
        : "Daily reward - couldn't load, tap to retry"
  return (
    <button
      type="button"
      className={`dc-hud dc-hud-${mode}`}
      data-testid="daily-reward-hud"
      data-chest={mode}
      aria-label={label}
      onClick={() => (mode === 'neutral' ? dr.retry() : onOpen())}
    >
      <span className="dc-hud-art">
        {shiny && <i className="dc-hud-glow" />}
        <img
          className="dc-hud-img"
          src={chestArt}
          alt=""
          width={36}
          height={36}
          draggable={false}
        />
        <span className="dc-hud-shine" />
        {shiny && (
          <span className="dc-hud-sheen">
            <i className="dc-hud-sweep" />
          </span>
        )}
      </span>
      {shiny && (
        <>
          <i className="dc-spark dc-hud-spark dc-hud-s1" />
          <i className="dc-spark dc-hud-spark dc-hud-s2" />
          <i className="dc-spark dc-hud-spark dc-hud-s3" />
          {mode === 'claimable' && (
            <>
              <i className="dc-spark dc-hud-spark dc-hud-s4" />
              <i className="dc-spark dc-hud-spark dc-hud-s5" />
            </>
          )}
        </>
      )}
      {mode === 'claimable' && <Dot />}
      {waitUntil && (
        <span className="dc-hud-badge" data-testid="daily-hud-badge">
          {formatBadge(remaining)}
        </span>
      )}
    </button>
  )
}
