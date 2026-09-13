import specterAvatar from '../assets/images/player-avatar-specter.png'
import blazeAvatar from '../assets/images/player-avatar-blaze.png'
import cyberwoolAvatar from '../assets/images/player-avatar-cyberwool.png'
import nightwatchAvatar from '../assets/images/player-avatar-nightwatch.png'
import shroudAvatar from '../assets/images/player-avatar-shroud.png'
import vanguardAvatar from '../assets/images/player-avatar-vanguard.png'
import twinfadeAvatar from '../assets/images/player-avatar-twinfade.png'
import neonAvatar from '../assets/images/player-avatar-neon.png'
import warheadAvatar from '../assets/images/player-avatar-warhead.png'
import wraithAvatar from '../assets/images/player-avatar-wraith.png'

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
  { id: 'cyberwool', name: 'Cyberwool', src: cyberwoolAvatar },
  { id: 'nightwatch', name: 'Nightwatch', src: nightwatchAvatar },
  { id: 'shroud', name: 'Shroud', src: shroudAvatar },
  { id: 'vanguard', name: 'Vanguard', src: vanguardAvatar },
  { id: 'twinfade', name: 'Twinfade', src: twinfadeAvatar },
  { id: 'neon', name: 'Neon', src: neonAvatar },
  { id: 'warhead', name: 'Warhead', src: warheadAvatar },
  { id: 'wraith', name: 'Wraith', src: wraithAvatar },
]

// Shown in the shop but not selectable yet.
export const COMING_SOON_AVATARS = []

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
