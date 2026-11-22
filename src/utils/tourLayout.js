// Geometry for the first-time tour (components/GameTour.jsx): measuring a
// target and placing the tooltip - kept here so it is unit-tested.
export const SPOT_PAD = 8 // breathing room around the target
const GAP = 14 // spotlight -> tooltip (room for the arrow)

export const sameRect = (a, b) =>
  a === b ||
  (a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)

// Visible = has a box and isn't hidden/transparent. null otherwise.
export function measureTarget(selector) {
  if (!selector) return null
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return null
  const cs = getComputedStyle(el)
  if (cs.visibility === 'hidden' || cs.display === 'none') return null
  if (Number(cs.opacity) < 0.05) return null
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  }
}

// Where the tooltip goes: above or below the spotlight (whichever has more
// room), clamped inside the safe area; the arrow keeps pointing at the
// target's centre however far the card had to slide sideways.
export function placeTooltip({ rect, card, bounds }) {
  const { left, top, right, bottom } = bounds
  const availW = right - left
  const w = Math.min(card.w, availW)
  if (!rect) {
    return {
      mode: 'center',
      left: left + (availW - w) / 2,
      top: Math.max(top, top + (bottom - top - card.h) / 2),
      arrowX: 0,
      width: w,
    }
  }
  const spot = {
    top: rect.y - SPOT_PAD,
    bottom: rect.y + rect.h + SPOT_PAD,
    cx: rect.x + rect.w / 2,
  }
  const roomBelow = bottom - (spot.bottom + GAP)
  const roomAbove = spot.top - GAP - top
  const below =
    roomBelow >= card.h || (roomAbove < card.h && roomBelow >= roomAbove)
  const room = below ? roomBelow : roomAbove
  const h = Math.min(card.h, Math.max(room, 120))
  const cardTop = below ? spot.bottom + GAP : spot.top - GAP - h
  const cardLeft = Math.min(
    Math.max(spot.cx - w / 2, left),
    Math.max(left, right - w)
  )
  return {
    mode: below ? 'below' : 'above',
    left: cardLeft,
    top: Math.max(top, cardTop),
    maxHeight: h,
    arrowX: Math.min(Math.max(spot.cx - cardLeft, 22), w - 22),
    width: w,
  }
}
