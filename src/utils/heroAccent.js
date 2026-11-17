import { getHeroStageColor } from './heroStageColors'

// One accent colour per hero for the hero detail card (name underline, perk
// pill + bar, chips, active pagination dot). Derived from the same colour the
// hero's stage background uses (heroStageColors.js), so the card always
// matches the art - then pushed to a saturation/lightness that keeps WHITE
// text on the accent at AA contrast (>= 4.5:1): the stage colours are soft
// mid-tones, too light for a white "+5%" pill as they are.

function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, l }
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [r + m, g + m, b + m].map((v) => Math.round(v * 255))
}

const toHex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

// WCAG contrast of white text on this rgb colour.
export function contrastWithWhite(rgb) {
  return 1.05 / (luminance(rgb) + 0.05)
}

export const ACCENT_MIN_CONTRAST = 4.5

// { accent, soft, rgb } - accent: solid colour for pills/bars/underline;
// soft: a pale tint of it for chips and tracks.
export function getHeroAccent(heroName) {
  const { stageColor } = getHeroStageColor(heroName)
  const { h, s, l } = hexToHsl(stageColor)
  const sat = Math.min(0.85, Math.max(0.55, s * 1.2))
  let light = Math.min(l, 0.5)
  let rgb = hslToRgb(h, sat, light)
  while (contrastWithWhite(rgb) < ACCENT_MIN_CONTRAST && light > 0.1) {
    light -= 0.01
    rgb = hslToRgb(h, sat, light)
  }
  return {
    accent: toHex(rgb),
    soft: toHex(hslToRgb(h, Math.min(sat, 0.6), 0.92)),
    rgb,
  }
}
