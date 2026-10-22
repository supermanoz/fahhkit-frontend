import { getJson, postJson } from './client'

// Admin/moderator only (see TerritoryRolloutController in the FahhKit
// backend) - which cities currently have Territory Run's territory-capture
// enabled.

export function getEnabledCities() {
  return getJson('/v1/territory-rollout/city/enabled')
}

export function setCityRolloutEnabled(cityId, enabled) {
  return postJson('/v1/territory-rollout/city/toggle', { cityId, enabled })
}

// Every imported city (not just enabled ones), paginated and name-searchable
// - each row carries its own `enabled` flag, so a moderator can find any
// city by name and toggle it on/off without already knowing its numeric id.
export function findTerritoryCities(
  pageNumber = 1,
  noOfRecords = 20,
  searchText = ''
) {
  return postJson('/v1/territory-rollout/city/list', {
    pageNumber,
    noOfRecords,
    search: searchText ? [{ field: 'name', value: searchText }] : undefined,
  })
}
