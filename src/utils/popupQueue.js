// Popups that must never stack: only one shows at a time, in this order.
//   rollout-blocking -> welcome bonus -> first-time walkthrough -> daily reward
// `holding` says which of them currently hold the screen (showing, or queued and
// about to show). A popup may show only when none EARLIER in the order holds it.
export const POPUP_ORDER = Object.freeze([
  'rollout',
  'welcome',
  'tour',
  'daily',
])

export function popupBlockedBy(kind, holding = {}) {
  const i = POPUP_ORDER.indexOf(kind)
  if (i < 0) return false
  return POPUP_ORDER.slice(0, i).some((k) => Boolean(holding[k]))
}

// The one popup allowed to show right now (null = none).
export function popupToShow(holding = {}) {
  return POPUP_ORDER.find((k) => Boolean(holding[k])) ?? null
}
