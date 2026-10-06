import { getJson, postJson } from './client'

// Admin/moderator only (see TerritoryRolloutController in the FahhKit
// backend) - which cities currently have Territory Run's territory-capture
// enabled. There's no "browse/search all cities" endpoint yet, only this
// enabled list, so enabling a new city needs its numeric id known already.

export function getEnabledCities() {
  return getJson('/v1/territory-rollout/city/enabled')
}

export function setCityRolloutEnabled(cityId, enabled) {
  return postJson('/v1/territory-rollout/city/toggle', { cityId, enabled })
}
