// Guard: a person's name must reach the screen through getDisplayName /
// <DisplayName> (utils/playerName.js) so the nickname always wins. This fails
// when a game-facing file renders a raw real-name field inside JSX braces or a
// template string, e.g. {user.fullName} or `${rival.fullName} took this one`.
// Passing the fields INTO the helper ({ nickname, fullName }) is fine.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW =
  /\.(fullName|realName|firstName|lastName|ownerName|senderName|requesterName|leaderName|authorName)\b/
const HELPERS = /getDisplayName|playerNameOf|playerName\(|<DisplayName/

// Website / admin screens show real names on purpose (staff identify people),
// and a few game spots list the real name next to the @nickname by design.
const ALLOWED_FILES = [
  /^pages\/(?!GamePage)/, // website + admin pages
  /^components\/(Athlete|Event|Moderator|EmoteAdmin|HeroAdmin|Navbar|game-auth)/,
  /^components\/MailToolsPanel\.jsx$/, // "Full Name @nickname" lookup result
]
// Lookups/filters that read a name without displaying it.
// opponentName / challengerName are NOT checked: on views they are already the
// display name (hooks/usePvp.js mySide -> getDisplayName); the raw API fields
// are read only in partyOf (tested in displayName.test.js).
const ALLOWED_LINES = [/Nickname/, /toLowerCase\(\)/, /\.includes\(/, /key=/]

export function flagged(line) {
  if (!RAW.test(line)) return false
  const rendered =
    /\{[^{}]*\.[a-zA-Z]*Name[^{}]*\}|\$\{[^}]*\.[a-zA-Z]*Name/.test(line)
  if (!rendered) return false
  return !(HELPERS.test(line) || ALLOWED_LINES.some((re) => re.test(line)))
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.jsx$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

function offenders() {
  const out = []
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/')
    if (ALLOWED_FILES.some((re) => re.test(rel))) continue
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!RAW.test(line)) return
        const rendered =
          /\{[^{}]*\.[a-zA-Z]*Name[^{}]*\}|\$\{[^}]*\.[a-zA-Z]*Name/.test(line)
        if (!rendered) return
        if (HELPERS.test(line) || ALLOWED_LINES.some((re) => re.test(line)))
          return
        out.push(`${rel}:${i + 1}: ${line.trim()}`)
      })
  }
  return out
}

describe('names are rendered through getDisplayName', () => {
  it('no component renders a raw real-name field', () => {
    expect(offenders()).toEqual([])
  })
})

describe('the detector itself', () => {
  it.each([
    '<span>{user.fullName}</span>',
    '<b>{entry.fullName || "Runner"}</b>',
    'const t = `${rival.fullName} took this one`',
    '<p>{mail.senderName}</p>',
    '<p>Captain {club.leaderName}</p>',
  ])('flags %s', (line) => {
    expect(flagged(line)).toBe(true)
  })
  it.each([
    '<span>{getDisplayName(user)}</span>',
    '<span>{playerNameOf(entry)}</span>',
    '<DisplayName user={user} />',
    'fullName: member.fullName,',
    '.filter((e) => e.fullName?.toLowerCase().includes(q))',
  ])('allows %s', (line) => {
    expect(flagged(line)).toBe(false)
  })
})
