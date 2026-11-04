/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import players1 from '../assets/ui/ranks/players_1.webp'
import players1x2 from '../assets/ui/ranks/players_1@2x.webp'
import players2 from '../assets/ui/ranks/players_2.webp'
import players2x2 from '../assets/ui/ranks/players_2@2x.webp'
import players3 from '../assets/ui/ranks/players_3.webp'
import players3x2 from '../assets/ui/ranks/players_3@2x.webp'
import clubs1 from '../assets/ui/ranks/clubs_1.webp'
import clubs1x2 from '../assets/ui/ranks/clubs_1@2x.webp'
import clubs2 from '../assets/ui/ranks/clubs_2.webp'
import clubs2x2 from '../assets/ui/ranks/clubs_2@2x.webp'
import clubs3 from '../assets/ui/ranks/clubs_3.webp'
import clubs3x2 from '../assets/ui/ranks/clubs_3@2x.webp'
import './RankBadge.css'

// Top-3 rank badge - real art (scripts/slice-badges.mjs, sliced from the
// supplied badge sheet) instead of the old generated SVG medals. Width/
// height below are each file's own real exported pixel size (see that
// script's own log output) - needed on the <img> itself so the browser can
// reserve the right box before it loads (no layout shift), independent of
// whatever CSS then sizes it down to for a given call site.
const BADGES = {
  player: {
    1: { src: players1, src2x: players1x2, width: 256, height: 268 },
    2: { src: players2, src2x: players2x2, width: 256, height: 291 },
    3: { src: players3, src2x: players3x2, width: 256, height: 294 },
  },
  club: {
    1: { src: clubs1, src2x: clubs1x2, width: 256, height: 210 },
    2: { src: clubs2, src2x: clubs2x2, width: 256, height: 228 },
    3: { src: clubs3, src2x: clubs3x2, width: 256, height: 240 },
  },
}

// rank 1 only gets the optional shine sweep (see RankBadge.css's
// .rank-badge-shine) - paused the same way the old animated medal's effects
// were: off-screen (IntersectionObserver) or the tab backgrounded
// (visibilitychange), and off entirely under prefers-reduced-motion (CSS
// media query, not JS - see RankBadge.css).
export default function RankBadge({ type, rank, className = '' }) {
  const badge = BADGES[type]?.[rank]
  const rootRef = useRef(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el || rank !== 1 || typeof IntersectionObserver === 'undefined') {
      return undefined
    }
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
  }, [rank])

  if (!badge) return null

  return (
    <span
      ref={rootRef}
      className={`rank-badge rank-badge-${type} rank-badge-${rank} ${rank === 1 ? 'rank-badge-shine' : ''} ${paused ? 'is-paused' : ''} ${className}`}
    >
      <img
        className="rank-badge-img"
        src={badge.src}
        srcSet={`${badge.src} 1x, ${badge.src2x} 2x`}
        width={badge.width}
        height={badge.height}
        loading="lazy"
        alt={`Top ${rank} ${type}`}
      />
    </span>
  )
}
