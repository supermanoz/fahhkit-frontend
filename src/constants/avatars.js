import windAvatar from '../assets/images/player-avatar-wind.png'
import blazeAvatar from '../assets/images/player-avatar-blaze.png'
import boltAvatar from '../assets/images/player-avatar-bolt.png'
import novaAvatar from '../assets/images/player-avatar-nova.png'
import stormAvatar from '../assets/images/player-avatar-storm.png'
import turboAvatar from '../assets/images/player-avatar-turbo.png'
import flashAvatar from '../assets/images/player-avatar-flash.png'
import pulseAvatar from '../assets/images/player-avatar-pulse.png'
import cometAvatar from '../assets/images/player-avatar-comet.png'
import cycloneAvatar from '../assets/images/player-avatar-cyclone.png'

// Map-marker avatar choice. Local-only (localStorage), not synced to the
// backend — free placeholders, not real Store inventory. The Store does
// have a real, server-synced "avatar character" category (HERO, an
// assetUrl image, alongside AVATAR_BORDER/TERRITORY_SHADE/TRAIL_COLOR/
// PROFILE_BACKGROUND/TERRITORY_EMOJI/PHRASE — see StoreItemCategoryConstant)
// - GamePage.jsx's equippedHero takes priority over this picker whenever
// the athlete owns and has equipped one. This picker just decides which
// free placeholder character shows on your own map marker when you haven't
// got (or don't want to use) a HERO or profile picture there.
//
// Every character is named after a synonym for "fast" — Territory Run is a
// running game, so the roster should read that way even though the
// characters themselves are just cosmetic art, not stat-bearing.
export const AVATARS = [
  { id: 'blaze', name: 'Blaze', src: blazeAvatar },
  { id: 'wind', name: 'Wind', src: windAvatar },
  { id: 'bolt', name: 'Bolt', src: boltAvatar },
  { id: 'nova', name: 'Nova', src: novaAvatar },
  { id: 'storm', name: 'Storm', src: stormAvatar },
  { id: 'turbo', name: 'Turbo', src: turboAvatar },
  { id: 'flash', name: 'Flash', src: flashAvatar },
  { id: 'pulse', name: 'Pulse', src: pulseAvatar },
  { id: 'comet', name: 'Comet', src: cometAvatar },
  { id: 'cyclone', name: 'Cyclone', src: cycloneAvatar },
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
