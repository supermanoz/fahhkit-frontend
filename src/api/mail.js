import { deleteJson, postJson } from './client'

// Player inbox (see MailController in the FahhKit backend). Personal mail is
// NOTICE (read-only), CLUB_INVITE (claim = join the club, or decline) or
// STORE_ITEM_GRANT (claim = the item lands in Owned). Broadcasts are a
// separate, everyone-sees-it list with their own read state.

export function findMyMail(pageNumber = 1, noOfRecords = 30) {
  return postJson('/v1/mail/find', { pageNumber, noOfRecords })
}

export function readMail(id) {
  return postJson(`/v1/mail/${id}/read`, {})
}

export function claimMail(id) {
  return postJson(`/v1/mail/${id}/claim`, {})
}

// CLUB_INVITE only - the backend rejects declining anything else.
export function declineMail(id) {
  return postJson(`/v1/mail/${id}/decline`, {})
}

// Only allowed once the mail is no longer UNREAD.
export function deleteMail(id) {
  return deleteJson(`/v1/mail/${id}`)
}

export function findBroadcastMail(pageNumber = 1, noOfRecords = 20) {
  return postJson('/v1/mail/broadcast/find', { pageNumber, noOfRecords })
}

export function readBroadcastMail(id) {
  return postJson(`/v1/mail/broadcast/${id}/read`, {})
}
