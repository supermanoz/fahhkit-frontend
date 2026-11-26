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

// THE helper for showing anyone's name - use it for every person's name that
// reaches the screen or is built into text ("X took this one", "vs X"). Rule:
//   1. the nickname, trimmed - if it is non-empty (a blank / whitespace-only
//      nickname counts as none);
//   2. else the real name: first word of fullName / name / username
//      ("Manoj Basnet" -> "Manoj"), or firstName + lastName;
//   3. else `fallback` ('' by default so callers can say 'a rival' / 'your
//      rival' in their own words; <DisplayName> defaults to "Runner").
// Accepts a user-like object, a plain string (treated as the real name), null
// or undefined. Field names seen in the API: nickname (UserResponse,
// UserPublicProfileResponse, ClubMembershipResponse, ClubWarParticipant*) with
// fullName beside it; name-only responses: fullName (leaderboards, nearby
// players, raid leaderboard), challengerName / opponentName, ownerName,
// senderName, requesterName, leaderName, authorName. `nickName` / `username`
// are accepted too. The player's own record works the same.
export const DEFAULT_NAME = 'Runner'

const text = (v) => (typeof v === 'string' ? v.trim() : '')

// Objects that wrap the actual person: { user: {...} }, { player: {...} } ...
const NESTED = ['user', 'player', 'owner', 'athlete', 'member', 'profile']

function pick(person) {
  const nick =
    text(person.nickname) || text(person.nickName) || text(person.displayName)
  if (nick) return { nick, real: '' }
  const real =
    text(person.fullName) ||
    text(person.name) ||
    text(person.username) ||
    text(person.userName) ||
    `${text(person.firstName)} ${text(person.lastName)}`.trim()
  return { nick: '', real }
}

export function getDisplayName(person, fallback = '') {
  if (typeof person === 'string') return playerName(null, person) || fallback
  if (!person || typeof person !== 'object') return fallback
  let { nick, real } = pick(person)
  if (nick) return nick
  // Nested person (the wrapper has no name of its own).
  if (!real) {
    for (const key of NESTED) {
      const inner = person[key]
      if (inner && typeof inner === 'object') {
        const got = pick(inner)
        if (got.nick) return got.nick
        if (got.real) {
          real = got.real
          break
        }
      }
    }
  }
  return real ? real.split(/\s+/)[0] : fallback
}

// Responses that name a person by role ship the pair as <role>Nickname +
// <role>Name (ownerNickname/ownerName, challengerNickname/challengerName,
// opponent..., sender..., requester..., leader...): one call, same rule.
export function getRoleDisplayName(obj, role, fallback = '') {
  if (!obj || typeof obj !== 'object') return fallback
  return getDisplayName(
    {
      nickname: obj[`${role}Nickname`],
      fullName: obj[`${role}Name`] ?? obj[`${role}FullName`],
    },
    fallback
  )
}

// `displayName(user)`: the same rule with the safe "Runner" fallback.
export function displayName(person) {
  return getDisplayName(person, DEFAULT_NAME)
}

// Initials of an already-chosen display string (what <Avatar name> receives):
// `count` 1 = first letter, 2 = first + last word's first letter. Emoji-safe.
export function initialsOfName(name, count = 1) {
  const words = text(name).split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const first = Array.from(words[0])[0]
  const last =
    count > 1 && words.length > 1 ? Array.from(words[words.length - 1])[0] : ''
  return (first + last).toUpperCase()
}

// Avatar initials for a person, built from the DISPLAY name (so a nickname-only
// player shows their nickname's letters, not their real name's): first + last
// initial when the display name has two or more words. '?' when nothing.
export function initials(person) {
  const name = getDisplayName(person, '')
  return initialsOfName(name, 2) || '?'
}

// Older name, kept so existing call sites don't churn - same function.
export const playerNameOf = getDisplayName
