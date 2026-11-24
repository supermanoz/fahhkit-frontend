// One place that says how each mail `type` looks and behaves. The backend
// (MailTypeConstant) only creates NOTICE, CLUB_INVITE and STORE_ITEM_GRANT
// today; the rest are the types Manoj is asked to add (docs/mail-backend.md)
// so they render properly the day they arrive. ANY other string - or a missing
// type - falls back to a plain read-only message: never hidden, never given a
// Claim button (only types listed with claimable:true can be claimed).
export const MAIL_TYPE_INFO = Object.freeze({
  NOTICE: { label: 'Notice', icon: 'envelope', tone: 'info' },
  CLUB_INVITE: {
    label: 'Club invite',
    icon: 'users',
    tone: 'success',
    claimable: true,
  },
  STORE_ITEM_GRANT: {
    label: 'Gift',
    icon: 'gift',
    tone: 'warning',
    claimable: true,
  },
  RUN_RESULT: { label: 'Run result', icon: 'running', tone: 'success' },
  PVP_RESULT: { label: 'Race result', icon: 'swords', tone: 'warning' },
  CLUB_WAR_RESULT: { label: 'Club war', icon: 'flag', tone: 'warning' },
  TERRITORY_CAPTURED: { label: 'Territory', icon: 'flag', tone: 'success' },
  TERRITORY_LOST: { label: 'Territory', icon: 'flag', tone: 'danger' },
  LEVEL_UP: { label: 'Level up', icon: 'sparkle', tone: 'success' },
  // Coins from daily login / welcome are already in the wallet (no attachment);
  // a REWARD mail only shows Claim if the server attached something to claim.
  REWARD: { label: 'Reward', icon: 'coins', tone: 'warning', claimable: true },
  PROGRESS: { label: 'Progress', icon: 'bolt', tone: 'info' },
})

// Visual family of each type - drives the colour of the round icon badge on a
// mail row (MailPanel.css .cat-*): challenge, result, territory, reward, news
// (broadcast posts) or system (plain notices and anything unknown).
const MAIL_CATEGORY = Object.freeze({
  NOTICE: 'system',
  CLUB_INVITE: 'challenge',
  STORE_ITEM_GRANT: 'reward',
  RUN_RESULT: 'result',
  PVP_RESULT: 'challenge',
  CLUB_WAR_RESULT: 'challenge',
  TERRITORY_CAPTURED: 'territory',
  TERRITORY_LOST: 'territory',
  LEVEL_UP: 'result',
  REWARD: 'reward',
  PROGRESS: 'result',
})

export function mailCategory(type) {
  return Object.prototype.hasOwnProperty.call(MAIL_CATEGORY, type)
    ? MAIL_CATEGORY[type]
    : 'system'
}

const FALLBACK = Object.freeze({
  label: 'Message',
  icon: 'envelope',
  tone: 'info',
  claimable: false,
})

export function mailTypeInfo(type) {
  const info = Object.prototype.hasOwnProperty.call(MAIL_TYPE_INFO, type)
    ? MAIL_TYPE_INFO[type]
    : null
  return info ? { claimable: false, ...info } : FALLBACK
}

// Row title that never renders blank: server title, else the type's label.
export function mailTitle(item) {
  const title = String(item?.title ?? '').trim()
  return title || mailTypeInfo(item?.type).label
}

// CSS-safe class suffix (the server's type string goes into a class name).
export function mailTypeClass(type) {
  return String(type ?? 'unknown')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40)
}

// True only when the server really has something to claim on this mail: a
// claim-capable type WITH an attachment that is not yet claimed, and the mail
// not already resolved. Informational mails (run / race / war / territory /
// level / news / notices) never qualify - the backend has nothing to give for
// them (their claim would only fail with "nothing to claim").
export function isMailClaimable(item) {
  if (!item || !mailTypeInfo(item.type).claimable) return false
  if (['CLAIMED', 'DECLINED', 'DELETED'].includes(item.status)) return false
  const attachment = item.attachment
  return Boolean(attachment) && attachment.claimed !== true
}
