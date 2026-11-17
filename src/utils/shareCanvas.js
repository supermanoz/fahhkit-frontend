import { formatDistance, formatDuration, formatPace } from './run'
import brandLogoSrc from '../assets/ui/brand/run_conquest_logo-1200.png'

// Fixed logical card size (9:16, matches an Instagram Story frame so the
// download drops straight into a story with no cropping/letterboxing).
// The same drawShareCard() call renders both the on-screen <canvas> preview
// (scaled by devicePixelRatio) and the offscreen export canvas (scaled by
// EXPORT_SCALE) — same drawing code, so preview and download always match.
export const CARD_W = 432
export const CARD_H = 768
export const EXPORT_SCALE = 2.5 // -> 1080x1920 export resolution

export const SHARE_VARIANTS = {
  TRANSPARENT: 'transparent',
  GRADIENT: 'gradient',
  MAP: 'map',
  // Strava-style sticker: big neon route behind centred stacked stats, on a
  // REAL transparent background, meant to be laid over the player's photo.
  OVERLAY: 'overlay',
}

// Logical sizes (432 wide, exported at EXPORT_SCALE -> 1080 wide). The
// overlay defaults to 4:5; story and square are available to callers.
export const OVERLAY_SIZES = {
  portrait: { w: 432, h: 540 }, // 1080x1350
  story: { w: 432, h: 768 }, // 1080x1920
  square: { w: 432, h: 432 }, // 1080x1080
}
export function cardSize(variant, size) {
  if (variant === SHARE_VARIANTS.OVERLAY) {
    return OVERLAY_SIZES[size] || OVERLAY_SIZES.portrait
  }
  return { w: CARD_W, h: CARD_H }
}

const EPSILON = 1e-6

// Projects {lat,lng} GPS points to canvas x/y, fit into a padded box.
// Longitude is scaled by cos(avgLat) so the route isn't stretched
// east-west, and y is flipped since latitude increases north but canvas y
// increases downward.
// minSpan (degrees) stops a tiny/stationary run being blown up into noise:
// the route is then drawn smaller than the box and centred.
export function projectRoute(
  points,
  { width, height, padding = 40, minSpan = EPSILON }
) {
  if (!points || points.length === 0) return []

  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lngScale = Math.cos((avgLat * Math.PI) / 180)
  const projected = points.map((p) => ({ px: p.lng * lngScale, py: p.lat }))

  const minPx = Math.min(...projected.map((p) => p.px))
  const maxPx = Math.max(...projected.map((p) => p.px))
  const minPy = Math.min(...projected.map((p) => p.py))
  const maxPy = Math.max(...projected.map((p) => p.py))

  const realX = maxPx - minPx
  const realY = maxPy - minPy
  const spanX = Math.max(realX, minSpan)
  const spanY = Math.max(realY, minSpan)

  const availW = Math.max(width - padding * 2, 1)
  const availH = Math.max(height - padding * 2, 1)
  const scale = Math.min(availW / spanX, availH / spanY)

  const routeW = spanX * scale
  const routeH = spanY * scale
  const offsetX = padding + (availW - routeW) / 2
  const offsetY = padding + (availH - routeH) / 2

  // When minSpan widened the box, keep the real route centred inside it.
  const padX = ((spanX - realX) / 2) * scale
  const padY = ((spanY - realY) / 2) * scale
  return projected.map((p) => ({
    x: offsetX + padX + (p.px - minPx) * scale,
    y: offsetY + padY + (maxPy - p.py) * scale,
  }))
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function makeBrandGradient(ctx, x0, y0, x1, y1) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  gradient.addColorStop(0, '#e8590c')
  gradient.addColorStop(1, '#ff8a3d')
  return gradient
}

// Poppins loads async via the Google Fonts <link> in index.html — drawing
// text before it swaps in would silently fall back to a system font.
export async function ensureWordmarkFontLoaded() {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await document.fonts.load('800 32px Poppins')
    await document.fonts.ready
  } catch {
    // Fall back silently to the default font if it's not available.
  }
}

