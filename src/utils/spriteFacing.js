// The run marker's left/right mirror decision (see TerritoryMap.jsx's
// useSpriteFacing, .territory-map-blaze-body's --hero-flip) - its own
// file, not inlined in TerritoryMap.jsx, for two reasons: it's plain
// logic with zero Leaflet/MapLibre dependency, so it's cheap to unit-test
// in isolation (see spriteFacing.test.js) without dragging in the whole
// map stack, and co-locating a non-component export in a .jsx file trips
// react-refresh/only-export-components otherwise.
//
// The sprite is a single back-view running sheet - a believable drawing
// only face-on or mirrored, never rotated to an arbitrary compass angle
// (a back view rotated 90° reads as the character lying on its side,
// which is what the old "tilts/lies sideways" bug actually was - it used
// to rotate the body a full 360° to face travel direction instead of
// just mirroring it). So: no rotation anywhere in this system at all -
// only ever 1 (normal) or -1 (mirrored), decided from the heading's
// EAST/WEST component, with its own dead zone and minimum time between
// flips so GPS course noise near due north/south (where east-vs-west is
// inherently ambiguous - sin(heading) near 0) can't flip it back and
// forth every fix.
export const FLIP_DEADZONE_SIN = Math.sin((15 * Math.PI) / 180) // ~0.26, ±15° either side of N/S
export const MIN_FLIP_INTERVAL_MS = 1200

// heading is a compass bearing in degrees (0-360) or null/NaN if no
// direction is known/applicable yet (see playerHeading in GamePage.jsx -
// already GPS-course-only, speed- and accuracy-gated there; this has no
// idea where it came from and doesn't care). Holds `prevFacing` whenever
// the east/west component is too small to trust (near due north/south,
// or heading itself missing) or a flip already happened too recently -
// "last stable direction held when stopped/ambiguous" per the brief.
export function nextSpriteFacing(prevFacing, heading, now, lastFlipAt) {
  if (heading == null || Number.isNaN(heading)) {
    return { facing: prevFacing, lastFlipAt }
  }
  const eastComponent = Math.sin((heading * Math.PI) / 180)
  if (
    Math.abs(eastComponent) <= FLIP_DEADZONE_SIN ||
    now - lastFlipAt <= MIN_FLIP_INTERVAL_MS
  ) {
    return { facing: prevFacing, lastFlipAt }
  }
  const next = eastComponent > 0 ? 1 : -1
  return next === prevFacing
    ? { facing: prevFacing, lastFlipAt }
    : { facing: next, lastFlipAt: now }
}
