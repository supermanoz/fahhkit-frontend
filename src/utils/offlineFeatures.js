// Which parts of the game need the server. While offline these stay VISIBLE
// but shaded, and a tap answers "Needs internet" instead of opening them.
//
// Works offline: Training / Conquer recording, Me (cached profile + pending
// runs), Settings, heroes and owned items already on the device.
export const OFFLINE_BLOCKED_TABS = new Set([
  'leaderboard',
  'club', // also covers Club War
  'shop', // purchases + hero catalogue
  'mail',
  'race', // PvP
])

// Play modes that need a live opponent / the server.
export const OFFLINE_BLOCKED_PLAY = new Set(['race', 'club-war'])

export function needsInternet(tab) {
  return OFFLINE_BLOCKED_TABS.has(tab)
}
