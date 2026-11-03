import { formatDistance, formatDuration, formatPace } from './run'

// Fixed logical card size (9:16, matches an Instagram Story frame so the
// download drops straight into a story with no cropping/letterboxing).
// The same drawShareCard() call renders both the on-screen <canvas> preview
// (scaled by devicePixelRatio) and the offscreen export canvas (scaled by
// EXPORT_SCALE) — same drawing code, so preview and download always match.
export const CARD_W = 432
export const CARD_H = 768
export const EXPORT_SCALE = 2.5 // -> 1080x1920 export resolution

// The one place the share card's brand wordmark text is set - every
// drawWordmark call (all 3 variants below, preview canvas and export
// canvas alike, since they run the exact same drawShareCard) reads from
// here, so renaming the brand only ever means touching this one line.
export const BRAND_NAME = 'RUN CONQUEST'

export const SHARE_VARIANTS = {
  TRANSPARENT: 'transparent',
  GRADIENT: 'gradient',
  MAP: 'map',
}

const EPSILON = 1e-6

// Projects {lat,lng} GPS points to canvas x/y, fit into a padded box.
// Longitude is scaled by cos(avgLat) so the route isn't stretched
// east-west, and y is flipped since latitude increases north but canvas y
// increases downward.
export function projectRoute(points, { width, height, padding = 40 }) {
  if (!points || points.length === 0) return []

  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lngScale = Math.cos((avgLat * Math.PI) / 180)
  const projected = points.map((p) => ({ px: p.lng * lngScale, py: p.lat }))

  const minPx = Math.min(...projected.map((p) => p.px))
  const maxPx = Math.max(...projected.map((p) => p.px))
  const minPy = Math.min(...projected.map((p) => p.py))
  const maxPy = Math.max(...projected.map((p) => p.py))

  const spanX = Math.max(maxPx - minPx, EPSILON)
  const spanY = Math.max(maxPy - minPy, EPSILON)

  const availW = Math.max(width - padding * 2, 1)
  const availH = Math.max(height - padding * 2, 1)
  const scale = Math.min(availW / spanX, availH / spanY)

  const routeW = spanX * scale
  const routeH = spanY * scale
  const offsetX = padding + (availW - routeW) / 2
  const offsetY = padding + (availH - routeH) / 2

  return projected.map((p) => ({
    x: offsetX + (p.px - minPx) * scale,
    y: offsetY + (maxPy - p.py) * scale,
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

// maxWidth shrinks fontSize (down to a 10px floor) to keep BRAND_NAME from
// clipping past the card edge - "RUN CONQUEST" is ~1.7x longer than the
// old "FAHHKIT", and each variant anchors this at a different x/align, so
// this can't just be eyeballed per call site the way the single old short
// word could.
export function drawWordmark(
  ctx,
  { x, y, fontSize = 22, fillStyle, align = 'left', maxWidth }
) {
  ctx.save()
  let size = fontSize
  ctx.font = `800 ${size}px 'Poppins', sans-serif`
  if (maxWidth) {
    const width = ctx.measureText(BRAND_NAME).width
    if (width > maxWidth) {
      size = Math.max(10, Math.floor(fontSize * (maxWidth / width)))
      ctx.font = `800 ${size}px 'Poppins', sans-serif`
    }
  }
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = fillStyle
  ctx.fillText(BRAND_NAME, x, y)
  ctx.restore()
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

export async function drawShareCard(
  ctx,
  { width, height, points, distance, duration, pace, variant }
) {
  await ensureWordmarkFontLoaded()
  ctx.clearRect(0, 0, width, height)

  const padding = 40

  if (variant === SHARE_VARIANTS.TRANSPARENT) {
    // Strava-style stacked layout: route up top, wordmark centered below
    // it, then a plain (no chip) stats row - rather than the route filling
    // the card with the wordmark pinned in a corner.
    const routeTop = 36
    const routeHeight = height * 0.56
    const projected = projectRoute(points, {
      width,
      height: routeHeight,
      padding: 70,
    }).map((p) => ({ ...p, y: p.y + routeTop }))
    drawRoutePath(ctx, projected, { strokeStyle: '#e8590c' })

    const wordmarkY = routeTop + routeHeight + 46
    drawWordmark(ctx, {
      x: width / 2,
      y: wordmarkY,
      fontSize: 26,
      fillStyle: '#ffffff',
      align: 'center',
      maxWidth: width - padding * 2,
    })

    drawStatsStack(ctx, {
      distance,
      duration,
      pace,
      x: width / 2,
      y: wordmarkY + 54,
      color: '#ffffff',
    })
  } else if (variant === SHARE_VARIANTS.GRADIENT) {
    ctx.fillStyle = makeBrandGradient(ctx, 0, 0, width, height)
    ctx.fillRect(0, 0, width, height)

    // Route up top, wordmark below it (not pinned above the route) - shrunk
    // a little from full-bleed so there's room underneath, but not as
    // compact as the transparent card's route.
    const routeTop = 36
    const routeHeight = height * 0.65
    const projected = projectRoute(points, {
      width,
      height: routeHeight,
      padding,
    }).map((p) => ({ ...p, y: p.y + routeTop }))
    drawRoutePath(ctx, projected, { strokeStyle: '#ffffff' })

    const wordmarkY = routeTop + routeHeight + 46
    drawWordmark(ctx, {
      x: width / 2,
      y: wordmarkY,
      fillStyle: '#ffffff',
      align: 'center',
      maxWidth: width - padding * 2,
    })
    drawStatsRow(ctx, {
      distance,
      duration,
      pace,
      x: padding,
      y: wordmarkY + 56,
      width: width - padding * 2,
      color: '#ffffff',
      chipBg: 'rgba(255,255,255,0.18)',
    })
  } else if (variant === SHARE_VARIANTS.MAP) {
    const projected = projectRoute(points, { width, height, padding })
    drawMapDecoration(ctx, { width, height })
    drawRoutePath(ctx, projected, { strokeStyle: '#e8590c', lineWidth: 5 })
    drawStartEndMarkers(ctx, projected)

    // Strava-style info panel: wordmark, a title, then a Distance/Time row
    // with Pace on its own row below - anchored over a dark gradient so it
    // stays legible over any part of the route.
    const barHeight = 220
    const bar = ctx.createLinearGradient(0, height - barHeight, 0, height)
    bar.addColorStop(0, 'rgba(20,18,16,0)')
    bar.addColorStop(1, 'rgba(20,18,16,0.78)')
    ctx.fillStyle = bar
    ctx.fillRect(0, height - barHeight, width, barHeight)

    drawWordmark(ctx, {
      x: width - padding,
      y: height - 165,
      fontSize: 16,
      fillStyle: 'rgba(255,255,255,0.9)',
      align: 'right',
      maxWidth: width - padding * 2,
    })

    ctx.save()
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = "700 24px 'Poppins', sans-serif"
    ctx.fillText('Run', padding, height - 124)
    ctx.restore()

    const rightColX = width / 2 + 10
    drawStatLabelValue(ctx, {
      label: 'Distance',
      value: formatDistance(distance),
      x: padding,
      y: height - 84,
    })
    drawStatLabelValue(ctx, {
      label: 'Time',
      value: formatDuration(duration),
      x: rightColX,
      y: height - 84,
    })
    drawStatLabelValue(ctx, {
      label: 'Pace',
      value: formatPace(pace),
      x: padding,
      y: height - 32,
    })
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
}) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W * EXPORT_SCALE
  canvas.height = CARD_H * EXPORT_SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
  await drawShareCard(ctx, {
    width: CARD_W,
    height: CARD_H,
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
