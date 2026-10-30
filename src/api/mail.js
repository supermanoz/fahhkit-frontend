import { deleteJson, getJson, postForm, postJson } from './client'

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

// IMPORTANT_NOTICE broadcasts this user hasn't been shown up front yet -
// the backend already filters to just these (BroadcastMailReadState,
// per-user), so there's nothing to filter client-side. Call once per
// authenticated session, after the user is known - see
// hooks/useAnnouncementNotices.js.
export function getPendingNotices() {
  return getJson('/v1/mail/broadcast/notices/pending')
}

// Records that this user was shown this notice up front, per-user, on the
// backend - it never shows again for them, on any device, even after
// logout/login. Also marks it read (same as readBroadcastMail) so it
// doesn't additionally show as unread in the Mail tab.
export function markNoticeShown(id) {
  return postJson(`/v1/mail/broadcast/${id}/notice-shown`, {})
}

// Admin only - publishes a new broadcast every player sees in their News
// tab. image is optional.
export function publishBroadcast(title, body, image) {
  const formData = new FormData()
  formData.append('title', title)
  formData.append('body', body)
  if (image) formData.append('image', image)
  return postForm('/v1/mail/admin/broadcast', formData)
}

// Admin only - gifts one store item to a single player via a claimable
// STORE_ITEM_GRANT mail (same claim flow as any other grant in their inbox).
export function sendStoreItemGrant(recipientUserId, storeItemId, title, body) {
  return postJson('/v1/mail/admin/store-item-grant', {
    recipientUserId,
    storeItemId,
    title,
    body,
  })
}

// Admin only - a one-off personal NOTICE (read-only, not claimable) to a
// single player - the private counterpart to a broadcast.
export function sendNotice(recipientUserId, title, body) {
  return postJson('/v1/mail/admin/notice', { recipientUserId, title, body })
}
