import { describe, expect, it } from 'vitest'
import {
  OVERLAY_BAND_GAP,
  OVERLAY_BLOCK_GAP,
  OVERLAY_LABEL_VALUE_GAP,
  OVERLAY_MARGIN,
  OVERLAY_SIZES,
  overlayLayout,
  projectRoute,
} from './shareCanvas'

const LOGO_ASPECT = 567 / 1200

describe('overlayLayout: logo / route / stats never overlap', () => {
  it.each(Object.entries(OVERLAY_SIZES))('%s card', (_name, { w, h }) => {
    const L = overlayLayout(w, h, LOGO_ASPECT)
    // logo: margin from the top edge, centred, inside the canvas
    expect(L.logo.y).toBeGreaterThanOrEqual(OVERLAY_MARGIN)
    expect(L.logo.x + L.logo.w / 2).toBeCloseTo(w / 2)
    expect(L.logo.x).toBeGreaterThanOrEqual(OVERLAY_MARGIN)
    // bands stack top to bottom with a gap between each
    expect(L.route.y).toBeGreaterThanOrEqual(
      L.logo.y + L.logo.h + OVERLAY_BAND_GAP - 1e-6
    )
    expect(L.route.y + L.route.h).toBeLessThanOrEqual(
      L.stats.top - OVERLAY_BAND_GAP + 1e-6
    )
    expect(L.route.h).toBeGreaterThan(h * 0.3) // route keeps real room
    // stats: bottom margin, 3 columns >= 16px apart, inside the side margins
    expect(L.stats.valueBaseline).toBeLessThanOrEqual(h - OVERLAY_MARGIN)
    expect(L.stats.cols).toHaveLength(3)
    L.stats.cols.slice(1).forEach((c, i) => {
      const prev = L.stats.cols[i]
      expect(c.x - (prev.x + prev.w)).toBeGreaterThanOrEqual(OVERLAY_BLOCK_GAP)
    })
    expect(L.stats.cols[0].x).toBeGreaterThanOrEqual(OVERLAY_MARGIN)
    const last = L.stats.cols[2]
    expect(last.x + last.w).toBeLessThanOrEqual(w - OVERLAY_MARGIN + 1e-6)
    // label small above the value, >= 12px between them
    expect(OVERLAY_LABEL_VALUE_GAP).toBeGreaterThanOrEqual(12)
    expect(L.stats.labelBaseline).toBeLessThan(L.stats.valueBaseline - 12)
  })

  it('the layout does not depend on the route (text size is fixed)', () => {
    const a = overlayLayout(432, 540, LOGO_ASPECT)
    const b = overlayLayout(432, 540, LOGO_ASPECT)
    expect(a).toEqual(b)
  })
})

describe('projectRoute padding', () => {
  const pts = [
    { lat: 0, lng: 0 },
    { lat: 0.01, lng: 0.01 },
  ]
  it('paddingX / paddingY keep a tall box clear on every side', () => {
    const out = projectRoute(pts, {
      width: 400,
      height: 300,
      paddingX: 48,
      paddingY: 36,
    })
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(48 - 1e-6)
      expect(p.x).toBeLessThanOrEqual(400 - 48 + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(36 - 1e-6)
      expect(p.y).toBeLessThanOrEqual(300 - 36 + 1e-6)
    }
  })
  it('plain `padding` still works as before', () => {
    const out = projectRoute(pts, { width: 200, height: 200, padding: 40 })
    expect(Math.min(...out.map((p) => p.x))).toBeGreaterThanOrEqual(40 - 1e-6)
  })
})
