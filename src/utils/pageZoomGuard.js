// Stops page-level pinch zoom outside the map. iOS ignores user-scalable=no in
// the viewport meta for pinch gestures, so Safari's gesture* events and any
// multi-finger touchmove are cancelled here. The Leaflet map (and anything
// marked data-allow-pinch) is exempt: its own pinch/zoom keeps working, within
// the map's min/max zoom.
const ALLOW_SELECTOR = '.leaflet-container, .maplibregl-map, [data-allow-pinch]'

export function isInsideMap(target) {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    Boolean(target.closest(ALLOW_SELECTOR))
  )
}

export function installPageZoomGuard(doc = document) {
  const onGesture = (e) => {
    if (!isInsideMap(e.target)) e.preventDefault()
  }
  const onTouchMove = (e) => {
    // Cheap early-out: single-finger scrolling never reaches the DOM lookup.
    if (e.touches && e.touches.length > 1 && !isInsideMap(e.target)) {
      e.preventDefault()
    }
  }
  const opts = { passive: false }
  doc.addEventListener('gesturestart', onGesture, opts)
  doc.addEventListener('gesturechange', onGesture, opts)
  doc.addEventListener('gestureend', onGesture, opts)
  doc.addEventListener('touchmove', onTouchMove, opts)
  return () => {
    doc.removeEventListener('gesturestart', onGesture, opts)
    doc.removeEventListener('gesturechange', onGesture, opts)
    doc.removeEventListener('gestureend', onGesture, opts)
    doc.removeEventListener('touchmove', onTouchMove, opts)
  }
}
