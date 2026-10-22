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

    const glMap = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl || 'https://tiles.openfreemap.org/styles/positron',
      center: [center.lng, center.lat],
      zoom: 1,
      bearing: 0,
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
    const giveUp = setTimeout(finish, 7000)

    glMap.once('load', () => {
      if (cancelled) return
      glMap.setProjection({ type: 'globe' })
      glMap.setSky({ 'atmosphere-blend': 1 })

      // A beat of slow rotation out in space, then dive down onto the
      // player's actual spot. The spin used to be driven by a manual
      // requestAnimationFrame loop calling setBearing() every single
      // frame, on top of whatever MapLibre's own render loop was already
      // doing to redraw the globe/atmosphere - measured up to 1000ms+ per
      // "frame" under load, which is what actually read as glitchy/
      // stuttery rather than a smooth spin. Three chained 120° easeTo
      // segments instead: MapLibre's own animation ticker drives the
      // rotation (same engine the dive below already uses), so there's no
      // redundant per-frame JS call stacked on top of its render work, and
      // no separate setTimeout racing an independent rAF loop at the
      // handoff into the dive - each leg only starts once the previous
      // one's 'moveend' confirms the camera actually settled. (A single
      // easeTo straight to bearing 360 won't do - MapLibre normalizes
      // that to the *shortest* path from 0°, which is 0° - no visible
      // spin at all. 120° steps keep every leg unambiguous.)
      function spinSegment(remaining) {
        if (cancelled) return
        if (remaining <= 0) {
          dive()
          return
        }
        glMap.easeTo({
          bearing: glMap.getBearing() + 120,
          duration: 533,
          easing: (t) => t,
          essential: true,
        })
        glMap.once('moveend', () => spinSegment(remaining - 1))
      }

      function dive() {
        if (cancelled) return
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
      }

      spinSegment(3)
    })

    return () => {
      cancelled = true
      clearTimeout(giveUp)
      glMap.stop()
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