// The brand mark is the logo image now (white lettering + black outline,
// flag on top), not a drawn "RUN CONQUEST" wordmark - drawBrandLogo below
// replaces every old drawWordmark call. Loaded once and cached as a
// resolved <img> (module-level, not per-render) - the 1200w export keeps
// it sharp at the high-res EXPORT_SCALE canvas, scaled down for the 1x
// on-screen preview. It's a bundled same-origin asset (import, not a
// remote URL), so there's no CORS/tainted-canvas concern and no
// crossOrigin attribute to set.
let brandLogoPromise = null
export function loadBrandLogo() {
  if (!brandLogoPromise) {
    brandLogoPromise = (async () => {
      const img = new Image()
      img.src = brandLogoSrc
      // Decoded, not just loaded - a canvas drawImage() on an undecoded
      // image can paint a blank frame the first time it's drawn, which is
      // exactly the "blank where the brand should be" bug this guards
      // against (see exportShareCardBlob/drawShareCard, both await this
      // before drawing anything).
      await img.decode()
      return img
    })()
  }
  return brandLogoPromise
}

// width is the logo's on-canvas width; height follows from its own
// aspect ratio (never stretched). align/valign anchor x/y the same way
// ctx.textAlign/textBaseline would for text, so call sites read the same
// as the old drawWordmark ones did.
export function drawBrandLogo(
  ctx,
  image,
  { x, y, width, align = 'left', valign = 'alphabetic', shadow = false }
) {
  const h = width * (image.naturalHeight / image.naturalWidth)
  const dx =
    align === 'center' ? x - width / 2 : align === 'right' ? x - width : x
  const dy = valign === 'middle' ? y - h / 2 : valign === 'bottom' ? y - h : y
  ctx.save()
  if (shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 2
  }
  ctx.drawImage(image, dx, dy, width, h)
  ctx.restore()
  return h
}

// ONE place to tune the logo size. Share of the card width and a cap in
// logical (1x) px, per layout family: the tall/story cards (every card this
// file draws today - one 9:16 card, three variants) and the compact
// square/wide family (no such card exists yet; kept here so a future one
// reads the same constant). Drawn from the 1200px asset, so it stays crisp
// at EXPORT_SCALE. Every layout below derives its logo/stat positions from
// this, so the extra height is reserved, not overlapped.
export const BRAND_LOGO_SIZE = {
  tall: { ratio: 0.48, max: 300 },
  compact: { ratio: 0.36, max: 250 },
  // The Overlay sticker: ~40% of the canvas width.
  overlay: { ratio: 0.4, max: 300 },
}
// Safe margin from the card edges, as a share of the width.
export const BRAND_LOGO_MIN_MARGIN = 0.04

function brandLogoWidth(cardWidth, layout = 'tall') {
  const { ratio, max } = BRAND_LOGO_SIZE[layout]
  return Math.min(
    cardWidth * ratio,
    max,
    cardWidth * (1 - BRAND_LOGO_MIN_MARGIN * 2)
  )
}

export function drawStatsRow(
  ctx,
  {
    distance,
    duration,
    pace,
    x,
    y,
    width,
    color,
    chipBg,
    labelFirst = false,
    valueFontSize = 17,
    labelFontSize = 10,
  }
) {
  const stats = [
    { value: formatDistance(distance), label: 'Distance' },
    { value: formatPace(pace), label: 'Pace' },
    { value: formatDuration(duration), label: 'Time' },
  ]
  const colWidth = width / stats.length

  if (chipBg) {
    ctx.save()
    ctx.fillStyle = chipBg
    roundRect(ctx, x, y - 32, width, 54, 14)
    ctx.fill()
    ctx.restore()
  }

  // labelFirst mirrors the Strava-style share card: a small caption sits
  // above the bold value, rather than below it.
  const valueDy = labelFirst ? 12 : -6
  const labelDy = labelFirst ? -11 : 13

  stats.forEach((stat, i) => {
    const cx = x + colWidth * i + colWidth / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.font = `700 ${valueFontSize}px 'Poppins', sans-serif`
    ctx.fillText(stat.value, cx, y + valueDy)
    ctx.globalAlpha = 0.75
    ctx.font = `600 ${labelFontSize}px -apple-system, sans-serif`
    ctx.fillText(stat.label.toUpperCase(), cx, y + labelDy)
    ctx.restore()
  })
}

