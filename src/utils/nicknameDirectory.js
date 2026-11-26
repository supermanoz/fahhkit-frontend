// userId -> nickname, learned from every API response the app already makes.
//
// Some responses carry a nickname (club members, war participants, profiles,
// the logged-in user) and some only the real name (leaderboards, nearby
// players, challenges ...). Whenever ANY response names a player with a
// nickname, remember it so the other screens can show the nickname for the
// same player too (utils/playerName.js looks it up when a row has an id but no
// nickname). Memory only, bounded, cleared on sign-out. A response that has the
// nickname itself always wins and refreshes the entry. Once the backend sends
// nicknames everywhere this simply never has to fill in anything.
const MAX = 800
const directory = new Map()

const clean = (v) => (typeof v === 'string' ? v.trim() : '')

export function rememberNickname(id, nickname) {
  const key = id == null ? '' : String(id)
  const nick = clean(nickname)
  if (!key) return
  if (!nick) {
    // The player cleared their nickname: stop using the old one.
    directory.delete(key)
    return
  }
  directory.delete(key)
  directory.set(key, nick)
  if (directory.size > MAX) directory.delete(directory.keys().next().value)
}

export function lookupNickname(id) {
  if (id == null) return ''
  return directory.get(String(id)) || ''
}

export function clearNicknameDirectory() {
  directory.clear()
}

// Walks a parsed response and remembers every (id, nickname) pair in it:
//   { userId | id (+ fullName), nickname }      plain person objects
//   { <role>Id, <role>Nickname }                ownerId/ownerNickname, ...
// Bounded (depth and node count) so a big payload costs next to nothing.
export function harvestNicknames(data) {
  let budget = 4000
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 7 || budget-- <= 0) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    for (const key of Object.keys(node)) {
      const value = node[key]
      if (key === 'nickname' || key === 'nickName') {
        const id = node.userId ?? (node.fullName != null ? node.id : null)
        if (id != null && typeof value !== 'object') rememberNickname(id, value)
      } else if (key.length > 8 && key.endsWith('Nickname')) {
        const id = node[`${key.slice(0, -8)}Id`]
        if (id != null && typeof value !== 'object') rememberNickname(id, value)
      } else if (value && typeof value === 'object') {
        walk(value, depth + 1)
      }
    }
  }
  try {
    walk(data, 0)
  } catch {
    // a name hint must never break a request
  }
}
