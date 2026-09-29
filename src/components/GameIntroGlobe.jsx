/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './GameIntroGlobe.css'

// One-shot "satellite view" reveal, played once at the end of the loading
// screen (see GamePage's introPlaying): starts pulled back in globe
// projection with a slow spin, then dives down onto the player's real
// coordinates - like Google Earth's opening shot - before handing off to
// the already-positioned Leaflet map underneath. A standalone MapLibre
// instance (not the Leaflet bridge TerritoryMap uses) so it can play
// without depending on that map's own tiles/state.
export default function GameIntroGlobe({ center, styleUrl, onDone }) {
  const containerRef = useRef(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    let cancelled = false
    let spinFrame = null
    let diveTimer = null

    const glMap = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl || 'https://tiles.openfreemap.org/styles/positron',
      center: [center.lng, center.lat],
      zoom: 1,
      interactive: false,
      attributionControl: false,
    })

    function finish() {
      if (cancelled) return
      cancelled = true
      doneRef.current?.()
    }
    // Never hold the game open on a slow/failed tile load - just skip
    // straight to the real map.
    const giveUp = setTimeout(finish, 6000)

    glMap.once('load', () => {
      if (cancelled) return
      glMap.setProjection({ type: 'globe' })
      glMap.setSky({ 'atmosphere-blend': 1 })

      let bearing = 0
      const spin = () => {
        if (cancelled) return
        bearing = (bearing + 0.15) % 360
        glMap.setBearing(bearing)
        spinFrame = requestAnimationFrame(spin)
      }
      spinFrame = requestAnimationFrame(spin)

      // A beat of slow rotation out in space, then dive down onto the
      // player's actual spot.
      diveTimer = setTimeout(() => {
        if (cancelled) return
        if (spinFrame) cancelAnimationFrame(spinFrame)
        glMap.flyTo({
          center: [center.lng, center.lat],
          zoom: 16,
          bearing: 0,
          duration: 2600,
          curve: 1.5,
          essential: true,
        })
        glMap.once('moveend', () => {
          clearTimeout(giveUp)
          finish()
        })
      }, 1600)
    })

    return () => {
      cancelled = true
      clearTimeout(giveUp)
      clearTimeout(diveTimer)
      if (spinFrame) cancelAnimationFrame(spinFrame)
      glMap.remove()
    }
    // Plays once per mount - center/style are only the starting point, not
    // something this should re-run for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="game-intro-globe" ref={containerRef} />
      <div className="game-loading-footer">
        <p className="game-loading-text">Zeroing in on your turf…</p>
      </div>
    </>
  )
}
