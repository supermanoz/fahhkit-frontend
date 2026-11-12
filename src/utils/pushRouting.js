// Pure helpers for incoming push payloads (no Capacitor/React imports, so they
// are unit-testable). The backend sends data.type = BROADCAST | CLUB_WAR |
// TERRITORY_ATTACK (+ data.event for club wars: MATCHED | STARTED |
// ENDING_SOON) and an id per type.

// Where a tapped push should take the player, or null for an unknown type.
//   { tab }  -> open the in-game menu on that tab
//   { map }  -> close any menu and show the map
export function routeForPush(data) {
  switch (data?.type) {
    case 'BROADCAST':
      return { tab: 'mail' }
    case 'CLUB_WAR':
      return { tab: 'club' }
    case 'TERRITORY_ATTACK':
      return { map: true }
    default:
      return null
  }
}

// A tap can arrive before the player is logged in and the game has loaded
// (cold start). Hold it until both are true, then hand back the route once.
export function resolvePendingTap(pendingData, { isAuthed, gameReady }) {
  if (!pendingData || !isAuthed || !gameReady) return null
  return routeForPush(pendingData)
}

// Text for the in-app toast shown when a push arrives while the app is open.
export function foregroundToastText(notification) {
  const title = notification?.title?.trim()
  const body = notification?.body?.trim()
  if (title && body) return `${title} — ${body}`
  return title || body || null
}
