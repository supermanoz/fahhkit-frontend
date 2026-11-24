import { describe, expect, it } from 'vitest'
import {
  buildPickIndex,
  choosePick,
  containsPoint,
  CYCLE_WINDOW_MS,
  metersPerPixel,
  pickTerritories,
} from './territoryPicker'

const LAT = 27.7
const LNG = 85.3
const M_LAT = 111_320
const M_LNG = M_LAT * Math.cos((LAT * Math.PI) / 180)
// Square ring centred on (cLat,cLng) with half-size `h` metres.
const sq = (h, cLat = LAT, cLng = LNG) => [
  { lat: cLat - h / M_LAT, lng: cLng - h / M_LNG },
  { lat: cLat - h / M_LAT, lng: cLng + h / M_LNG },
  { lat: cLat + h / M_LAT, lng: cLng + h / M_LNG },
  { lat: cLat + h / M_LAT, lng: cLng - h / M_LNG },
]
const at = (dxM = 0, dyM = 0) => ({
  lat: LAT + dyM / M_LAT,
  lng: LNG + dxM / M_LNG,
})
const terr = (id, ring, extra = {}) => ({ id, points: ring, ...extra })
const ids = (hits) => hits.map((h) => h.territory.id)
const pick = (p, list, o) => pickTerritories(p, buildPickIndex(list), o)

describe('nested territories', () => {
  const outer = terr('outer', sq(100))
  const inner = terr('inner', sq(20))
  it('tap inside the inner -> inner first, outer next', () => {
    expect(ids(pick(at(0, 0), [outer, inner]))).toEqual(['inner', 'outer'])
  })
  it('tap in the outer only -> outer', () => {
    expect(ids(pick(at(60, 0), [outer, inner]))).toEqual(['outer'])
  })
  it('input order does not matter', () => {
    expect(ids(pick(at(0, 0), [inner, outer]))[0]).toBe('inner')
  })
  it('tap outside everything -> nothing', () => {
    expect(pick(at(500, 0), [outer, inner])).toEqual([])
  })
})

describe('holes', () => {
  const donut = terr('donut', sq(100), { holes: [sq(30)] })
  const inHole = terr('inHole', sq(20))
  it('a tap in the hole does NOT select the outer', () => {
    expect(pick(at(0, 0), [donut])).toEqual([])
  })
  it('a tap in the hole selects what sits in it, never the outer', () => {
    expect(ids(pick(at(0, 0), [donut, inHole]))).toEqual(['inHole'])
  })
  it('ground between the hole and the edge is still the outer', () => {
    expect(ids(pick(at(60, 0), [donut]))).toEqual(['donut'])
  })
  it("the hole's own edge still belongs to the outer", () => {
    expect(containsPoint(at(30, 0), donut.points, donut.holes)).toBe(true)
  })
})

describe('overlapping (not nested)', () => {
  const a = terr('a', sq(100, LAT, LNG), { area: 40000 })
  const b = terr('b', sq(60, LAT, LNG + 120 / M_LNG), { area: 14400 })
  it('overlap picks the smaller; each non-overlap picks its own', () => {
    expect(ids(pick(at(80, 0), [a, b]))).toEqual(['b', 'a'])
    expect(ids(pick(at(-80, 0), [a, b]))).toEqual(['a'])
    expect(ids(pick(at(170, 0), [a, b]))).toEqual(['b'])
  })
  it('uses the supplied area, falling back to the geometry', () => {
    const x = terr('x', sq(10)) // no area -> computed (~400 m2)
    const y = terr('y', sq(50), { area: 1 }) // lies about being tiny
    expect(ids(pick(at(0, 0), [x, y]))[0]).toBe('y')
    expect(ids(pick(at(0, 0), [x, terr('z', sq(50))]))[0]).toBe('x')
  })
})

describe('edge cases', () => {
  const t = terr('t', sq(50))
  it('on the boundary and on a vertex counts as inside', () => {
    expect(ids(pick(at(50, 0), [t]))).toEqual(['t'])
    expect(ids(pick(at(50, 50), [t]))).toEqual(['t'])
  })
  it('just outside the boundary is a miss (no padding for a big territory)', () => {
    expect(pick(at(51, 0), [t], { mpp: 0.5 })).toEqual([])
  })
  it('degenerate / empty input never throws', () => {
    expect(pick(at(), [])).toEqual([])
    expect(pick(at(), [terr('d', sq(10).slice(0, 2))])).toEqual([])
    expect(pick(at(), [{ id: 'n' }])).toEqual([])
    expect(pick(at(), undefined)).toEqual([])
  })
})

