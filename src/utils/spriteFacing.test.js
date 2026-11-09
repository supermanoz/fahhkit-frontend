import { describe, it, expect } from 'vitest'
import { nextSpriteFacing } from '../utils/spriteFacing'

// nextSpriteFacing is the pure east(1)/west(-1) decision behind the run
// marker's left/right mirror (see TerritoryMap.jsx's useSpriteFacing) -
// there is no rotation value anywhere in this system any more, so
// "stays upright" is true by construction; what's worth scripting here
// is that the facing it returns is always exactly 1 or -1 (never an
// angle, never NaN) and that GPS heading noise - jumps, stops, null/NaN,
// rapid turns - can't flip it on every fix.
const MIN_FLIP_INTERVAL_MS = 1200

describe('nextSpriteFacing', () => {
  it('faces east (1) for an eastward heading', () => {
    const { facing } = nextSpriteFacing(-1, 90, 10_000, -Infinity)
    expect(facing).toBe(1)
  })

  it('faces west (-1) for a westward heading, once the debounce window has passed', () => {
    const { facing } = nextSpriteFacing(1, 270, 10_000, -Infinity)
    expect(facing).toBe(-1)
  })

  it('holds the previous facing for a heading close to due north/south (dead zone)', () => {
    // 5deg (near north) and 175deg (near south) are both within the ±15deg
    // dead zone - GPS course noise crossing exactly 0/180 shouldn't flip
    // the character every fix while running roughly north or south.
    expect(nextSpriteFacing(1, 5, 10_000, -Infinity).facing).toBe(1)
    expect(nextSpriteFacing(-1, 5, 10_000, -Infinity).facing).toBe(-1)
    expect(nextSpriteFacing(1, 175, 10_000, -Infinity).facing).toBe(1)
    expect(nextSpriteFacing(-1, 175, 10_000, -Infinity).facing).toBe(-1)
  })

  it('resolves cleanly just past the dead zone', () => {
    // 20deg clears the ~15deg dead zone on the east side.
    expect(nextSpriteFacing(-1, 20, 10_000, -Infinity).facing).toBe(1)
    // 200deg clears it on the west side.
    expect(nextSpriteFacing(1, 200, 10_000, -Infinity).facing).toBe(-1)
  })

  it('holds the previous facing for null or NaN heading - never crashes, never returns anything but 1/-1', () => {
    expect(nextSpriteFacing(1, null, 10_000, -Infinity).facing).toBe(1)
    expect(nextSpriteFacing(-1, null, 10_000, -Infinity).facing).toBe(-1)
    expect(nextSpriteFacing(1, NaN, 10_000, -Infinity).facing).toBe(1)
    expect(nextSpriteFacing(1, undefined, 10_000, -Infinity).facing).toBe(1)
  })

  it('never flips more than once within the debounce window, even on a clean east/west jump', () => {
    const start = 0
    const first = nextSpriteFacing(1, 270, start, -Infinity) // west, clears
    expect(first.facing).toBe(-1)

    // A GPS jitter straight back east a moment later, still inside the
    // debounce window - held at the facing just committed, not flipped
    // right back.
    const bounceBack = nextSpriteFacing(
      first.facing,
      90,
      start + MIN_FLIP_INTERVAL_MS - 1,
      first.lastFlipAt
    )
    expect(bounceBack.facing).toBe(-1)

    // Once the window has actually passed, a real heading change is
    // trusted again.
    const afterWindow = nextSpriteFacing(
      bounceBack.facing,
      90,
      start + MIN_FLIP_INTERVAL_MS + 1,
      bounceBack.lastFlipAt
    )
    expect(afterWindow.facing).toBe(1)
  })

  it('simulated run: turns, a stop (null heading), then resumes - stays upright (no rotation concept at all) with only 1/-1 facing throughout', () => {
    // East -> turns south-ish (still reads as a hold near the dead zone,
    // not a real flip) -> turns west -> stops (null, GPS drops heading) ->
    // resumes east.
    const track = [
      { t: 0, heading: 95 }, // east
      { t: 2000, heading: 170 }, // near-south, dead zone - holds east
      { t: 4000, heading: 260 }, // clears west, debounce window open by now
      { t: 6000, heading: null }, // stopped - holds last facing
      { t: 6500, heading: NaN }, // bad fix - still holds
      { t: 9000, heading: 80 }, // resumes east, debounce window open
    ]
    let facing = 1
    let lastFlipAt = -Infinity
    const seen = []
    for (const { t, heading } of track) {
      ;({ facing, lastFlipAt } = nextSpriteFacing(
        facing,
        heading,
        t,
        lastFlipAt
      ))
      seen.push(facing)
      expect(facing === 1 || facing === -1).toBe(true)
    }
    expect(seen).toEqual([1, 1, -1, -1, -1, 1])
  })
})
