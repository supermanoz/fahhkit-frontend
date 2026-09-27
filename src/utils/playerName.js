// How a player is named in the game: their nickname when the backend sends
// one, otherwise just the first word of their full name ("Manoj Basnet" ->
// "Manoj"). Only a few responses carry a nickname (the logged-in user,
// public profiles, club memberships, club war participants) - everything
// else (leaderboards, PvP, parcels, mail…) only has a full name, so those
// fall back to the first word.
export function playerName(nickname, fullName) {
  const nick = typeof nickname === 'string' ? nickname.trim() : ''
  if (nick) return nick
  const full = typeof fullName === 'string' ? fullName.trim() : ''
  return full ? full.split(/\s+/)[0] : ''
}

// Same, from an object with `nickname` / `fullName` fields.
export function playerNameOf(person) {
  return playerName(person?.nickname, person?.fullName)
}