describe('finger padding (small territories only)', () => {
  // zoom 18 at this latitude ~0.53 m/px: a 10 m half-size square is ~38 px.
  const mpp = metersPerPixel(LAT, 18)
  const outer = terr('outer', sq(200))
  const tiny = terr('tiny', sq(5)) // ~19 px across: finger-sized
  it('a tap a few px outside a tiny territory still picks it', () => {
    const justOff = at(5 + 6 * mpp, 0) // 6 px outside its edge
    expect(ids(pick(justOff, [outer, tiny], { mpp }))).toEqual([
      'tiny',
      'outer',
    ])
  })
  it('too far away (beyond the pad) falls back to the outer', () => {
    const far = at(5 + 40 * mpp, 0)
    expect(ids(pick(far, [outer, tiny], { mpp }))).toEqual(['outer'])
  })
  it('no padding at all when mpp is unknown', () => {
    expect(ids(pick(at(5 + 6 * mpp, 0), [outer, tiny]))).toEqual(['outer'])
  })
  it('a tap exactly inside a small territory beats a smaller neighbour in reach', () => {
    const a = terr('a', sq(6, LAT, LNG)) // 12 m wide
    const b = terr('b', sq(3, LAT, LNG + 9.5 / M_LNG)) // tiny, just beside
    expect(ids(pick(at(5, 0), [a, b], { mpp }))[0]).toBe('a')
  })
  it('zoomed far out (container itself small): a near miss nested inside it still wins', () => {
    const farMpp = mpp * 8
    const o = terr('o', sq(30))
    const i = terr('i', sq(3))
    const miss = at(3 + 6 * farMpp, 0)
    expect(ids(pick(miss, [o, i], { mpp: farMpp }))[0]).toBe('i')
  })
  it('padding scales with zoom: the same 6px miss at another zoom', () => {
    const mpp15 = metersPerPixel(LAT, 15)
    const tiny15 = terr('tiny15', sq(5 * 8)) // ~same px size at zoom 15
    const off = at(5 * 8 + 6 * mpp15, 0)
    expect(ids(pick(off, [tiny15], { mpp: mpp15 }))).toEqual(['tiny15'])
  })
})

describe('tap again cycles outward', () => {
  const list = [terr('outer', sq(100)), terr('mid', sq(50)), terr('in', sq(10))]
  const hits = pick(at(0, 0), list)
  const base = { x: 100, y: 100, now: 1000 }
  it('innermost first, then outward, wrapping', () => {
    const s0 = choosePick(hits, null, base)
    expect(s0.hit.territory.id).toBe('in')
    const s1 = choosePick(hits, s0.state, { ...base, now: 1500 })
    expect(s1.hit.territory.id).toBe('mid')
    const s2 = choosePick(hits, s1.state, { ...base, now: 2000 })
    expect(s2.hit.territory.id).toBe('outer')
    const s3 = choosePick(hits, s2.state, { ...base, now: 2500 })
    expect(s3.hit.territory.id).toBe('in')
  })
  it('a different spot, a different stack or a long pause restarts', () => {
    const s0 = choosePick(hits, null, base)
    expect(
      choosePick(hits, s0.state, { x: 160, y: 100, now: 1200 }).hit.territory.id
    ).toBe('in')
    expect(
      choosePick(hits, s0.state, { ...base, now: 1000 + CYCLE_WINDOW_MS + 1 })
        .hit.territory.id
    ).toBe('in')
    const other = pick(at(30, 0), list) // only mid+outer here
    expect(
      choosePick(other, s0.state, { ...base, now: 1200 }).hit.territory.id
    ).toBe('mid')
  })
  it('nothing under the tap -> no pick and no state', () => {
    expect(choosePick([], null, base)).toEqual({ hit: null, state: null })
  })
  it('a single territory just keeps selecting itself', () => {
    const one = pick(at(60, 0), list.slice(0, 1))
    const s0 = choosePick(one, null, base)
    const s1 = choosePick(one, s0.state, { ...base, now: 1200 })
    expect(s1.hit.territory.id).toBe('outer')
  })
})

describe('metersPerPixel', () => {
  it('matches Web Mercator (~0.597 m/px at z18 on the equator, halves per zoom)', () => {
    expect(metersPerPixel(0, 18)).toBeCloseTo(0.597, 2)
    expect(metersPerPixel(0, 17) / metersPerPixel(0, 18)).toBeCloseTo(2, 5)
  })
})
