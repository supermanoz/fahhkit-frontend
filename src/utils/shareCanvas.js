import { formatDistance, formatDurationLabel, formatPace } from './run'
import brandLogoSrc from '../assets/ui/brand/run_conquest_logo-1200.png'
import { mapConfig } from '../config/mapProvider'
import { acquirePoster, posterConfig } from './heroPoster'

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
  // Full-bleed hero poster with the stats down the right (the default card).
  HERO_POSTER: 'hero-poster',
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
  {
    width,
    height,
    padding = 40,
    paddingX = padding,
    paddingY = padding,
    minSpan = EPSILON,
  }
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

  const availW = Math.max(width - paddingX * 2, 1)
  const availH = Math.max(height - paddingY * 2, 1)
  const scale = Math.min(availW / spanX, availH / spanY)

  const routeW = spanX * scale
  const routeH = spanY * scale
  const offsetX = paddingX + (availW - routeW) / 2
  const offsetY = paddingY + (availH - routeH) / 2

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
    // The Hero Poster card: Medium labels, Bold values.
    await document.fonts.load('500 33px Poppins')
    await document.fonts.load('700 86px Poppins')
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

// Largest font size (<= size) at which `text` fits in maxWidth - same font,
// weight and size as before unless the text is genuinely too wide ("1h 5m
// 12s" vs "6:47"), then it shrinks just enough.
function fitFontSize(ctx, text, makeFont, size, maxWidth) {
  let px = size
  ctx.font = makeFont(px)
  while (px > 8 && ctx.measureText(text).width > maxWidth) {
    px -= 0.5
    ctx.font = makeFont(px)
  }
  return px
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
    extraStats = [],
  }
) {
  const stats = [
    { value: formatDistance(distance), label: 'Distance' },
    { value: formatPace(pace), label: 'Pace' },
    { value: formatDurationLabel(duration), label: 'Time' },
    // Steps / climb, only when the run has them ([{label, value}]).
    ...extraStats,
  ]
  const colWidth = width / stats.length

  if (chipBg) {
    ctx.save()
    ctx.fillStyle = chipBg
    roundRect(ctx, x, y - 36, width, 62, 14)
    ctx.fill()
    ctx.restore()
  }

  // labelFirst mirrors the Strava-style share card: a small caption sits
  // above the bold value, rather than below it.
  const valueDy = labelFirst ? 13 : -6
  const labelDy = labelFirst ? -14 : 13

  stats.forEach((stat, i) => {
    const cx = x + colWidth * i + colWidth / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    const px = fitFontSize(
      ctx,
      stat.value,
      (n) => `700 ${n}px 'Poppins', sans-serif`,
      valueFontSize,
      colWidth - 12
    )
    ctx.font = `700 ${px}px 'Poppins', sans-serif`
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
  {
    distance,
    duration,
    pace,
    x,
    y,
    color,
    rowGap = 56,
    maxWidth = 340,
    extraStats = [],
  }
) {
  const stats = [
    { value: formatDistance(distance), label: 'Distance' },
    { value: formatPace(pace), label: 'Pace' },
    { value: formatDurationLabel(duration), label: 'Time' },
    ...extraStats,
  ]

  stats.forEach((stat, i) => {
    const cy = y + rowGap * i
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.globalAlpha = 0.75
    ctx.font = '600 11px -apple-system, sans-serif'
    ctx.fillText(stat.label.toUpperCase(), x, cy - 17)
    ctx.globalAlpha = 1
    const px = fitFontSize(
      ctx,
      stat.value,
      (n) => `700 ${n}px 'Poppins', sans-serif`,
      20,
      maxWidth
    )
    ctx.font = `700 ${px}px 'Poppins', sans-serif`
    ctx.fillText(stat.value, x, cy + 10)
    ctx.restore()
  })
}

// Left-aligned label-over-value pair, for the Strava-style asymmetric stat
// grid (as opposed to drawStatsRow's centered equal-width columns).
function drawStatLabelValue(ctx, { label, value, x, y, maxWidth = Infinity }) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.75
  ctx.font = '600 11px -apple-system, sans-serif'
  ctx.fillText(label.toUpperCase(), x, y - 22)
  ctx.globalAlpha = 1
  const px = fitFontSize(
    ctx,
    value,
    (n) => `700 ${n}px 'Poppins', sans-serif`,
    22,
    maxWidth
  )
  ctx.font = `700 ${px}px 'Poppins', sans-serif`
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

function drawOutlinedText(
  ctx,
  text,
  x,
  y,
  { font, fill, maxWidth, size, outline = 2 }
) {
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
  ctx.lineWidth = outline
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

// Overlay layout, in 1x logical px. Three bands that can never overlap
// because each gets its own slice of the canvas:
//   top    - the logo, OVERLAY_MARGIN from the edges
//   middle - the route, whatever height is left between logo and stats,
//            12% padding on every side (room for the neon glow too)
//   bottom - Distance | Pace | Time in one row of three equal columns
// Text sizes are fixed (the route's size never scales them); only a value
// too wide for its column steps down, all three together, to OVERLAY_VALUE_MIN.
export const OVERLAY_MARGIN = 24
export const OVERLAY_LABEL = 12
export const OVERLAY_VALUE = 30
export const OVERLAY_VALUE_MIN = 18
export const OVERLAY_LABEL_VALUE_GAP = 14 // label baseline -> value cap top
export const OVERLAY_BLOCK_GAP = 16 // between the three stat columns
export const OVERLAY_BAND_GAP = 12 // between logo/route/stats bands
const OVERLAY_ROUTE_PAD = 0.12
// label cap + gap + value cap + a little room for descenders
const OVERLAY_STATS_H =
  OVERLAY_LABEL * 0.75 + OVERLAY_LABEL_VALUE_GAP + OVERLAY_VALUE * 0.74 + 8

export function overlayLayout(width, height, logoAspect) {
  const m = OVERLAY_MARGIN
  let logoW = brandLogoWidth(width, 'overlay')
  // never let the logo eat more than ~17% of the height (square card)
  logoW = Math.min(logoW, (height * 0.17) / logoAspect)
  const logoH = logoW * logoAspect
  const logo = { x: (width - logoW) / 2, y: m, w: logoW, h: logoH }

  const statsTop = height - m - OVERLAY_STATS_H
  const colW = (width - m * 2 - OVERLAY_BLOCK_GAP * 2) / 3
  const cols = [0, 1, 2].map((i) => ({
    x: m + i * (colW + OVERLAY_BLOCK_GAP),
    w: colW,
  }))
  const valueBaseline = height - m - 8
  const labelBaseline =
    valueBaseline - OVERLAY_VALUE * 0.74 - OVERLAY_LABEL_VALUE_GAP

  const routeTop = logo.y + logo.h + OVERLAY_BAND_GAP
  const routeBottom = statsTop - OVERLAY_BAND_GAP
  const route = {
    x: 0,
    y: routeTop,
    w: width,
    h: Math.max(routeBottom - routeTop, 1),
  }
  return {
    logo,
    stats: { top: statsTop, cols, valueBaseline, labelBaseline },
    route,
  }
}

export function drawOverlayCard(
  ctx,
  { width, height, points, distance, duration, pace, logo }
) {
  const L = overlayLayout(width, height, logo.naturalHeight / logo.naturalWidth)

  // (1) Route: centred in its own band, 12% padding, never under any text.
  const projected = projectRoute(points, {
    width: L.route.w,
    height: L.route.h,
    paddingX: L.route.w * OVERLAY_ROUTE_PAD,
    paddingY: L.route.h * OVERLAY_ROUTE_PAD,
    minSpan: 0.0015,
  }).map((p) => ({ x: p.x, y: p.y + L.route.y }))
  drawNeonRoutePath(ctx, projected, { lineWidth: 4 })

  // (2) Logo, top centre.
  drawBrandLogo(ctx, logo, {
    x: L.logo.x,
    y: L.logo.y,
    width: L.logo.w,
    align: 'left',
    valign: 'alphabetic',
    shadow: true,
  })

  // (3) Stats: label small and muted above a large value.
  const stats = [
    { label: 'Distance', value: formatDistance(distance) },
    { label: 'Pace', value: formatPace(pace) },
    { label: 'Time', value: formatDurationLabel(duration) },
  ]
  const valueFont = (px) => `800 ${px}px 'Poppins', sans-serif`
  // One shared size so the three values read as a set; the widest decides.
  let px = OVERLAY_VALUE
  for (const stat of stats) {
    ctx.font = valueFont(px)
    while (
      px > OVERLAY_VALUE_MIN &&
      ctx.measureText(stat.value).width > L.stats.cols[0].w
    ) {
      px -= 1
      ctx.font = valueFont(px)
    }
  }
  stats.forEach((stat, i) => {
    const col = L.stats.cols[i]
    const cx = col.x + col.w / 2
    drawOutlinedText(ctx, stat.label.toUpperCase(), cx, L.stats.labelBaseline, {
      font: (n) => `600 ${n}px 'Poppins', -apple-system, sans-serif`,
      fill: 'rgba(255, 255, 255, 0.78)',
      maxWidth: col.w,
      size: OVERLAY_LABEL,
      outline: 1,
    })
    drawOutlinedText(ctx, stat.value, cx, L.stats.valueBaseline, {
      font: valueFont,
      fill: '#ffffff',
      maxWidth: col.w,
      size: px,
    })
  })
}

// --- Hero Poster -------------------------------------------------------
// Designed on a 1080x1920 canvas; drawHeroPosterCard scales that space onto
// whatever ctx it is given (432x768 logical, preview and export alike), so
// the on-screen card and the exported PNG are the same drawing.
export const POSTER_W = 1080
export const POSTER_H = 1920
// Instagram Story safe zone: nothing (text, logo, route) goes outside it.
export const STORY_SAFE = { top: 270, bottom: 340, side: 64 }
// The logo PNG carries transparent padding: 460 drawn = ~300 visible, top of
// the lettering lands at y~290 (inside the 270 safe line).
export const POSTER_LOGO_W = 460
export const POSTER_LOGO_TOP = 268
export const POSTER_STAT_PITCH = 367
// First label's centre. The reference image has it at 505 (logo block above,
// then the stack); 355 would sit on top of the logo (285 -> ~435).
export const POSTER_FIRST_LABEL_Y = 505
export const POSTER_LABEL_PX = 33
export const POSTER_VALUE_PX = 86
const POSTER_GOLD = '#FCC85C'
export const POSTER_ROUTE_BOX = { w: 350, h: 860, cy: 925 }
const POSTER_SCRIM = { none: 0, light: 0.28, medium: 0.45 }

// 4-point star with concave sides, r = tip radius.
function drawSparkle(ctx, cx, cy, r) {
  const c = r * 0.16
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.quadraticCurveTo(cx + c, cy - c, cx + r, cy)
  ctx.quadraticCurveTo(cx + c, cy + c, cx, cy + r)
  ctx.quadraticCurveTo(cx - c, cy + c, cx - r, cy)
  ctx.quadraticCurveTo(cx - c, cy - c, cx, cy - r)
  ctx.closePath()
  ctx.fill()
}

// Star in the middle, an 8px gap, then thin lines (22 -> 114 px from the
// centre) that fade out at their outer ends.
function drawGoldDivider(ctx, cx, cy) {
  ctx.fillStyle = POSTER_GOLD
  drawSparkle(ctx, cx, cy, 15)
  for (const dir of [-1, 1]) {
    const near = cx + dir * 22
    const far = cx + dir * 114
    const g = ctx.createLinearGradient(near, 0, far, 0)
    g.addColorStop(0, POSTER_GOLD)
    g.addColorStop(1, 'rgba(252, 200, 92, 0)')
    ctx.fillStyle = g
    ctx.fillRect(Math.min(near, far), cy - 1.75, 92, 3.5)
  }
  ctx.fillStyle = POSTER_GOLD
}

function drawPosterText(ctx, text, x, y, { font, size, maxWidth, fill }) {
  let px = size
  ctx.font = font(px)
  while (px > 12 && ctx.measureText(text).width > maxWidth) {
    px -= 1
    ctx.font = font(px)
  }
  const k = shadowScale(ctx)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = fill
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = 16 * k
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 3 * k
  ctx.fillText(text, x, y)
  ctx.restore()
}

// Where everything goes, in poster px. Pure, so it can be unit-tested.
export function posterLayout(heroKey, logoAspect = 0.5) {
  const cfg = posterConfig(heroKey)
  const half = cfg.colWidth / 2
  const cx = Math.min(
    Math.max(cfg.statsColumnCenterX, STORY_SAFE.side + half),
    POSTER_W - STORY_SAFE.side - half
  )
  const route = {
    x: cx - POSTER_ROUTE_BOX.w / 2,
    y: POSTER_ROUTE_BOX.cy - POSTER_ROUTE_BOX.h / 2,
    w: POSTER_ROUTE_BOX.w,
    h: POSTER_ROUTE_BOX.h,
  }
  const stats = [0, 1, 2].map((i) => {
    const labelY = POSTER_FIRST_LABEL_Y + POSTER_STAT_PITCH * i
    return {
      labelY,
      dividerY: labelY + 42,
      valueBaseline: labelY + 150,
    }
  })
  return {
    cx,
    colWidth: cfg.colWidth,
    scrim: cfg.scrim,
    logo: {
      x: cx - POSTER_LOGO_W / 2,
      y: POSTER_LOGO_TOP,
      w: POSTER_LOGO_W,
      h: POSTER_LOGO_W * logoAspect,
    },
    route,
    stats,
  }
}

export async function drawHeroPosterCard(
  ctx,
  { width, height, points, distance, duration, pace, logo, heroKey }
) {
  const L = posterLayout(heroKey, logo.naturalHeight / logo.naturalWidth)
  // The poster is decoded only for this one draw and closed straight after
  // (utils/heroPoster.js -> spriteSheetCache, graceMs 0).
  const held = acquirePoster(heroKey)
  let poster = null
  try {
    poster = await held.ready
  } catch {
    // No poster: the dark fallback below keeps the card readable.
  }
  try {
    ctx.save()
    ctx.scale(width / POSTER_W, height / POSTER_H)
    if (poster) {
      ctx.drawImage(poster, 0, 0, POSTER_W, POSTER_H)
    } else {
      ctx.fillStyle = '#14101f'
      ctx.fillRect(0, 0, POSTER_W, POSTER_H)
    }

    // Very soft dark scrim on the right edge only, never over the hero.
    const alpha = POSTER_SCRIM[L.scrim] ?? POSTER_SCRIM.light
    if (alpha > 0) {
      const g = ctx.createLinearGradient(POSTER_W * 0.55, 0, POSTER_W, 0)
      g.addColorStop(0, 'rgba(0, 0, 0, 0)')
      g.addColorStop(1, `rgba(0, 0, 0, ${alpha})`)
      ctx.fillStyle = g
      ctx.fillRect(POSTER_W * 0.55, 0, POSTER_W * 0.45, POSTER_H)
    }

    // Route first, so every bit of text sits on top of it.
    if (points && points.length >= 2) {
      const projected = projectRoute(points, {
        width: L.route.w,
        height: L.route.h,
        padding: 14, // room for the glow inside the box
        minSpan: 0.0015,
      }).map((p) => ({ x: p.x + L.route.x, y: p.y + L.route.y }))
      drawNeonRoutePath(ctx, projected, { lineWidth: 8 })
    }

    drawBrandLogo(ctx, logo, {
      x: L.logo.x,
      y: L.logo.y,
      width: L.logo.w,
      align: 'left',
      valign: 'alphabetic',
      shadow: true,
    })

    const values = [
      formatDistance(distance),
      formatPace(pace),
      formatDurationLabel(duration),
    ]
    const labels = ['Distance', 'Pace', 'Time']
    // Values may use the whole column but never cross the safe zone.
    const maxW = Math.min(
      L.colWidth,
      2 * (L.cx - STORY_SAFE.side),
      2 * (POSTER_W - STORY_SAFE.side - L.cx)
    )
    labels.forEach((label, i) => {
      const row = L.stats[i]
      drawPosterText(ctx, label, L.cx, row.labelY + 11, {
        font: (n) => `500 ${n}px 'Poppins', -apple-system, sans-serif`,
        size: POSTER_LABEL_PX,
        maxWidth: maxW,
        fill: '#ffffff',
      })
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
      ctx.shadowBlur = 8 * shadowScale(ctx)
      drawGoldDivider(ctx, L.cx, row.dividerY)
      ctx.restore()
      drawPosterText(ctx, values[i], L.cx, row.valueBaseline, {
        font: (n) => `700 ${n}px 'Poppins', -apple-system, sans-serif`,
        size: POSTER_VALUE_PX,
        maxWidth: maxW,
        fill: '#ffffff',
      })
    })
    ctx.restore()
  } finally {
    held.release()
  }
}

export async function drawShareCard(
  ctx,
  {
    width,
    height,
    points,
    distance,
    duration,
    pace,
    variant,
    extraStats = [],
    heroKey,
  }
) {
  const [, logo] = await Promise.all([
    ensureWordmarkFontLoaded(),
    loadBrandLogo(),
  ])
  ctx.clearRect(0, 0, width, height)

  const padding = 40
  const logoW = brandLogoWidth(width)

  if (variant === SHARE_VARIANTS.HERO_POSTER) {
    await drawHeroPosterCard(ctx, {
      width,
      height,
      points,
      distance,
      duration,
      pace,
      logo,
      heroKey,
    })
  } else if (variant === SHARE_VARIANTS.OVERLAY) {
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
      extraStats,
      // Tighter rows when steps / climb are added so five still fit.
      ...(extraStats.length ? { rowGap: 46 } : {}),
      distance,
      duration,
      pace,
      x: width / 2,
      y: logoCenterY + logoH / 2 + 44,
      color: '#ffffff',
      maxWidth: width * 0.78,
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
      extraStats,
      distance,
      duration,
      pace,
      x: padding,
      y: logoCenterY + logoH / 2 + 48,
      width: width - padding * 2,
      color: '#ffffff',
      chipBg: 'rgba(255,255,255,0.18)',
      labelFirst: true,
      valueFontSize: 18,
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
      value: formatDurationLabel(duration),
      x: rightColX,
      y: height - 84 - creditRowHeight,
      maxWidth: width - padding - rightColX,
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
    ctx.fillText(mapConfig.creditLine, padding, height - 14)
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
  extraStats = [],
  heroKey,
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
    extraStats,
    heroKey,
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