// Centered label+value pairs stacked one per line (as opposed to
// drawStatsRow's side-by-side columns) - used by the transparent card so
// each stat gets its own full-width line under the wordmark.
function drawStatsStack(
  ctx,
  { distance, duration, pace, x, y, color, rowGap = 56 }
) {
  const stats = [
    { value: formatDistance(distance), label: 'Distance' },
    { value: formatPace(pace), label: 'Pace' },
    { value: formatDuration(duration), label: 'Time' },
  ]

  stats.forEach((stat, i) => {
    const cy = y + rowGap * i
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.globalAlpha = 0.75
    ctx.font = '600 11px -apple-system, sans-serif'
    ctx.fillText(stat.label.toUpperCase(), x, cy - 13)
    ctx.globalAlpha = 1
    ctx.font = "700 20px 'Poppins', sans-serif"
    ctx.fillText(stat.value, x, cy + 10)
    ctx.restore()
  })
}

// Left-aligned label-over-value pair, for the Strava-style asymmetric stat
// grid (as opposed to drawStatsRow's centered equal-width columns).
function drawStatLabelValue(ctx, { label, value, x, y }) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.75
  ctx.font = '600 11px -apple-system, sans-serif'
  ctx.fillText(label.toUpperCase(), x, y - 22)
  ctx.globalAlpha = 1
  ctx.font = "700 22px 'Poppins', sans-serif"
  ctx.fillText(value, x, y)
  ctx.restore()
}

export function drawRoutePath(
  ctx,
  projected,
  { strokeStyle, lineWidth = 6 } = {}
) {
  if (projected.length < 2) return
  ctx.save()
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  projected.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.stroke()
  ctx.restore()
}

// Neon-tube route for the exported card (the old orange route colour is
// gone from here; RunMap.jsx's live in-run map has its own, untouched).
// Canvas has no CSS box-shadow, so the glow is layered passes of the same
// stroke with ctx.shadow*, widest first, then the crisp tube and a thin
// hot core on top. NOTE: shadowBlur is NOT scaled by the context
// transform (unlike lineWidth), so it is multiplied by the current scale
// by hand - otherwise the 2.5x export would get a glow 2.5x thinner than
// the preview's relative to the card.
export const ROUTE_NEON = '#FF073A'
const ROUTE_NEON_CORE = '#FFE9EC'
const ROUTE_NEON_GLOWS = [
  { color: 'rgba(255, 7, 58, 0.7)', blur: 30 }, // outer bloom
  { color: ROUTE_NEON, blur: 15 }, // mid glow
  { color: ROUTE_NEON, blur: 6 }, // inner glow
]

export function drawNeonRoutePath(ctx, projected, { lineWidth = 4 } = {}) {
  if (projected.length < 2) return
  const m = ctx.getTransform()
  const k = Math.hypot(m.a, m.b) || 1
  const trace = () => {
    ctx.beginPath()
    projected.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
  }
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = ROUTE_NEON
  ctx.lineWidth = lineWidth
  for (const glow of ROUTE_NEON_GLOWS) {
    ctx.shadowColor = glow.color
    ctx.shadowBlur = glow.blur * k
    trace()
    ctx.stroke()
  }
  // The tube itself, no shadow, then the hot white-red core.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  trace()
  ctx.stroke()
  ctx.strokeStyle = ROUTE_NEON_CORE
  ctx.lineWidth = lineWidth * 0.375 // 1.5px at the 4px default
  trace()
  ctx.stroke()
  ctx.restore()
}

