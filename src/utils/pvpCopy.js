// Plain-language copy and small pure helpers for the PvP arena screens
// (components/PvpPanel.jsx). Everything a player reads in the arena that is
// computed from data lives here, so wording is in one place and unit-tested.
// Short sentences, no jargon.

// Tier colours (blue / green / slate), a one-line pitch and a rough duration
// per distance. The estimate assumes an easy 6 min/km - it is a guide, not a
// promise.
export const MODE_INFO = {
  FIVE_HUNDRED_M: {
    tag: 'Sprint',
    pitch: 'A short, all-out dash. Over in minutes.',
    tier: 'blue',
    estMinutes: 3,
  },
  ONE_KM: {
    tag: 'Classic',
    pitch: 'Fast, but you still need a plan.',
    tier: 'green',
    estMinutes: 6,
  },
  FIVE_KM: {
    tag: 'Endurance',
    pitch: 'A long race for a big pot. Pace yourself.',
    tier: 'slate',
    estMinutes: 30,
  },
}

export function modeInfo(modeId) {
  return (
    MODE_INFO[modeId] || { tag: '', pitch: '', tier: 'slate', estMinutes: 0 }
  )
}

export function estimateLabel(minutes) {
  return minutes > 0 ? `About ${minutes} min` : ''
}

// The four steps of the setup flow, in the order the player walks them.
export const STEPS = ['Distance', 'Rival', 'Stake', 'Go']

// "You stake 100 · Winner takes 200" - null while the stake isn't a valid
// whole number of coins.
export function potSummary(stake) {
  const n = Number(stake)
  if (!Number.isInteger(n) || n < 1) return null
  return { stake: n, pot: n * 2 }
}

export function needCoinsLine(need, have) {
  return `Need ${need} coins - you have ${have}`
}

export function timeLeftLabel(expiresAt, now = Date.now()) {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - now
  if (Number.isNaN(ms) || ms <= 0) return 'Ending'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${Math.max(mins, 1)} min left`
  const hours = Math.floor(mins / 60)
  return hours < 24 ? `${hours} h left` : `${Math.floor(hours / 24)} d left`
}

export function distanceAwayLabel(meters) {
  if (!Number.isFinite(meters)) return ''
  return meters < 1000
    ? `${Math.round(meters)} m away`
    : `${(meters / 1000).toFixed(1)} km away`
}

// Hub stats. A player with no finished races sees friendly words, not dashes.
export function recordLabel(wins, losses, draws) {
  return `${wins}-${losses}${draws > 0 ? `-${draws}` : ''}`
}
export function winRateLabel(wins, played) {
  return played > 0 ? `${Math.round((wins / played) * 100)}%` : 'No races yet'
}

const HOW = {
  WIN_BY_TIME: 'faster time',
  WIN_BY_FORFEIT: 'the other runner gave up',
  MUTUAL_FORFEIT_REFUND: 'nobody finished, coins returned',
  TIE_REFUND: 'dead heat, coins returned',
}
export function resolutionText(type) {
  return HOW[type] || ''
}

// One race, from my side, as the words and the money.
//   kind: win | loss | draw | declined | cancelled | expired
//   coins: what it did to my balance (+stake for a win, -stake for a loss).
export function raceOutcome(challenge, userId) {
  const stake = Number(challenge.stakeAmount) || 0
  if (challenge.status === 'DECLINED')
    return { kind: 'declined', headline: 'Declined', detail: '', coins: 0 }
  if (challenge.status === 'CANCELLED')
    return { kind: 'cancelled', headline: 'Cancelled', detail: '', coins: 0 }
  if (challenge.status === 'EXPIRED')
    return {
      kind: 'expired',
      headline: 'Ran out of time',
      detail: '',
      coins: 0,
    }
  const how = resolutionText(challenge.resolutionType)
  if (!challenge.winnerId)
    return { kind: 'draw', headline: 'Draw', detail: how, coins: 0 }
  return challenge.winnerId === userId
    ? { kind: 'win', headline: 'Victory', detail: how, coins: stake }
    : { kind: 'loss', headline: 'Defeat', detail: how, coins: -stake }
}

export const isLive = (c) =>
  c.status === 'PENDING' || c.status === 'IN_PROGRESS'

// The small status chip on a race card: what it needs from me, in one or two
// words. tone: gold (your move) | green (run now) | blue (live) | slate.
export function statusChip(challenge, needsMe) {
  if (challenge.status === 'PENDING')
    return needsMe
      ? { label: 'Your move', tone: 'gold' }
      : { label: 'Waiting', tone: 'slate' }
  if (challenge.status === 'IN_PROGRESS')
    return needsMe
      ? { label: 'Run now', tone: 'green' }
      : { label: 'Live', tone: 'blue' }
  const o = raceOutcome(challenge, null)
  return { label: o.headline, tone: 'slate' }
}

// The screen for a race that ended WITHOUT being run: declined, cancelled or
// timed out while waiting. `declinedByMe` is what this device knows (the
// server does not say who declined). Without it: a challenger can only have
// been declined BY the rival (their own screen offers Cancel, not Decline);
// the person challenged is the one who declined.
// Returns null for anything that was actually raced / still live.
export function raceEndedView(challenge, { userId, rivalName, declinedByMe }) {
  if (!challenge) return null
  const rival = rivalName || 'Your rival'
  const iAmChallenger = challenge.challengerId === userId
  if (challenge.status === 'DECLINED') {
    const byMe = declinedByMe ?? !iAmChallenger
    return byMe
      ? {
          kind: 'declined',
          title: 'Challenge declined',
          message: `You declined ${rivalName ? `${rivalName}'s` : 'the'} challenge.`,
        }
      : {
          kind: 'declined',
          title: 'Challenge declined',
          message: `${rival} declined your challenge.`,
        }
  }
  if (challenge.status === 'CANCELLED') {
    const exp = challenge.expiresAt ? new Date(challenge.expiresAt) : null
    const timedOut = exp && exp.getTime() <= Date.now()
    return timedOut
      ? {
          kind: 'expired',
          title: 'Challenge expired',
          message: `${rival} did not answer in time.`,
        }
      : {
          kind: 'cancelled',
          title: 'Challenge cancelled',
          message: 'This challenge was cancelled.',
        }
  }
  return null
}
