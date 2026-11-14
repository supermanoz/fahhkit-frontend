/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { useImageStatus } from '../../hooks/useImageStatus'
import './components.css'

// The one avatar used across /game (player profiles, the territory popup,
// the leaderboard). Shows the real uploaded photo when there is one, else
// falls back to the name's initial(s) on a solid circle - or a neutral
// silhouette when there's no name either. Renders a single element (the
// img or the fallback span) carrying `className`, so callers can reshape
// it (e.g. the podium's shield clip) - the round/bordered defaults are
// zero-specificity (see .g-avatar in components.css) for exactly that.
// width/height attributes plus --avatar-size avoid a layout shift while
// the photo loads; loading="lazy" defers it until it's on screen.
export default function Avatar({
  src,
  name = '',
  size = 48,
  // Ring colour (e.g. the player's territory colour); no ring when unset.
  ring,
  // Solid fill behind the initials.
  fallbackColor,
  // How many initials to show (first + last word).
  initials = 1,
  level,
  className = '',
  // Keep the initial/silhouette on screen until the photo has fully loaded,
  // then swap (no flash of a half-loaded image). Off by default: list rows
  // keep the native lazy <img>.
  holdUntilLoaded = false,
}) {
  const preload = useImageStatus(holdUntilLoaded ? src : null)
  // Remembers which src failed, so a new src (another player) gets tried
  // again instead of inheriting the old broken flag.
  const [failedSrc, setFailedSrc] = useState(null)
  const showPhoto =
    Boolean(src) &&
    failedSrc !== src &&
    (!holdUntilLoaded || preload === 'loaded')
  const style = {
    '--avatar-size': `${size}px`,
    '--ring-color': ring,
    '--avatar-bg': fallbackColor,
  }
  const classes = `g-avatar ${ring ? 'g-avatar-ring' : ''} ${className}`

  const face = showPhoto ? (
    <img
      className={classes}
      style={style}
      src={src}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <span
      className={`${classes} g-avatar-fallback`}
      style={style}
      role="img"
      aria-label={name || 'Player'}
    >
      {name.trim() ? initialsOf(name, initials) : <SilhouetteIcon />}
    </span>
  )

  if (level == null) return face
  return (
    <span className="g-avatar-wrap">
      {face}
      <span className="g-avatar-level">
        <span className="g-badge g-badge-level">{level}</span>
      </span>
    </span>
  )
}

function initialsOf(name, count) {
  const parts = name.trim().split(/\s+/)
  const letters =
    count > 1 && parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : parts[0][0]
  return letters.toUpperCase()
}

function SilhouetteIcon() {
  return (
    <svg
      className="g-avatar-silhouette"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="8.5" r="4.5" fill="currentColor" />
      <path
        d="M3.5 21.5c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z"
        fill="currentColor"
      />
    </svg>
  )
}
