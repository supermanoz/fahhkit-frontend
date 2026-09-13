import specterAvatar from '../assets/images/player-avatar-specter.png'
import blazeAvatar from '../assets/images/player-avatar-blaze.png'
import lunaAvatar from '../assets/images/player-avatar-luna.png'
import roninAvatar from '../assets/images/player-avatar-ronin.png'

// Map-marker avatar choice. Local-only (localStorage), not synced to the
// backend — the Store's real cosmetic categories (StoreItemCategoryConstant)
// are STICKER/AVATAR_BORDER/TERRITORY_SHADE/TRAIL_COLOR/PROFILE_BACKGROUND,
// borders/colors layered on the athlete's real profile picture, with no
// "avatar character" category. This picker just decides which placeholder
// character shows on your own map marker when you haven't got (or don't
// want to use) a profile picture there.
export const AVATARS = [
  { id: 'specter', name: 'Specter', src: specterAvatar },
  { id: 'blaze', name: 'Blaze', src: blazeAvatar },
  { id: 'luna', name: 'Luna', src: lunaAvatar },
]

// Shown in the shop but not selectable yet.
export const COMING_SOON_AVATARS = [
  { id: 'ronin', name: 'Ronin', src: roninAvatar },
]

const STORAGE_KEY = 'fahhkit_territory_avatar_id'

export function getAvatarById(id) {
  return AVATARS.find((a) => a.id === id) || null
}

export function loadAvatarId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveAvatarId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage full/unavailable — the choice just won't persist past reload.
  }
}
