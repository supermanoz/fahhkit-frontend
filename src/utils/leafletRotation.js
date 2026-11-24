// Leaflet has no concept of a rotated map: the whole map container is turned
// with CSS (TerritoryMap's .territory-map-tilt "rotor"), which is cheap and
// leaves tiles, SVG polygons and markers alone, but Leaflet then reads
// screen coordinates as if the container were still upright. Two places do:
//   - mouseEventToContainerPoint: where a tap/click landed (territory taps,
//     route drawing, pinch / wheel zoom centre)
//   - Draggable._onMove: the pan delta of a drag
// installRotationSupport() patches exactly those two on ONE map instance so
// they undo the current rotation. With 0 rotation both fall straight through
// to Leaflet's own code.

// The rotation (degrees, clockwise) currently applied to `el`, read from the
// computed matrix so it is right mid-transition as well.
export function readRotationDeg(el) {
  if (!el || typeof getComputedStyle !== 'function') return 0
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return 0
  const m = /^matrix\(([^)]+)\)$/.exec(t)
  if (!m) return 0
  const [a, b] = m[1].split(',').map(Number)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return (Math.atan2(b, a) * 180) / Math.PI
}

// Rotates the vector (x, y) by `deg` (clockwise on a y-down screen).
export function rotateVector(x, y, deg) {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

// Where a viewport point lands inside the (unrotated) container, given the
// container's on-screen bounding box centre and the rotation applied to it.
export function clientToContainerPoint({
  clientX,
  clientY,
  centerX,
  centerY,
  width,
  height,
  rotationDeg,
}) {
  const v = rotateVector(clientX - centerX, clientY - centerY, -rotationDeg)
  return { x: width / 2 + v.x, y: height / 2 + v.y }
}

export function installRotationSupport(map, rotorEl, L) {
  const container = map.getContainer()

  const origToContainer = map.mouseEventToContainerPoint.bind(map)
  map.mouseEventToContainerPoint = (e) => {
    const deg = readRotationDeg(rotorEl)
    if (Math.abs(deg) < 0.01) return origToContainer(e)
    const rect = container.getBoundingClientRect()
    const p = clientToContainerPoint({
      clientX: e.clientX,
      clientY: e.clientY,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      width: container.offsetWidth,
      height: container.offsetHeight,
      rotationDeg: deg,
    })
    return L.point(p.x, p.y)
  }

  const draggable = map.dragging?._draggable
  const origMove = draggable?._onMove
  if (draggable && origMove) {
    draggable._onMove = function onMove(e) {
      const deg = readRotationDeg(rotorEl)
      if (Math.abs(deg) < 0.01 || !this._startPoint) {
        return origMove.call(this, e)
      }
      if (e.touches && e.touches.length > 1) return origMove.call(this, e)
      const first = e.touches && e.touches.length === 1 ? e.touches[0] : e
      const v = rotateVector(
        first.clientX - this._startPoint.x,
        first.clientY - this._startPoint.y,
        -deg
      )
      // Leaflet's cached parent scale is the rotated bounding box's - the map
      // itself is not scaled.
      this._parentScale = { x: 1, y: 1 }
      return origMove.call(this, {
        clientX: this._startPoint.x + v.x,
        clientY: this._startPoint.y + v.y,
        target: e.target,
        srcElement: e.srcElement,
        preventDefault: () => e.preventDefault?.(),
      })
    }
  }

  return () => {
    map.mouseEventToContainerPoint = origToContainer
    if (draggable && origMove) draggable._onMove = origMove
  }
}
