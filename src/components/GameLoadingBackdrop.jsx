import { useState } from 'react'
import loadingBgWebp from '../assets/ui/loading/loading_bg.webp'
import loadingBgFallback from '../assets/ui/loading/loading_bg-fallback.jpg'
import './GameLoadingBackdrop.css'

// Kicks off the fetch the moment this module is evaluated (GamePage is an
// eager, non-lazy import - see App.jsx - so that's effectively as early as
// any of the game's own JS runs) rather than waiting for the component to
// mount and its <img> to be parsed.
if (typeof document !== 'undefined') {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = loadingBgWebp
  document.head.appendChild(link)
}

// Full-bleed photo background for the loading/splash overlay (GamePage's
// .game-loading-overlay, both the "Preparing your run…" state and the
// signed-out gate's fallback). A sibling of the logo/footer within that
// flex container - not stacked with z-index - so it has to come first in
// DOM order to paint behind them (flex items paint in DOM order for
// z-index:auto, per the flexbox spec's "treat as position: relative"
// stacking rule).
export default function GameLoadingBackdrop() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="game-loading-bg">
      <picture>
        <source srcSet={loadingBgWebp} type="image/webp" />
        <img
          src={loadingBgFallback}
          alt=""
          className={`game-loading-bg-img${loaded ? ' is-loaded' : ''}`}
          // React 18 only knows the lowercase DOM attribute (camelCase logs a
          // console.error); drop this disable if the app moves to React 19.
          // eslint-disable-next-line react/no-unknown-property
          fetchpriority="high"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      </picture>
      <div className="game-loading-bg-scrim" />
    </div>
  )
}
