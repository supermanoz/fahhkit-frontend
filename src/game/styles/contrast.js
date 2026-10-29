// WCAG 2.x contrast-ratio calculator, used by the style guide's automated
// contrast table (Phase 2's "automated WCAG contrast table for every text/
// background pair in the tokens"). No external dependency - this is ~20
// lines of the standard relative-luminance formula.
function hexToRgb(hex) {
  const n = hex.replace('#', '')
  const v =
    n.length === 3
      ? n
          .split('')
          .map((c) => c + c)
          .join('')
      : n
  const int = parseInt(v, 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function channelLuminance(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  )
}

export function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA) + 0.05
  const lB = relativeLuminance(hexB) + 0.05
  return lA > lB ? lA / lB : lB / lA
}

// `large` = true for text that qualifies as "large" under WCAG (>=24px, or
// >=18.66px bold) - AA threshold drops from 4.5:1 to 3:1.
export function passesAA(ratio, large = false) {
  return ratio >= (large ? 3 : 4.5)
}
