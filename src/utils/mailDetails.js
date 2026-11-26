import { getDisplayName } from './playerName'

// Structured facts of an event mail (MailResponse.data, see docs/mail-backend.md)
// as label/value rows for the detail view. Pure, never throws: a field that is
// null / missing / not the expected kind is simply left out (RUN_RESULT.
// coinsEarned is always null today and must never show as "0" or "null"), and
// an unknown type has no rows (the plain body is shown).

// The backend sends `data` (a map) and the same JSON as `payload` (a string).
export function mailData(item) {
  const d = item?.data
  if (d && typeof d === 'object' && !Array.isArray(d)) return d
  if (typeof item?.payload === 'string' && item.payload) {
    try {
      const parsed = JSON.parse(item.payload)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed
    } catch {
      /* not JSON: no facts */
    }
  }
  return {}
}

const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const text = (v) => {
  if (v == null) return null
  const s = String(v).trim()
  return s && s !== 'null' ? s : null
}
// Whole numbers get thousands separators; others at most 1 decimal.
const fmt = (n) =>
  Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 1 })

function distance(m) {
  const n = num(m)
  if (n == null || n <= 0) return null
  return n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${Math.round(n)} m`
}
export function formatSeconds(s) {
  const n = num(s)
  if (n == null || n < 0) return null
  const t = Math.round(n)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
// 163845 -> "163,845 m²"; above 100,000 m² -> "16.4 ha".
export function formatArea(v) {
  const n = num(v)
  if (n == null || n <= 0) return null
  return n > 100000
    ? `${(n / 10000).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} ha`
    : `${fmt(Math.round(n))} m²`
}
const area = formatArea
// The name the game shows for someone the server named by full name.
const shown = (v) => text(getDisplayName(typeof v === 'string' ? v : null))
const positive = (v) => {
  const n = num(v)
  return n == null || n <= 0 ? null : fmt(n)
}
const signed = (v) => {
  const n = num(v)
  return n == null || n === 0 ? null : `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`
}

const MODE = {
  CONQUER: 'Conquer',
  TRAINING: 'Training',
  PVP: 'PvP race',
  CLUB_WAR: 'Club war',
}
const RESULT = {
  WIN: 'Win',
  LOSE: 'Loss',
  DRAW: 'Draw',
  REFUND: 'Refunded',
}
const RUN_STATUS = { ACCEPTED: 'Counted', REJECTED: 'Not counted' }
const pick = (map, v) => {
  const s = text(v)
  return s ? (map[s.toUpperCase()] ?? null) : null
}

// [{ label, value }] - only rows that have a real value.
export function mailFacts(item) {
  const d = mailData(item)
  const rows = []
  const add = (label, value) => {
    if (value != null && value !== '') rows.push({ label, value })
  }
  switch (item?.type) {
    case 'RUN_RESULT':
      add('Mode', pick(MODE, d.mode))
      add('Result', pick(RUN_STATUS, d.status))
      add('Distance', distance(d.distanceMeters))
      add('Time', formatSeconds(d.durationSeconds))
      add('Score', positive(d.score))
      add('XP earned', positive(d.xpEarned))
      add('Coins earned', positive(d.coinsEarned)) // null today: hidden
      add('Territories claimed', positive(d.territoriesClaimed))
      break
    case 'PVP_RESULT':
      add('Result', pick(RESULT, d.result))
      add(
        'Opponent',
        getDisplayName({
          id: d.opponentId,
          nickname: d.opponentNickname,
          fullName: text(d.opponentName),
        })
      )
      add('Your time', formatSeconds(d.ownRaceTimeSeconds))
      add('Their time', formatSeconds(d.opponentRaceTimeSeconds))
      add('Stake', positive(d.stakeAmount))
      // 0 is a real payout on a loss, so it is kept once a result is known.
      add(
        'Payout',
        num(d.payoutAmount) != null ? fmt(num(d.payoutAmount)) : null
      )
      add(
        'New balance',
        num(d.newBalance) != null ? fmt(num(d.newBalance)) : null
      )
      break
    case 'CLUB_WAR_RESULT':
      add('Result', pick(RESULT, d.result))
      add('Your club', text(d.clubName))
      add('Opponent club', text(d.opponentClubName))
      if (num(d.ownScore) != null && num(d.opponentScore) != null) {
        add('Score', `${fmt(num(d.ownScore))} – ${fmt(num(d.opponentScore))}`)
      }
      add('Trophies', signed(d.trophyChange))
      break
    case 'TERRITORY_CAPTURED':
      add('Area', area(d.areaSqm))
      break
    case 'TERRITORY_LOST':
      add('Taken by', shown(d.byUserName))
      add('Area', area(d.areaSqm))
      break
    case 'LEVEL_UP':
      add('New level', positive(d.newLevel))
      add('Total XP', positive(d.xpTotal))
      break
    case 'REWARD':
      add('Coins', positive(d.coins))
      add(
        'Item',
        num(d.itemId) != null ? 'Item added to your collection' : null
      )
      break
    default:
      break
  }
  return rows
}

// The mail text the player reads: the server's own sentence, with every area
// shown readably ("163,845 m²" / "16.4 ha", not "163845 m²") and the full
// names the server writes into it shown the way the game names people
// (nickname, else first name).
export function mailDisplayBody(item) {
  let body = typeof item?.body === 'string' ? item.body : ''
  if (!body) return body
  body = body.replace(/(\d+(?:\.\d+)?)\s*m²/g, (m, n) => formatArea(n) || m)
  const d = mailData(item)
  for (const key of ['opponentName', 'byUserName']) {
    const full = text(d[key])
    const name = shown(d[key])
    if (full && name && full !== name) body = body.split(full).join(name)
  }
  return body
}
