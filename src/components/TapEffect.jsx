/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { animate } from 'animejs'

// A "claim acknowledged" flourish that runs a lap around the specific
// territory polygon the player tapped. Built from real Leaflet layers (a
// glowing outline + a spark marker) in lat/lng rather than a screen-space
// SVG, so it stays glued to the territory while the map flies/zooms to it
// right after the tap (see FocusHighlight in TerritoryMap.jsx) - a
// pixel-positioned overlay got left behind at the pre-fly position/size.
// anime.js just drives a 0 -> 1 progress value; each tick places the spark
// that far along the outline.

// Cumulative distances along the closed ring, so the spark moves at an even
// speed regardless of how uneven the polygon's edges are.
function buildPerimeter(points) {
  const ring = [...points, points[0]].map((p) => L.latLng(p.lat, p.lng))
  const cumulative = [0]
  for (let i = 1; i < ring.length; i++) {
    cumulative.push(cumulative[i - 1] + ring[i - 1].distanceTo(ring[i]))
  }
  return { ring, cumulative, total: cumulative[cumulative.length - 1] }
}

function pointAlong({ ring, cumulative, total }, progress) {
  const target = progress * total
  let i = 1
  while (i < cumulative.length - 1 && cumulative[i] < target) i++
  const segment = cumulative[i] - cumulative[i - 1] || 1
  const t = (target - cumulative[i - 1]) / segment
  const a = ring[i - 1]
  const b = ring[i]
  return L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t)
}

export default function TapEffect({ points, onDone }) {
  const map = useMap()
  const valid = Boolean(points && points.length >= 3)

  useEffect(() => {
    if (!valid) return
    const perimeter = buildPerimeter(points)
    if (!perimeter.total) {
      onDone?.()
      return
    }

    const border = L.polygon(
      points.map((p) => [p.lat, p.lng]),
      { className: 'territory-tap-effect-border', interactive: false }
    ).addTo(map)
    const spark = L.circleMarker(perimeter.ring[0], {
      radius: 6,
      className: 'territory-tap-effect-spark',
      interactive: false,
    }).addTo(map)

    const lap = { progress: 0 }
    const animation = animate(lap, {
      progress: 1,
      duration: 1200,
      ease: 'inOutSine',
      onUpdate: () => spark.setLatLng(pointAlong(perimeter, lap.progress)),
      onComplete: () => onDone?.(),
    })

    return () => {
      animation.pause()
      border.remove()
      spark.remove()
    }
    // onDone is a fresh arrow function from the parent's .map() every
    // render, but this effect must only run once per mounted tap (re-firing
    // on every unrelated parent re-render would restart the lap before it
    // ever completes) - intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, valid])

  return null
}
