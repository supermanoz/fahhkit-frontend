// The ONE switch for player-invisible diagnostics: debug lines in Settings >
// About (API address, territory check with coordinates), the hidden map debug
// panel, the "· test" environment label, and console output that would print
// coordinates or API addresses. ON only in `vite dev` or when a build sets
// VITE_DEBUG_INFO=1 - never set in .env.production / .env.staging, so release
// and TestFlight/Play builds show none of it.
export const DEBUG_INFO =
  Boolean(import.meta.env?.DEV) || import.meta.env?.VITE_DEBUG_INFO === '1'
