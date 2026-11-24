// The Play button's mode choice (Conquer / Training / PvP). With PvP hidden the
// remaining options are re-centred so there is no gap where it used to be.
const SPACING = 120 // px between neighbouring options (same as the 3-up layout)

export function visiblePlayOptions(options, showPvp) {
  const list = options.filter((o) => showPvp || o.tab !== 'race')
  if (list.length === options.length) return list
  const mid = (list.length - 1) / 2
  return list.map((o, i) => ({ ...o, x: Math.round((i - mid) * SPACING) }))
}

// The section drop-down's rows: the menu tabs, minus PvP while PvP isn't
// offered there (it stays in the round Play menu). Pure so it can be tested.
export function pickerTabs(tabs, showPvpInDropdown) {
  return tabs.filter((t) => showPvpInDropdown || t.id !== 'race')
}

// Collapsed-picker dot: what is waiting on tabs that are IN the list (PvP's
// count is left out when PvP isn't listed - it has its own badge on the round
// Play menu and the race-results pill).
export function pickerBadgeCount({
  menuTab,
  pvpCount,
  mailCount,
  showPvpInDropdown,
}) {
  return (
    (showPvpInDropdown && menuTab !== 'race' ? pvpCount : 0) +
    (menuTab === 'mail' ? 0 : mailCount)
  )
}
