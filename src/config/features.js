// Feature flags. Flip a flag here (or set the env var at build time) to bring a
// hidden feature back - nothing behind it is deleted.
//
// PvP: the Play-menu option, the PvP tab, the incoming-challenge pop-ups, the
// idle-nudge "battle" lines and the walkthrough mention. All PvP code, API calls
// and screens stay in the app; this only controls the ways INTO them.
// ON by default. To hide it again set `false` here, or build with
// VITE_SHOW_PVP=false.
export const SHOW_PVP_ENTRY = import.meta.env?.VITE_SHOW_PVP
  ? import.meta.env.VITE_SHOW_PVP !== 'false'
  : true

// PvP as a row in the menu's section DROP-DOWN (the picker that lists
// Leaderboard / Club / Mail / Me / Shop / Settings on phones). Off: PvP is
// reached from the round Play menu (SHOW_PVP_ENTRY above) instead. The PvP
// tab/screen itself is unchanged. Turn on: `true` here, or
// VITE_SHOW_PVP_IN_DROPDOWN=true.
export const SHOW_PVP_IN_DROPDOWN = import.meta.env?.VITE_SHOW_PVP_IN_DROPDOWN
  ? import.meta.env.VITE_SHOW_PVP_IN_DROPDOWN === 'true'
  : false
