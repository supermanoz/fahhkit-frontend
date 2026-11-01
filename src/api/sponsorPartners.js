import { getJson, postJson } from './client'

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
