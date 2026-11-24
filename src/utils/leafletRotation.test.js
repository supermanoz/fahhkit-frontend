import { describe, expect, it } from 'vitest'
import { clientToContainerPoint, rotateVector } from './leafletRotation'

const box = { centerX: 500, centerY: 400, width: 400, height: 800 }

describe('leaflet rotation maths', () => {
  it('no rotation: a tap maps straight through', () => {
    const p = clientToContainerPoint({
      ...box,
      clientX: 500,
      clientY: 400,
      rotationDeg: 0,
    })
    expect(p).toEqual({ x: 200, y: 400 })
  })

  it('the centre of the box is the centre of the container at any rotation', () => {
    for (const deg of [30, 90, 180, -135]) {
      const p = clientToContainerPoint({
        ...box,
        clientX: 500,
        clientY: 400,
        rotationDeg: deg,
      })
      expect(p.x).toBeCloseTo(200)
      expect(p.y).toBeCloseTo(400)
    }
  })

  it('180 degrees: a tap above centre is below centre in the container', () => {
    const p = clientToContainerPoint({
      ...box,
      clientX: 500,
      clientY: 300,
      rotationDeg: 180,
    })
    expect(p.x).toBeCloseTo(200)
    expect(p.y).toBeCloseTo(500)
  })

  it('90 degrees clockwise: a tap right of centre is below-centre... of the container', () => {
    // Container rotated 90deg cw: its "down" now points left on screen, its
    // "right" points down. A tap to the right of centre on screen is the
    // container's "up" side.
    const p = clientToContainerPoint({
      ...box,
      clientX: 600,
      clientY: 400,
      rotationDeg: 90,
    })
    expect(p.x).toBeCloseTo(200)
    expect(p.y).toBeCloseTo(300)
  })

  it('round trip: rotating forward then mapping back returns the point', () => {
    const local = { x: 70, y: -120 }
    const deg = 37
    const screen = rotateVector(local.x, local.y, deg)
    const p = clientToContainerPoint({
      ...box,
      clientX: box.centerX + screen.x,
      clientY: box.centerY + screen.y,
      rotationDeg: deg,
    })
    expect(p.x).toBeCloseTo(box.width / 2 + local.x)
    expect(p.y).toBeCloseTo(box.height / 2 + local.y)
  })
})
