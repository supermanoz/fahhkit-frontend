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

// Heading-up map rotation (the map turns to face the way you run): the whole
// feature - rotation, compass / reset-north button, first-time hint, the
// "Rotate map while running" setting, the hidden debug panel and the shared
// RUN / IDLE view machine. OFF: the map stays north-up exactly as before,
// nothing of it is mounted (no listeners, timers, oversized rotor or extra
// tiles) and any stored setting value is ignored. All the code stays in the
// app. Turn on: `true` here, or build with VITE_MAP_ROTATION=true.
export const MAP_ROTATION_ENABLED = import.meta.env?.VITE_MAP_ROTATION
  ? import.meta.env.VITE_MAP_ROTATION === 'true'
  : false
