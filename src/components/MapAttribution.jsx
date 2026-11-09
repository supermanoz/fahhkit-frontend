/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import './MapAttribution.css'

// Legally-required map credits, collapsed into a small "i" button instead
// of a permanent tiny text strip (the old always-on corner text this
// replaces was never readable at its own font-size, and sat right where
// the locate button/run panel live). Neither Leaflet nor a bare
// TileLayer gives a collapsible attribution control out of the box
// (MapLibre's attributionControl: {compact: true} does, which is why
// TerritoryGlobe's own one-off globe reveal - a separate MapLibre
// instance - doesn't need this component at all) - this is a plain React
// stand-in, rendered instead of Leaflet's own L.control.attribution
// (which TerritoryMap/RunMap both disable via attributionControl={false})
// so the credit text itself is still exactly what each map's tile
// provider requires, just not forced onto a Leaflet DOM control.
export default function MapAttribution({ className = '', children }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={`map-attribution ${className}`} ref={rootRef}>
      <button
        type="button"
        className="map-attribution-toggle"
        aria-label={open ? 'Hide map credits' : 'Show map credits'}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        i
      </button>
      {open && (
        <div className="map-attribution-panel" role="note">
          {children}
        </div>
      )}
    </div>
  )
}
