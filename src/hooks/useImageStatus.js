import { useEffect, useState } from 'react'

// Preloads `src` off-screen and reports 'none' (no src) | 'loading' |
// 'loaded' | 'error'. Lets a caller keep showing a placeholder (the letter
// avatar) until the photo is really decoded, then swap in one step - no
// broken-image glyph, no half-painted circle. The status is keyed to the src
// it belongs to, so switching src never reuses a stale result.
export function useImageStatus(src) {
  const [result, setResult] = useState({ src: null, status: 'none' })

  useEffect(() => {
    if (!src) return
    let cancelled = false
    const img = new Image()
    img.onload = () => !cancelled && setResult({ src, status: 'loaded' })
    img.onerror = () => !cancelled && setResult({ src, status: 'error' })
    img.src = src
    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [src])

  if (!src) return 'none'
  return result.src === src ? result.status : 'loading'
}