// Colors match RunMap.jsx's start/end marker colors exactly.
export function drawStartEndMarkers(
  ctx,
  projected,
  { startColor = '#2e7d32', endColor = '#c0392b', radius = 7 } = {}
) {
  if (projected.length === 0) return
  const drawDot = (p, fill) => {
    ctx.save()
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.restore()
  }
  drawDot(projected[0], startColor)
  if (projected.length > 1) drawDot(projected[projected.length - 1], endColor)
}

// Stylized map-style background — NOT real OpenStreetMap tiles (capturing
// live Leaflet tiles into a canvas is unreliable due to CORS tainting).
export function drawMapDecoration(ctx, { width, height }) {
  ctx.save()
  ctx.fillStyle = '#f2efe9'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(35, 32, 29, 0.06)'
  ctx.lineWidth = 1
  const gridStep = 28
  for (let gx = 0; gx <= width; gx += gridStep) {
    ctx.beginPath()
    ctx.moveTo(gx, 0)
    ctx.lineTo(gx, height)
    ctx.stroke()
  }
  for (let gy = 0; gy <= height; gy += gridStep) {
    ctx.beginPath()
    ctx.moveTo(0, gy)
    ctx.lineTo(width, gy)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(46, 125, 50, 0.16)'
  roundRect(ctx, width * 0.08, height * 0.06, width * 0.28, height * 0.1, 12)
  ctx.fill()
  ctx.restore()
}

// --- Overlay sticker ---------------------------------------------------
// White text with a thin dark outline and a soft shadow so it reads on any
// photo. Everything is in 1x logical units (the ctx carries the export
// scale); shadow blur/offset are not scaled by the transform, so they are
// multiplied by hand.
const OVERLAY_INK = 'rgba(20, 18, 16, 0.9)'

function shadowScale(ctx) {
  const m = ctx.getTransform()
  return Math.hypot(m.a, m.b) || 1
}

function drawOutlinedText(ctx, text, x, y, { font, fill, maxWidth, size }) {
  // Auto-shrink so long values never leave the canvas.
  let px = size
  ctx.font = font(px)
  while (px > 8 && ctx.measureText(text).width > maxWidth) {
    px -= 1
    ctx.font = font(px)
  }
  const k = shadowScale(ctx)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2
  ctx.strokeStyle = OVERLAY_INK
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = 6 * k
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2 * k
  ctx.strokeText(text, x, y)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  ctx.restore()
}

export function drawOverlayCard(
  ctx,
  { width, height, points, distance, duration, pace, logo }
) {
  // (1) Route, back layer: ~85% of the canvas, centred, room left for the
  // glow so it is never clipped at the edges.
  const pad = width * 0.075
  const projected = projectRoute(points, {
    width,
    height,
    padding: pad,
    minSpan: 0.0015,
  })
  drawNeonRoutePath(ctx, projected, { lineWidth: 4 })

  // (2)+(3) Logo then stacked stats, centred as one column.
  const rows = [
    { label: 'Distance', value: formatDistance(distance) },
    { label: 'Pace', value: formatPace(pace) },
    { label: 'Time', value: formatDuration(duration) },
  ]

  const logoW = brandLogoWidth(width, 'overlay')
  const logoH = logoW * (logo.naturalHeight / logo.naturalWidth)
  const LABEL = 14
  const VALUE = 32
  const ROW = 68 // label baseline to next label baseline
  // Visible height of the last row (label top to value descender); the
  // trailing gap after it is not counted, so the stack is optically centred.
  const LAST_ROW_H = LABEL + 9 + VALUE * 0.8 + 8
  const natural = logoH + 18 + (rows.length - 1) * ROW + LAST_ROW_H
  const avail = height * 0.9
  const k = Math.min(1, avail / natural)
  const total = natural * k
  const cx = width / 2
  let y = (height - total) / 2

  drawBrandLogo(ctx, logo, {
    x: cx,
    y,
    width: logoW * k,
    align: 'center',
    valign: 'alphabetic',
    shadow: true,
  })
  y += (logoH + 18) * k

  const maxW = width * 0.78
  rows.forEach((row) => {
    drawOutlinedText(ctx, row.label, cx, y + LABEL * k, {
      font: (px) => `600 ${px}px 'Poppins', -apple-system, sans-serif`,
      fill: 'rgba(255, 255, 255, 0.88)',
      maxWidth: maxW,
      size: LABEL * k,
    })
    drawOutlinedText(ctx, row.value, cx, y + (LABEL + 9 + VALUE * 0.8) * k, {
      font: (px) => `800 ${px}px 'Poppins', sans-serif`,
      fill: '#ffffff',
      maxWidth: maxW,
      size: (row.size || VALUE) * k,
    })
    y += ROW * k
  })
}

export async function drawShareCard(
  ctx,
  { width, height, points, distance, duration, pace, variant }
) {
  const [, logo] = await Promise.all([
    ensureWordmarkFontLoaded(),
    loadBrandLogo(),
  ])
  ctx.clearRect(0, 0, width, height)

  const padding = 40
  const logoW = brandLogoWidth(width)

  if (variant === SHARE_VARIANTS.OVERLAY) {
    drawOverlayCard(ctx, {
      width,
      height,
      points,
      distance,
      duration,
      pace,
      logo,
    })
  } else if (variant === SHARE_VARIANTS.TRANSPARENT) {
    // Strava-style stacked layout: route up top, logo centered below it,
    // then a plain (no chip) stats row - rather than the route filling
    // the card with the logo pinned in a corner. routeHeight is a touch
    // shorter than the old text-only layout needed, so the logo (taller
    // than a single line of text) still gets a clean gap on both sides
    // instead of crowding the route or the stats.
    const routeTop = 36
    const routeHeight = height * 0.52
    const projected = projectRoute(points, {
      width,
      height: routeHeight,
      padding: 70,
    }).map((p) => ({ ...p, y: p.y + routeTop }))
    drawNeonRoutePath(ctx, projected)

    const logoCenterY =
      routeTop +
      routeHeight +
      18 +
      (logoW * (logo.naturalHeight / logo.naturalWidth)) / 2
    const logoH = drawBrandLogo(ctx, logo, {
      x: width / 2,
      y: logoCenterY,
      width: logoW,
      align: 'center',
      valign: 'middle',
    })

    drawStatsStack(ctx, {
      distance,
      duration,
      pace,
      x: width / 2,
      y: logoCenterY + logoH / 2 + 44,
      color: '#ffffff',
    })
  } else if (variant === SHARE_VARIANTS.GRADIENT) {
    ctx.fillStyle = makeBrandGradient(ctx, 0, 0, width, height)
    ctx.fillRect(0, 0, width, height)

    // Route up top, logo below it (not pinned above the route) - shrunk a
    // little further than the transparent card's route since this card's
    // stats row (drawStatsRow, a single line) needs less vertical room
    // than that one's stacked stats do, leaving the saved space for the
    // logo instead.
    const routeTop = 36
    const routeHeight = height * 0.6
    const projected = projectRoute(points, {
      width,
      height: routeHeight,
      padding,
    }).map((p) => ({ ...p, y: p.y + routeTop }))
    drawRoutePath(ctx, projected, { strokeStyle: '#ffffff' })

    const logoCenterY =
      routeTop +
      routeHeight +
      18 +
      (logoW * (logo.naturalHeight / logo.naturalWidth)) / 2
    const logoH = drawBrandLogo(ctx, logo, {
      x: width / 2,
      y: logoCenterY,
      width: logoW,
      align: 'center',
      valign: 'middle',
    })
    drawStatsRow(ctx, {
      distance,
      duration,
      pace,
      x: padding,
      y: logoCenterY + logoH / 2 + 48,
      width: width - padding * 2,
      color: '#ffffff',
      chipBg: 'rgba(255,255,255,0.18)',
    })
  } else if (variant === SHARE_VARIANTS.MAP) {
    const logoH = logoW * (logo.naturalHeight / logo.naturalWidth)
    const creditRowHeight = 22
    const barHeight = 220 + logoH + 24 + creditRowHeight
    const logoBottom = height - 165 - creditRowHeight
    const logoRect = {
      x0: width - padding - logoW - 10,
      x1: width - padding + 10,
      y0: logoBottom - logoH - 10,
    }
    // The stats/credit text block under the logo spans the full width.
    const statsTop = height - 124 - creditRowHeight - 30

    // The route is projected across the full card, like before. Only if it
    // (with a little glow margin) would touch the logo or the stats block
    // is it re-projected into the clear area above them - never shrunk
    // otherwise.
    let projected = projectRoute(points, { width, height, padding })
    const hits = (pts) =>
      pts.some(
        (q) =>
          q.y + 8 > statsTop ||
          (q.x + 8 > logoRect.x0 &&
            q.x - 8 < logoRect.x1 &&
            q.y + 8 > logoRect.y0)
      )
    if (hits(projected)) {
      projected = projectRoute(points, {
        width,
        height: logoRect.y0 - 8,
        padding,
      })
    }
    drawMapDecoration(ctx, { width, height })
    drawNeonRoutePath(ctx, projected)
    drawStartEndMarkers(ctx, projected)

    // Strava-style info panel: logo, a title, then a Distance/Time row
    // with Pace on its own row below - anchored over a dark gradient so
    // it stays legible. barHeight grows to fit the logo instead of letting
    // it crowd the title/stats below it ("reserve space, don't overlap").
    const bar = ctx.createLinearGradient(0, height - barHeight, 0, height)
    bar.addColorStop(0, 'rgba(20,18,16,0)')
    bar.addColorStop(1, 'rgba(20,18,16,0.78)')
    ctx.fillStyle = bar
    ctx.fillRect(0, height - barHeight, width, barHeight)

    drawBrandLogo(ctx, logo, {
      x: width - padding,
      y: logoBottom,
      width: logoW,
      align: 'right',
      valign: 'bottom',
      shadow: true,
    })

    ctx.save()
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = "700 24px 'Poppins', sans-serif"
    ctx.fillText('Run', padding, height - 124 - creditRowHeight)
    ctx.restore()

    const rightColX = width / 2 + 10
    drawStatLabelValue(ctx, {
      label: 'Distance',
      value: formatDistance(distance),
      x: padding,
      y: height - 84 - creditRowHeight,
    })
    drawStatLabelValue(ctx, {
      label: 'Time',
      value: formatDuration(duration),
      x: rightColX,
      y: height - 84 - creditRowHeight,
    })
    drawStatLabelValue(ctx, {
      label: 'Pace',
      value: formatPace(pace),
      x: padding,
      y: height - 32 - creditRowHeight,
    })

    // Required tile-provider credit - its own dedicated row at the very
    // bottom of the bar (barHeight already grew by creditRowHeight to fit
    // it), not squeezed next to a stat where a long string risks
    // overlapping the value text. Clear of the logo (top of this bar),
    // the route (well above the bar entirely) and every stat (all pushed
    // up by creditRowHeight above this row).
    ctx.save()
    ctx.textAlign = 'left'
    ctx.globalAlpha = 0.7
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 9px -apple-system, sans-serif'
    ctx.fillText(
      '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap',
      padding,
      height - 14
    )
    ctx.restore()
  }
}

export async function exportShareCardBlob({
  points,
  distance,
  duration,
  pace,
  variant,
  mimeType = 'image/png',
  quality,
  size,
}) {
  const { w, h } = cardSize(variant, size)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * EXPORT_SCALE)
  canvas.height = Math.round(h * EXPORT_SCALE)
  const ctx = canvas.getContext('2d')
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
  await drawShareCard(ctx, {
    width: w,
    height: h,
    points,
    distance,
    duration,
    pace,
    variant,
  })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not export image')),
      mimeType,
      quality
    )
  })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
