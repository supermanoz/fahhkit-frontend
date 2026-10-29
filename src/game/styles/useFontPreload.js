import { useEffect } from 'react'
import fredokaWoff2 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?url'

// Preloads the display font so headline/button/number text doesn't wait for
// the stylesheet's own font-face request to be discovered. Call once from
// whichever game entry mounts first (GameAuthGate welcome screen, GamePage,
// or the style guide) - idempotent, so it's safe to call from more than one.
export function useGameFontPreload() {
  useEffect(() => {
    const href = fredokaWoff2
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'font'
    link.type = 'font/woff2'
    link.crossOrigin = 'anonymous'
    link.href = href
    document.head.appendChild(link)
  }, [])
}
