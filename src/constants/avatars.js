import specterAvatar from '../assets/images/player-avatar-specter.png'
import blazeAvatar from '../assets/images/player-avatar-blaze.png'
import lunaAvatar from '../assets/images/player-avatar-luna.png'
import roninAvatar from '../assets/images/player-avatar-ronin.png'

// Free avatars for the Territory Run shop.
export const AVATARS = [
  { id: 'specter', name: 'Specter', src: specterAvatar },
  { id: 'blaze', name: 'Blaze', src: blazeAvatar },
  { id: 'luna', name: 'Luna', src: lunaAvatar },
]

// Shown in the shop but not selectable yet.
export const COMING_SOON_AVATARS = [
  { id: 'ronin', name: 'Ronin', src: roninAvatar },
]

export const DEFAULT_AVATAR_ID = AVATARS[0].id

export function getAvatarById(id) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0]
}
