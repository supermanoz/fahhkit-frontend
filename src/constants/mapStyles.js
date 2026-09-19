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

// A separate quick-toggle from the MAP_STYLES picker above (see GamePage's
// mute/exit-style dark-mode button) - a CSS filter applied over whichever
// light style is otherwise selected (see TerritoryMap.css .is-dark-mode),
// not a separate MAP_STYLES entry or OpenFreeMap's own "dark" vector style
// (which uses a different layer-id schema that breaks the English-only
// place-label logic, and whose own layers reference a sprite image missing
// from its sprite sheet - severely degrading render performance).
const MAP_DARK_MODE_KEY = 'fahhkit_territory_map_dark_mode'

export function loadMapDarkMode() {
  try {
    return localStorage.getItem(MAP_DARK_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveMapDarkMode(enabled) {
  try {
    localStorage.setItem(MAP_DARK_MODE_KEY, String(enabled))
  } catch {
    // Preference just won't persist past reload.
  }
}

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
