// Local-only (localStorage), not synced to the backend — same reasoning as
// constants/avatars.js: no backend concept for this exists. Picks which
// OpenFreeMap vector style TerritoryMap's basemap renders with. All three
// styles share the same OpenMapTiles layer schema (label_city,
// label_country_1, etc.) that TerritoryMap.jsx's hideSymbolLayers() depends
// on, so switching styles doesn't break the label-hiding logic.
// Positron listed first - GamePage.jsx falls back to MAP_STYLES[0] when the
// player hasn't picked one yet, so first-in-array is the default map style.
export const MAP_STYLES = [
  {
    id: 'positron',
    name: 'Positron',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
  },
  {
    id: 'liberty',
    name: 'Liberty',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'bright',
    name: 'Bright',
    styleUrl: 'https://tiles.openfreemap.org/styles/bright',
  },
]

const STORAGE_KEY = 'fahhkit_territory_map_style_id'

export function getMapStyleById(id) {
  return MAP_STYLES.find((s) => s.id === id) || null
}

export function loadMapStyleId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveMapStyleId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage full/unavailable — the choice just won't persist past reload.
  }
}
