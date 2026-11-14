import { getJson, pingGet, postJson } from './client'

// Wired to the EXISTING backend Partner API (/v1/partner/*) - season
// sponsorship, not a dedicated banner entity. Picked over the richer
// /v1/sponsor-partner/* spec (bannerImageUrl+logoImageUrl split, sortOrder,
// date range, click tracking, file upload, delete) so the leaderboard
// banner + admin screen work against something real today instead of
// waiting on new backend work - see SponsorBannerCarousel.jsx/
// SponsorBannerAdminPanel.jsx for how each missing piece is worked around.
//
// Partner fields actually available: id, name, email, phone,
// socialLink1-5, imageUrl (a single plain URL string - no upload endpoint,
// the admin pastes one in), description, seasonNumber (required), active.
// No find/list/delete/toggle-active endpoint exists - getCurrentSeasonPartners
// is the only read, and "deactivate" and "edit" both go through the same
// partial-update endpoint (omitted fields are left untouched server-side).

export function getCurrentSeasonPartners() {
  return getJson('/v1/partner/current')
}

export function createPartner(partner) {
  return postJson('/v1/partner/admin', partner)
}

export function updatePartner(partner) {
  return postJson('/v1/partner/admin/update', partner)
}

// Banner "View" tap counter - the backend's tracked redirect (PartnerController
// .visitLink, GET /v1/partner/{id}/link/{index}) records the click and the
// user (when the token is sent) and answers 302 to the partner's link. Pinged
// in the background; the app still opens the link itself. At most one count
// per partner per 10 s so a double-tap doesn't count twice.
const CLICK_DEDUPE_MS = 10_000
const lastClickAt = new Map()

export function trackPartnerClick(partnerId, linkIndex = 1) {
  if (!partnerId) return
  const key = `${partnerId}:${linkIndex}`
  const now = Date.now()
  if (now - (lastClickAt.get(key) ?? 0) < CLICK_DEDUPE_MS) return
  lastClickAt.set(key, now)
  pingGet(`/v1/partner/${encodeURIComponent(partnerId)}/link/${linkIndex}`)
}

// Admin/moderator reports (ConversionReportController, /v1/moderator/report).
// Dates are yyyy-MM-dd, both ends inclusive.
// -> [{ partnerId, partnerName, linkIndex, visits, uniqueUsers }]
export function getPartnerLinkVisitReport(from, to) {
  return getJson(
    `/v1/moderator/report/partner-link-visits?from=${from}&to=${to}`
  )
}

// Every leaderboard open (which is where the banner carousel is shown) is
// logged server-side. -> [{ date, views, uniqueViewers }]
export function getLeaderboardViewReport(from, to) {
  return getJson(`/v1/moderator/report/leaderboard-views?from=${from}&to=${to}`)
}
